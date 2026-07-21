"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getOrCreateCart } from "@/lib/cart-session";
import { pushOrderToShopify, ShopifyAdminError } from "@/lib/shopify";
import type { ShopifyOrderCreateInput } from "@/types/shopify";

const checkoutSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  email: z.string().email("Enter a valid email address"),
  phone: z.string().min(7, "Enter a valid phone number"),
  address1: z.string().min(1, "Address is required"),
  address2: z.string().optional(),
  city: z.string().min(1, "City is required"),
  province: z.string().optional(),
  country: z.string().min(1, "Country is required"),
  zip: z.string().min(1, "Postal/ZIP code is required"),
});

export type CheckoutFormInput = z.infer<typeof checkoutSchema>;

export type CheckoutResult =
  | { success: true; orderId: string; shopifyOrderName?: string }
  | { success: false; error: string; fieldErrors?: Record<string, string> };

/**
 * Cash on Delivery checkout pipeline (business requirement 3):
 * 1. Validate the form.
 * 2. Snapshot the current cart into a local Postgres Order row
 *    (status PENDING_COD) -- this is the durable record even if
 *    Shopify is unreachable.
 * 3. Attempt to push the order to Shopify Admin API, tagged
 *    "Payment: Cash on Delivery" for immediate fulfillment.
 * 4. On success, mark SYNCED_TO_SHOPIFY. On failure, mark SYNC_FAILED
 *    but do NOT fail the checkout for the customer -- the order is
 *    safely recorded locally and can be retried from the admin panel.
 */
export async function submitCodOrder(
  input: CheckoutFormInput
): Promise<CheckoutResult> {
  const parsed = checkoutSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      fieldErrors[issue.path.join(".")] = issue.message;
    }
    return { success: false, error: "Please fix the highlighted fields.", fieldErrors };
  }

  const data = parsed.data;

  let cart;
  try {
    cart = await getOrCreateCart();
  } catch (err) {
    console.error("[checkout] failed to load cart", err);
    return { success: false, error: "Couldn't load your cart. Please try again." };
  }

  if (!cart.lines.length) {
    return { success: false, error: "Your bag is empty." };
  }

  // Re-validate stock at time of order, not just at time of add-to-cart.
  for (const line of cart.lines) {
    if (line.variant.inventoryQty < line.quantity) {
      return {
        success: false,
        error: `"${line.variant.product.title}" no longer has enough stock. Please update your bag.`,
      };
    }
  }

  const subtotal = cart.lines.reduce(
    (sum, line) => sum + Number(line.variant.price) * line.quantity,
    0
  );

  const lineItemsSnapshot = cart.lines.map((line) => ({
    variantId: line.variant.id,
    shopifyVariantId: line.variant.shopifyId,
    title: `${line.variant.product.title} - ${line.variant.title}`,
    quantity: line.quantity,
    price: line.variant.price.toString(),
  }));

  // Step 1: durable local record, independent of Shopify's availability.
  let order;
  try {
    order = await prisma.order.create({
      data: {
        status: "PENDING_COD",
        customerName: `${data.firstName} ${data.lastName}`,
        customerEmail: data.email,
        customerPhone: data.phone,
        shippingAddress: {
          address1: data.address1,
          address2: data.address2 ?? "",
          city: data.city,
          province: data.province ?? "",
          country: data.country,
          zip: data.zip,
        },
        lineItems: lineItemsSnapshot,
        subtotal,
        total: subtotal, // extend here if shipping/tax calculation is added
        paymentMethod: "Cash on Delivery",
      },
    });
  } catch (err) {
    console.error("[checkout] failed to create local order record", err);
    return { success: false, error: "Couldn't record your order. Please try again." };
  }

  // Step 2: push to Shopify Admin API.
  const shopifyPayload: ShopifyOrderCreateInput = {
    order: {
      line_items: cart.lines.map((line) => ({
        variant_id: extractNumericShopifyId(line.variant.shopifyId),
        quantity: line.quantity,
      })),
      customer: {
        first_name: data.firstName,
        last_name: data.lastName,
        email: data.email,
        phone: data.phone,
      },
      shipping_address: {
        address1: data.address1,
        address2: data.address2,
        city: data.city,
        province: data.province,
        country: data.country,
        zip: data.zip,
        phone: data.phone,
        first_name: data.firstName,
        last_name: data.lastName,
      },
      financial_status: "pending",
      tags: "Payment: Cash on Delivery",
      note: `Cash on Delivery order. Local order ref: ${order.id}`,
      send_receipt: false,
      send_fulfillment_receipt: false,
    },
  };

  try {
    const shopifyResponse = await pushOrderToShopify(shopifyPayload);

    await prisma.order.update({
      where: { id: order.id },
      data: {
        status: "SYNCED_TO_SHOPIFY",
        shopifyOrderId: String(shopifyResponse.order.id),
        shopifyPushedAt: new Date(),
      },
    });

    // Clear the cart only after the order is durably recorded.
    await prisma.cartLine.deleteMany({ where: { cartId: cart.id } });

    return {
      success: true,
      orderId: order.id,
      shopifyOrderName: shopifyResponse.order.name,
    };
  } catch (err) {
    const message =
      err instanceof ShopifyAdminError ? err.message : "Unknown Shopify sync error";
    console.error("[checkout] Shopify order push failed", err);

    await prisma.order.update({
      where: { id: order.id },
      data: { status: "SYNC_FAILED", shopifyPushError: message },
    });

    // Customer-facing outcome: the order is still confirmed and safe --
    // it's recorded locally and will be retried/reviewed from /admin.
    // We still clear the cart since the order itself succeeded from
    // the customer's perspective.
    await prisma.cartLine.deleteMany({ where: { cartId: cart.id } });

    return {
      success: true,
      orderId: order.id,
    };
  }
}

function extractNumericShopifyId(gid: string): number {
  const match = gid.match(/(\d+)$/);
  const digits = match?.[1];
  if (!digits) throw new Error(`Malformed Shopify GID: ${gid}`);
  return parseInt(digits, 10);
}

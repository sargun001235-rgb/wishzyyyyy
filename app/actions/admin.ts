"use server";

import { prisma } from "@/lib/prisma";
import { pushOrderToShopify, ShopifyAdminError } from "@/lib/shopify";
import { invalidateProductCache, publishProductSyncEvent, redis } from "@/lib/redis";
import type { ShopifyOrderCreateInput } from "@/types/shopify";

export async function getDashboardData() {
  try {
    const [recentLogs, pendingOrders, syncFailedOrders, recentOrders, productCount] =
      await Promise.all([
        prisma.webhookLog.findMany({
          orderBy: { receivedAt: "desc" },
          take: 25,
        }),
        prisma.order.count({ where: { status: "PENDING_COD" } }),
        prisma.order.findMany({
          where: { status: "SYNC_FAILED" },
          orderBy: { createdAt: "desc" },
          take: 20,
        }),
        prisma.order.findMany({
          orderBy: { createdAt: "desc" },
          take: 20,
        }),
        prisma.product.count(),
      ]);

    let redisOk = true;
    try {
      await redis.ping();
    } catch {
      redisOk = false;
    }

    return {
      success: true as const,
      data: {
        recentLogs,
        pendingOrdersCount: pendingOrders,
        syncFailedOrders,
        recentOrders,
        productCount,
        redisOk,
      },
    };
  } catch (err) {
    console.error("[admin] getDashboardData failed", err);
    return { success: false as const, error: "Couldn't load dashboard data." };
  }
}

/**
 * Manually re-triggers a full catalog resync by clearing cache and
 * broadcasting a generic sync event. Actual product data is still
 * sourced from Shopify webhooks / Storefront API -- this just forces
 * connected clients and cache to refresh immediately.
 */
export async function triggerManualSync() {
  try {
    await invalidateProductCache();
    await publishProductSyncEvent({
      type: "product.updated",
      productId: "bulk-resync",
      timestamp: new Date().toISOString(),
    });
    return { success: true as const };
  } catch (err) {
    console.error("[admin] triggerManualSync failed", err);
    return { success: false as const, error: "Manual sync failed to trigger." };
  }
}

/**
 * Retries pushing a locally-recorded order to Shopify after a prior
 * SYNC_FAILED result (e.g. Shopify was briefly unreachable).
 */
export async function retryOrderPush(orderId: string) {
  try {
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order) {
      return { success: false as const, error: "Order not found." };
    }
    if (order.status === "SYNCED_TO_SHOPIFY") {
      return { success: false as const, error: "Order was already synced." };
    }

    const address = order.shippingAddress as Record<string, string>;
    const items = order.lineItems as {
      shopifyVariantId: string;
      quantity: number;
    }[];
    const [firstName, ...rest] = order.customerName.split(" ");

    const payload: ShopifyOrderCreateInput = {
      order: {
        line_items: items.map((item) => ({
          variant_id: extractNumericShopifyId(item.shopifyVariantId),
          quantity: item.quantity,
        })),
        customer: {
          first_name: firstName ?? order.customerName,
          last_name: rest.join(" ") || "-",
          email: order.customerEmail,
          phone: order.customerPhone,
        },
        shipping_address: {
          address1: address.address1 ?? "",
          address2: address.address2 ?? "",
          city: address.city ?? "",
          province: address.province ?? "",
          country: address.country ?? "",
          zip: address.zip ?? "",
          phone: order.customerPhone,
          first_name: firstName ?? order.customerName,
          last_name: rest.join(" ") || "-",
        },
        financial_status: "pending",
        tags: "Payment: Cash on Delivery",
        note: `Cash on Delivery order (retried). Local order ref: ${order.id}`,
        send_receipt: false,
        send_fulfillment_receipt: false,
      },
    };

    const response = await pushOrderToShopify(payload);

    await prisma.order.update({
      where: { id: order.id },
      data: {
        status: "SYNCED_TO_SHOPIFY",
        shopifyOrderId: String(response.order.id),
        shopifyPushedAt: new Date(),
        shopifyPushError: null,
      },
    });

    return { success: true as const, shopifyOrderName: response.order.name };
  } catch (err) {
    const message =
      err instanceof ShopifyAdminError ? err.message : "Unknown error retrying push.";
    console.error("[admin] retryOrderPush failed", err);
    await prisma.order
      .update({
        where: { id: orderId },
        data: { shopifyPushError: message },
      })
      .catch(() => {});
    return { success: false as const, error: message };
  }
}

function extractNumericShopifyId(gid: string): number {
  const match = gid.match(/(\d+)$/);
  const digits = match?.[1];
  if (!digits) throw new Error(`Malformed Shopify GID: ${gid}`);
  return parseInt(digits, 10);
}

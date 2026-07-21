"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getOrCreateCart } from "@/lib/cart-session";

const addLineSchema = z.object({
  variantId: z.string().min(1),
  quantity: z.number().int().min(1).max(50),
});

export type CartActionResult =
  | { success: true }
  | { success: false; error: string };

export async function addCartLine(input: {
  variantId: string;
  quantity: number;
}): Promise<CartActionResult> {
  const parsed = addLineSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Invalid item or quantity." };
  }

  try {
    const cart = await getOrCreateCart();
    const variant = await prisma.variant.findUnique({
      where: { id: parsed.data.variantId },
    });

    if (!variant) {
      return { success: false, error: "This item is no longer available." };
    }
    if (variant.inventoryQty < parsed.data.quantity) {
      return { success: false, error: "Not enough stock available." };
    }

    await prisma.cartLine.upsert({
      where: {
        cartId_variantId: { cartId: cart.id, variantId: variant.id },
      },
      create: {
        cartId: cart.id,
        variantId: variant.id,
        quantity: parsed.data.quantity,
      },
      update: {
        quantity: { increment: parsed.data.quantity },
      },
    });

    revalidatePath("/", "layout");
    return { success: true };
  } catch (err) {
    console.error("[cart] addCartLine failed", err);
    return { success: false, error: "Couldn't add item to cart. Please try again." };
  }
}

export async function updateCartLineQuantity(
  lineId: string,
  quantity: number
): Promise<CartActionResult> {
  if (quantity < 1 || quantity > 50) {
    return { success: false, error: "Quantity must be between 1 and 50." };
  }

  try {
    await prisma.cartLine.update({
      where: { id: lineId },
      data: { quantity },
    });
    revalidatePath("/", "layout");
    return { success: true };
  } catch (err) {
    console.error("[cart] updateCartLineQuantity failed", err);
    return { success: false, error: "Couldn't update quantity. Please try again." };
  }
}

export async function removeCartLine(lineId: string): Promise<CartActionResult> {
  try {
    await prisma.cartLine.delete({ where: { id: lineId } });
    revalidatePath("/", "layout");
    return { success: true };
  } catch (err) {
    console.error("[cart] removeCartLine failed", err);
    return { success: false, error: "Couldn't remove item. Please try again." };
  }
}

export async function getCartSnapshot() {
  try {
    const cart = await getOrCreateCart();
    return {
      success: true as const,
      cart: {
        id: cart.id,
        lines: cart.lines.map((line) => ({
          id: line.id,
          quantity: line.quantity,
          variant: {
            id: line.variant.id,
            title: line.variant.title,
            price: line.variant.price.toString(),
            imageUrl: line.variant.imageUrl,
            productTitle: line.variant.product.title,
            productHandle: line.variant.product.handle,
          },
        })),
      },
    };
  } catch (err) {
    console.error("[cart] getCartSnapshot failed", err);
    return { success: false as const, error: "Couldn't load your cart." };
  }
}

import { cookies } from "next/headers";
import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";

const CART_COOKIE_NAME = "ivory_cart_session";
const CART_TTL_DAYS = 30;

/**
 * Returns the current cart, creating both the cookie and the Postgres
 * row on first visit. This is the single source of truth cart persistence
 * relies on -- the cookie only carries an opaque session id, never cart
 * contents, so a cleared or tampered cookie can't corrupt cart state.
 */
export async function getOrCreateCart() {
  const cookieStore = cookies();
  let sessionId = cookieStore.get(CART_COOKIE_NAME)?.value;

  if (sessionId) {
    const existing = await prisma.cart.findUnique({
      where: { sessionId },
      include: { lines: { include: { variant: { include: { product: true } } } } },
    });
    if (existing && existing.expiresAt > new Date()) {
      return existing;
    }
  }

  // No valid cookie/cart -- issue a new session.
  sessionId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + CART_TTL_DAYS * 24 * 60 * 60 * 1000);

  const cart = await prisma.cart.create({
    data: { sessionId, expiresAt },
    include: { lines: { include: { variant: { include: { product: true } } } } },
  });

  cookieStore.set(CART_COOKIE_NAME, sessionId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: CART_TTL_DAYS * 24 * 60 * 60,
  });

  return cart;
}

export async function getCartSessionId(): Promise<string | null> {
  return cookies().get(CART_COOKIE_NAME)?.value ?? null;
}

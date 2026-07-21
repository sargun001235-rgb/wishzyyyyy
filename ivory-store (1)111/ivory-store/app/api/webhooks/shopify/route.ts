import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";
import { verifyShopifyWebhookHmac } from "@/lib/shopify";
import { invalidateProductCache, publishProductSyncEvent } from "@/lib/redis";
import type {
  ShopifyWebhookProductPayload,
  ShopifyWebhookProductDeletePayload,
  ShopifyWebhookTopic,
} from "@/types/shopify";

export const runtime = "nodejs"; // needed for crypto + long-lived Prisma connections

/**
 * POST /api/webhooks/shopify
 *
 * Handles products/create, products/update, products/delete.
 * Flow: verify HMAC -> de-dupe via payload hash -> upsert/delete in Postgres
 * -> invalidate Redis cache -> publish SSE event for connected clients.
 */
export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const hmacHeader = req.headers.get("x-shopify-hmac-sha256");
  const topic = req.headers.get("x-shopify-topic") as ShopifyWebhookTopic | null;

  // 1. Verify authenticity -- reject anything that isn't genuinely from Shopify.
  let isValid = false;
  try {
    isValid = await verifyShopifyWebhookHmac(rawBody, hmacHeader);
  } catch (err) {
    console.error("[webhook] HMAC verification threw an error", err);
    return NextResponse.json({ error: "Verification failed" }, { status: 500 });
  }

  if (!isValid) {
    console.warn("[webhook] rejected request with invalid HMAC signature");
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  if (!topic) {
    return NextResponse.json({ error: "Missing X-Shopify-Topic header" }, { status: 400 });
  }

  // 2. Idempotency guard -- Shopify can and will redeliver the same webhook.
  const payloadHash = crypto.createHash("sha256").update(rawBody).digest("hex");

  const existing = await prisma.webhookLog.findUnique({ where: { payloadHash } });
  if (existing) {
    return NextResponse.json({ status: "duplicate, already processed" }, { status: 200 });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch (err) {
    await logWebhook(topic, payloadHash, null, "failed", "Invalid JSON body");
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const log = await prisma.webhookLog.create({
    data: { topic, payloadHash, status: "received" },
  });

  try {
    switch (topic) {
      case "products/create":
      case "products/update": {
        const product = parsed as ShopifyWebhookProductPayload;
        await upsertProduct(product);
        await invalidateProductCache(product.handle);
        await publishProductSyncEvent({
          type: topic === "products/create" ? "product.created" : "product.updated",
          productId: String(product.id),
          handle: product.handle,
          timestamp: new Date().toISOString(),
        });
        break;
      }
      case "products/delete": {
        const payload = parsed as ShopifyWebhookProductDeletePayload;
        await deleteProduct(payload.id);
        await invalidateProductCache();
        await publishProductSyncEvent({
          type: "product.deleted",
          productId: String(payload.id),
          timestamp: new Date().toISOString(),
        });
        break;
      }
      default:
        console.warn(`[webhook] unhandled topic: ${topic}`);
    }

    await prisma.webhookLog.update({
      where: { id: log.id },
      data: { status: "processed", processedAt: new Date() },
    });

    return NextResponse.json({ status: "processed" }, { status: 200 });
  } catch (err) {
    console.error(`[webhook] failed to process ${topic}`, err);
    await prisma.webhookLog.update({
      where: { id: log.id },
      data: {
        status: "failed",
        errorMessage: err instanceof Error ? err.message : "Unknown error",
      },
    });
    // Return 500 so Shopify retries delivery per its standard backoff schedule.
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }
}

async function logWebhook(
  topic: string,
  payloadHash: string,
  shopifyId: string | null,
  status: string,
  errorMessage?: string
) {
  await prisma.webhookLog.create({
    data: { topic, payloadHash, shopifyId, status, errorMessage },
  });
}

async function upsertProduct(payload: ShopifyWebhookProductPayload) {
  const prices = payload.variants.map((v) => parseFloat(v.price)).filter((p) => !Number.isNaN(p));
  const priceMin = prices.length ? Math.min(...prices) : 0;
  const priceMax = prices.length ? Math.max(...prices) : 0;
  const shopifyId = `gid://shopify/Product/${payload.id}`;

  await prisma.product.upsert({
    where: { shopifyId },
    create: {
      shopifyId,
      handle: payload.handle,
      title: payload.title,
      descriptionHtml: payload.body_html ?? "",
      status: payload.status,
      vendor: payload.vendor,
      productType: payload.product_type,
      tags: payload.tags ? payload.tags.split(",").map((t) => t.trim()) : [],
      priceMin,
      priceMax,
      featuredImage: payload.image?.src ?? null,
      variants: {
        create: payload.variants.map((v) => ({
          shopifyId: `gid://shopify/ProductVariant/${v.id}`,
          title: v.title,
          sku: v.sku,
          price: parseFloat(v.price),
          compareAtPrice: v.compare_at_price ? parseFloat(v.compare_at_price) : null,
          inventoryQty: v.inventory_quantity ?? 0,
          options: { option1: v.option1, option2: v.option2, option3: v.option3 },
        })),
      },
    },
    update: {
      handle: payload.handle,
      title: payload.title,
      descriptionHtml: payload.body_html ?? "",
      status: payload.status,
      vendor: payload.vendor,
      productType: payload.product_type,
      tags: payload.tags ? payload.tags.split(",").map((t) => t.trim()) : [],
      priceMin,
      priceMax,
      featuredImage: payload.image?.src ?? null,
      // Variants are replaced wholesale on update to stay in sync with
      // Shopify's source of truth (handles additions/removals cleanly).
      variants: {
        deleteMany: {},
        create: payload.variants.map((v) => ({
          shopifyId: `gid://shopify/ProductVariant/${v.id}`,
          title: v.title,
          sku: v.sku,
          price: parseFloat(v.price),
          compareAtPrice: v.compare_at_price ? parseFloat(v.compare_at_price) : null,
          inventoryQty: v.inventory_quantity ?? 0,
          options: { option1: v.option1, option2: v.option2, option3: v.option3 },
        })),
      },
    },
  });
}

async function deleteProduct(shopifyNumericId: number) {
  const shopifyId = `gid://shopify/Product/${shopifyNumericId}`;
  // Deleting a product that's already gone is a no-op, not an error --
  // webhook redelivery must be idempotent.
  await prisma.product.deleteMany({ where: { shopifyId } });
}

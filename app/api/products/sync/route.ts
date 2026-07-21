import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { storefrontRequest, ShopifyStorefrontError } from "@/lib/shopify";
import { invalidateProductCache, publishProductSyncEvent } from "@/lib/redis";
import type { StorefrontProductNode } from "@/types/shopify";

export const runtime = "nodejs";

const PRODUCTS_QUERY = /* GraphQL */ `
  query AllProducts($cursor: String) {
    products(first: 50, after: $cursor) {
      pageInfo {
        hasNextPage
        endCursor
      }
      edges {
        node {
          id
          handle
          title
          descriptionHtml
          featuredImage {
            url
            altText
          }
          priceRange {
            minVariantPrice {
              amount
              currencyCode
            }
            maxVariantPrice {
              amount
              currencyCode
            }
          }
          variants(first: 25) {
            edges {
              node {
                id
                title
                availableForSale
                price {
                  amount
                  currencyCode
                }
              }
            }
          }
        }
      }
    }
  }
`;

interface ProductsQueryResponse {
  products: {
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
    edges: { node: StorefrontProductNode }[];
  };
}

/**
 * POST /api/products/sync
 * Admin-only manual full resync: pulls the entire catalog from the
 * Shopify Storefront API and upserts it locally. Used as a recovery
 * path if webhooks were missed (e.g. after downtime), separate from
 * the real-time webhook pipeline in /api/webhooks/shopify.
 */
export async function POST() {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let syncedCount = 0;
  let cursor: string | null = null;

  try {
    do {
      const response: ProductsQueryResponse = await storefrontRequest(PRODUCTS_QUERY, {
        cursor,
      });

      for (const { node } of response.products.edges) {
        await upsertFromStorefront(node);
        syncedCount += 1;
      }

      cursor = response.products.pageInfo.hasNextPage
        ? response.products.pageInfo.endCursor
        : null;
    } while (cursor);

    await invalidateProductCache();
    await publishProductSyncEvent({
      type: "product.updated",
      productId: "manual-full-sync",
      timestamp: new Date().toISOString(),
    });

    return NextResponse.json({ status: "ok", syncedCount });
  } catch (err) {
    const message =
      err instanceof ShopifyStorefrontError ? err.message : "Manual sync failed";
    console.error("[products/sync] failed", err);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

async function upsertFromStorefront(node: StorefrontProductNode) {
  const variantEdges = node.variants.edges;
  const prices = variantEdges.map((e) => parseFloat(e.node.price.amount));

  await prisma.product.upsert({
    where: { shopifyId: node.id },
    create: {
      shopifyId: node.id,
      handle: node.handle,
      title: node.title,
      descriptionHtml: node.descriptionHtml,
      priceMin: prices.length ? Math.min(...prices) : 0,
      priceMax: prices.length ? Math.max(...prices) : 0,
      currencyCode: node.priceRange.minVariantPrice.currencyCode,
      featuredImage: node.featuredImage?.url ?? null,
      variants: {
        create: variantEdges.map((e) => ({
          shopifyId: e.node.id,
          title: e.node.title,
          price: parseFloat(e.node.price.amount),
          inventoryQty: e.node.availableForSale ? 1 : 0, // Storefront API doesn't expose exact qty
          options: {},
        })),
      },
    },
    update: {
      title: node.title,
      descriptionHtml: node.descriptionHtml,
      priceMin: prices.length ? Math.min(...prices) : 0,
      priceMax: prices.length ? Math.max(...prices) : 0,
      featuredImage: node.featuredImage?.url ?? null,
    },
  });
}

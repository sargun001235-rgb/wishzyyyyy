import { GraphQLClient } from "graphql-request";
import type {
  ShopifyOrderCreateInput,
  ShopifyOrderCreateResponse,
} from "@/types/shopify";

// -----------------------------
// Env validation -- fail fast and loud rather than at first request
// -----------------------------
function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

// -----------------------------
// Storefront API (public catalog reads)
// -----------------------------
export function getStorefrontClient() {
  const domain = requireEnv("SHOPIFY_STORE_DOMAIN");
  const token = requireEnv("SHOPIFY_STOREFRONT_ACCESS_TOKEN");
  const version = process.env.SHOPIFY_STOREFRONT_API_VERSION ?? "2024-07";

  return new GraphQLClient(
    `https://${domain}/api/${version}/graphql.json`,
    {
      headers: {
        "X-Shopify-Storefront-Access-Token": token,
        "Content-Type": "application/json",
      },
    }
  );
}

export class ShopifyStorefrontError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = "ShopifyStorefrontError";
  }
}

export async function storefrontRequest<T>(
  query: string,
  variables?: Record<string, unknown>
): Promise<T> {
  try {
    const client = getStorefrontClient();
    return await client.request<T>(query, variables);
  } catch (err) {
    console.error("[shopify] storefront request failed", err);
    throw new ShopifyStorefrontError(
      "Failed to fetch data from Shopify Storefront API",
      err
    );
  }
}

// -----------------------------
// Admin API (order push, private -- server-only, never import into client code)
// -----------------------------
export class ShopifyAdminError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = "ShopifyAdminError";
  }
}

function getAdminBaseUrl(): string {
  const domain = requireEnv("SHOPIFY_STORE_DOMAIN");
  const version = process.env.SHOPIFY_ADMIN_API_VERSION ?? "2024-07";
  return `https://${domain}/admin/api/${version}`;
}

/**
 * Pushes a Cash on Delivery order to Shopify Admin API.
 * Tags the order "Payment: Cash on Delivery" so fulfillment staff
 * can identify and process it immediately, per business requirement 3.
 */
export async function pushOrderToShopify(
  input: ShopifyOrderCreateInput
): Promise<ShopifyOrderCreateResponse> {
  const token = requireEnv("SHOPIFY_ADMIN_API_ACCESS_TOKEN");
  const url = `${getAdminBaseUrl()}/orders.json`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "X-Shopify-Access-Token": token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
      // Admin API order creation should never hang indefinitely --
      // fail fast so the caller can mark the order SYNC_FAILED and retry later.
      signal: AbortSignal.timeout(15_000),
    });
  } catch (err) {
    throw new ShopifyAdminError(
      "Network error while pushing order to Shopify",
      undefined,
      err
    );
  }

  if (!response.ok) {
    let body: unknown = null;
    try {
      body = await response.json();
    } catch {
      // response body wasn't JSON -- ignore, we still have the status
    }
    throw new ShopifyAdminError(
      `Shopify Admin API rejected order creation (${response.status})`,
      response.status,
      body
    );
  }

  try {
    return (await response.json()) as ShopifyOrderCreateResponse;
  } catch (err) {
    throw new ShopifyAdminError(
      "Shopify Admin API returned an unparsable response",
      response.status,
      err
    );
  }
}

/**
 * Verifies the HMAC signature Shopify attaches to every webhook request.
 * Rejects the request outright if the signature doesn't match -- this
 * prevents forged webhook calls from writing into the local database.
 */
export async function verifyShopifyWebhookHmac(
  rawBody: string,
  hmacHeader: string | null
): Promise<boolean> {
  if (!hmacHeader) return false;

  const secret = requireEnv("SHOPIFY_WEBHOOK_SECRET");
  const encoder = new TextEncoder();

  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(rawBody)
  );

  const computedHmac = btoa(
    String.fromCharCode(...new Uint8Array(signature))
  );

  return timingSafeEqual(computedHmac, hmacHeader);
}

// Constant-time string comparison to avoid timing attacks on HMAC verification.
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

// -----------------------------
// Minimal typed slices of the Shopify Admin REST payloads we consume.
// These are intentionally narrow -- only the fields this app reads --
// rather than full Shopify SDK types, to keep webhook parsing explicit.
// -----------------------------

export interface ShopifyWebhookProductPayload {
  id: number;
  title: string;
  handle: string;
  body_html: string | null;
  vendor: string | null;
  product_type: string | null;
  status: "active" | "draft" | "archived";
  tags: string; // comma-separated in the REST payload
  variants: ShopifyWebhookVariant[];
  image: { src: string } | null;
  images: { src: string }[];
}

export interface ShopifyWebhookVariant {
  id: number;
  title: string;
  sku: string | null;
  price: string;
  compare_at_price: string | null;
  inventory_quantity: number;
  image_id: number | null;
  option1: string | null;
  option2: string | null;
  option3: string | null;
}

export interface ShopifyWebhookProductDeletePayload {
  id: number;
}

export type ShopifyWebhookTopic =
  | "products/create"
  | "products/update"
  | "products/delete";

// -----------------------------
// Admin API order creation (COD push)
// -----------------------------
export interface ShopifyOrderLineItemInput {
  variant_id: number;
  quantity: number;
}

export interface ShopifyOrderCreateInput {
  order: {
    line_items: ShopifyOrderLineItemInput[];
    customer: {
      first_name: string;
      last_name: string;
      email: string;
      phone: string;
    };
    shipping_address: {
      address1: string;
      address2?: string;
      city: string;
      province?: string;
      country: string;
      zip: string;
      phone: string;
      first_name: string;
      last_name: string;
    };
    financial_status: "pending";
    tags: string; // e.g. "Payment: Cash on Delivery"
    note: string;
    send_receipt: boolean;
    send_fulfillment_receipt: boolean;
  };
}

export interface ShopifyOrderCreateResponse {
  order: {
    id: number;
    order_number: number;
    name: string;
    admin_graphql_api_id: string;
  };
}

// -----------------------------
// Storefront GraphQL (catalog reads)
// -----------------------------
export interface StorefrontProductNode {
  id: string;
  handle: string;
  title: string;
  descriptionHtml: string;
  featuredImage: { url: string; altText: string | null } | null;
  priceRange: {
    minVariantPrice: { amount: string; currencyCode: string };
    maxVariantPrice: { amount: string; currencyCode: string };
  };
  variants: {
    edges: {
      node: {
        id: string;
        title: string;
        availableForSale: boolean;
        price: { amount: string; currencyCode: string };
      };
    }[];
  };
}

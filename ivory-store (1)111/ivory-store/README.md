# Ivory & Warm — Full-Stack Shopify Storefront

A custom Next.js 14 storefront with real-time bidirectional Shopify sync,
persistent server-side cart, a Cash on Delivery order pipeline, and a
protected admin dashboard.

## File structure

```
ivory-store/
├── app/
│   ├── layout.tsx                     Root layout, fonts, CartProvider
│   ├── page.tsx                       Storefront home (product grid)
│   ├── globals.css                    Design tokens, skeleton placeholders
│   ├── checkout/page.tsx              Multi-step COD checkout form
│   ├── admin/
│   │   ├── page.tsx                   Dashboard (server component, data load)
│   │   └── login/page.tsx             Admin login
│   ├── actions/
│   │   ├── cart.ts                    Cart server actions
│   │   ├── checkout.ts                COD order submission + Shopify push
│   │   ├── admin.ts                   Dashboard data, manual sync, retry push
│   │   └── admin-auth.ts              Login/logout
│   └── api/
│       ├── webhooks/shopify/route.ts  Webhook ingestion (create/update/delete)
│       ├── sse/route.ts               Server-Sent Events stream
│       └── products/sync/route.ts     Admin-triggered full catalog resync
├── components/
│   ├── store-header.tsx               Cart trigger + live sync indicator
│   ├── product/product-grid.tsx       Product grid w/ glass skeleton placeholders
│   ├── cart/
│   │   ├── cart-provider.tsx          Client cart context (hydrates from DB)
│   │   └── cart-drawer.tsx            Framer Motion slide-out drawer
│   └── admin/dashboard-client.tsx     Live dashboard UI
├── lib/
│   ├── prisma.ts                      Prisma client singleton
│   ├── redis.ts                       Redis client + pub/sub event helpers
│   ├── shopify.ts                     Storefront + Admin API clients, HMAC verify
│   ├── cart-session.ts                HTTP-only cookie session management
│   ├── auth.ts                        JWT session helpers (jose)
│   └── use-product-sync.ts            Client hook consuming the SSE stream
├── middleware.ts                      JWT guard for /admin/*
├── prisma/schema.prisma               Product, Variant, Cart, Order, WebhookLog
├── tailwind.config.ts                 Ivory-warm design tokens
└── .env.example
```

## How the four system requirements are wired together

**1. Real-time product sync (Shopify → site)**
`app/api/webhooks/shopify/route.ts` verifies the HMAC signature, de-dupes
by payload hash, upserts into Postgres, invalidates the Redis cache, and
publishes an event on the `product-sync-events` Redis channel.
`app/api/sse/route.ts` subscribes to that channel per connected client and
streams events over SSE. `lib/use-product-sync.ts` consumes the stream on
the client and calls Next's `router.refresh()` — an RSC re-fetch, not a
hard reload — so the catalog updates without flicker or lost scroll
position.

**2. Persistent cart**
`lib/cart-session.ts` issues an HTTP-only, secure, `sameSite=lax` cookie
holding only an opaque session id — cart *contents* live in Postgres
(`Cart` / `CartLine` models), so a refresh, a cleared localStorage, or a
new tab all resolve to the same durable cart. `components/cart/cart-provider.tsx`
hydrates from a server snapshot on mount and re-syncs after every mutation.

**3. Cash on Delivery order push**
`app/actions/checkout.ts` writes the order to Postgres first (durable
record, `PENDING_COD`), *then* attempts the Shopify Admin API push. If
Shopify is unreachable, the order is marked `SYNC_FAILED` but the
customer still sees a confirmed order — nothing is lost, and
`app/actions/admin.ts#retryOrderPush` lets an admin retry from the
dashboard. Every pushed order is tagged `Payment: Cash on Delivery`.

**4. Admin dashboard**
`middleware.ts` guards the entire `/admin/*` route group with a JWT
cookie verified via `jose` (edge-compatible). The dashboard shows live
SSE connection status, Redis health, webhook activity, pending/failed COD
orders with one-click retry, and a manual full-catalog resync trigger.

## Setup

```bash
npm install
cp .env.example .env       # fill in Shopify, Postgres, Redis, JWT values
npx prisma generate
npx prisma db push          # or `npm run db:migrate` for versioned migrations
npm run dev
```

### Generating the admin password hash

```bash
node -e "console.log(require('bcryptjs').hashSync('your-password', 10))"
```
Paste the output into `ADMIN_PASSWORD_HASH` in `.env`.

### Registering the Shopify webhook

Point Shopify's webhook settings (or the Admin API) at:
```
POST https://your-domain.com/api/webhooks/shopify
```
for the `products/create`, `products/update`, and `products/delete` topics,
using the same secret as `SHOPIFY_WEBHOOK_SECRET`.

## Not yet built

This scaffold covers the four core requirements end-to-end but is not a
complete storefront. Still to build: individual product detail pages,
search/filtering with URL-persisted query state, order confirmation
emails, inventory decrement on order placement, and a Shopify
`app/uninstalled` webhook for cleanup. Happy to build out any of these next.

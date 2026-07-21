import { prisma } from "@/lib/prisma";
import { StoreHeader } from "@/components/store-header";
import { ProductGrid } from "@/components/product/product-grid";
import { CartDrawer } from "@/components/cart/cart-drawer";

export const dynamic = "force-dynamic"; // catalog changes via webhook should show immediately on next load

export default async function HomePage() {
  let products: Awaited<ReturnType<typeof loadProducts>> = [];
  let loadError: string | null = null;

  try {
    products = await loadProducts();
  } catch (err) {
    console.error("[home] failed to load products", err);
    loadError = "We couldn't load the catalog right now. Please refresh.";
  }

  return (
    <>
      <StoreHeader />
      <main className="mx-auto max-w-6xl px-6 py-10">
        <div className="mb-10">
          <h1 className="font-display text-4xl text-ink">The Collection</h1>
          <p className="mt-2 max-w-md text-ink-muted">
            Considered pieces, warm materials, quiet craftsmanship.
          </p>
        </div>

        {loadError ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-red-800">
            {loadError}
          </div>
        ) : (
          <ProductGrid products={products} />
        )}
      </main>
      <CartDrawer />
    </>
  );
}

async function loadProducts() {
  const products = await prisma.product.findMany({
    where: { status: "active" },
    include: { variants: { orderBy: { price: "asc" }, take: 1 } },
    orderBy: { updatedAt: "desc" },
    take: 60,
  });

  return products.map((p) => ({
    id: p.id,
    handle: p.handle,
    title: p.title,
    priceMin: p.priceMin.toString(),
    currencyCode: p.currencyCode,
    featuredImage: p.featuredImage,
    firstVariantId: p.variants[0]?.id ?? null,
  }));
}

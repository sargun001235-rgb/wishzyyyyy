"use client";

import { motion } from "framer-motion";
import { useCart } from "@/components/cart/cart-provider";

export interface ProductListItem {
  id: string;
  handle: string;
  title: string;
  priceMin: string;
  currencyCode: string;
  featuredImage: string | null;
  firstVariantId: string | null;
}

export function ProductGrid({ products }: { products: ProductListItem[] }) {
  const { addItem, isPending } = useCart();

  if (products.length === 0) {
    return (
      <div className="rounded-xl border border-ivory-border bg-white/50 p-12 text-center">
        <p className="font-display text-lg text-ink">No products yet</p>
        <p className="mt-1 text-sm text-ink-muted">
          Once your Shopify catalog syncs, items will appear here automatically.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-4">
      {products.map((product, i) => (
        <motion.article
          key={product.id}
          layout
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: i * 0.03, ease: [0.22, 1, 0.36, 1] }}
          className="group"
        >
          <a href={`/products/${product.handle}`} className="block">
            <div className="media-skeleton aspect-square">
              {product.featuredImage && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={product.featuredImage}
                  alt={product.title}
                  className="h-full w-full rounded-xl object-cover transition duration-500 group-hover:scale-[1.03]"
                />
              )}
            </div>
            <h3 className="mt-3 text-sm text-ink">{product.title}</h3>
            <p className="text-sm text-ink-muted">
              ${product.priceMin} {product.currencyCode}
            </p>
          </a>

          {product.firstVariantId && (
            <button
              disabled={isPending}
              onClick={() => addItem(product.firstVariantId as string, 1)}
              className="mt-2 w-full rounded-full border border-ivory-border py-2 text-xs font-medium text-ink opacity-0 transition group-hover:opacity-100 hover:border-gold hover:bg-gold/10 disabled:opacity-50"
            >
              Add to bag
            </button>
          )}
        </motion.article>
      ))}
    </div>
  );
}

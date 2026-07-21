"use client";

import { ShoppingBag, Wifi, WifiOff } from "lucide-react";
import { useCart } from "@/components/cart/cart-provider";
import { useProductSync } from "@/lib/use-product-sync";

export function StoreHeader() {
  const { lines, openCart } = useCart();
  const { connectionStatus } = useProductSync();
  const itemCount = lines.reduce((sum, l) => sum + l.quantity, 0);

  return (
    <header className="sticky top-0 z-30 border-b border-ivory-border bg-ivory-bg/80 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <a href="/" className="font-display text-xl text-ink">
          Ivory &amp; Warm
        </a>

        <div className="flex items-center gap-4">
          <span
            title={connectionStatus === "connected" ? "Live catalog sync active" : "Reconnecting…"}
            className="text-ink-muted"
          >
            {connectionStatus === "connected" ? (
              <Wifi size={16} className="text-emerald-600" />
            ) : (
              <WifiOff size={16} className="text-gold-dark" />
            )}
          </span>

          <button
            onClick={openCart}
            aria-label="Open cart"
            className="relative flex items-center gap-2 rounded-full border border-ivory-border px-4 py-2 text-sm text-ink transition hover:bg-ivory-card"
          >
            <ShoppingBag size={16} />
            {itemCount > 0 && (
              <span className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-gold text-[10px] font-medium text-white">
                {itemCount}
              </span>
            )}
          </button>
        </div>
      </div>
    </header>
  );
}

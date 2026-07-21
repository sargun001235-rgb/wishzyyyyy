"use client";

import { AnimatePresence, motion } from "framer-motion";
import { X, Minus, Plus, Loader2 } from "lucide-react";
import { useCart } from "./cart-provider";

const BUTTERY = [0.22, 1, 0.36, 1] as const;

export function CartDrawer() {
  const { isOpen, closeCart, lines, updateQuantity, removeItem, isPending, error } =
    useCart();

  const subtotal = lines.reduce(
    (sum, line) => sum + parseFloat(line.variant.price) * line.quantity,
    0
  );

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            key="backdrop"
            className="fixed inset-0 z-40 bg-ink/20 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25, ease: BUTTERY }}
            onClick={closeCart}
          />

          <motion.aside
            key="drawer"
            role="dialog"
            aria-label="Shopping cart"
            className="fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col bg-ivory-bg shadow-card"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ duration: 0.45, ease: BUTTERY }}
          >
            <header className="flex items-center justify-between border-b border-ivory-border px-6 py-5">
              <h2 className="font-display text-xl text-ink">Your bag</h2>
              <button
                onClick={closeCart}
                aria-label="Close cart"
                className="rounded-full p-2 text-ink-muted transition hover:bg-ivory-card hover:text-ink"
              >
                <X size={20} />
              </button>
            </header>

            {error && (
              <div className="mx-6 mt-4 rounded-lg border border-gold/30 bg-gold/10 px-4 py-3 text-sm text-ink">
                {error}
              </div>
            )}

            <div className="flex-1 overflow-y-auto px-6 py-4">
              {lines.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center text-center">
                  <p className="font-display text-lg text-ink">Your bag is empty</p>
                  <p className="mt-1 text-sm text-ink-muted">
                    Items you add will appear here.
                  </p>
                </div>
              ) : (
                <ul className="space-y-5">
                  <AnimatePresence initial={false}>
                    {lines.map((line) => (
                      <motion.li
                        key={line.id}
                        layout
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                        transition={{ duration: 0.3, ease: BUTTERY }}
                        className="flex gap-4"
                      >
                        <div className="media-skeleton h-20 w-20 shrink-0">
                          {line.variant.imageUrl && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={line.variant.imageUrl}
                              alt={line.variant.productTitle}
                              className="h-full w-full rounded-xl object-cover"
                            />
                          )}
                        </div>

                        <div className="flex flex-1 flex-col justify-between">
                          <div>
                            <p className="text-sm font-medium text-ink">
                              {line.variant.productTitle}
                            </p>
                            <p className="text-xs text-ink-muted">{line.variant.title}</p>
                          </div>

                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2 rounded-full border border-ivory-border px-1">
                              <button
                                aria-label="Decrease quantity"
                                disabled={isPending}
                                onClick={() =>
                                  line.quantity > 1
                                    ? updateQuantity(line.id, line.quantity - 1)
                                    : removeItem(line.id)
                                }
                                className="p-1.5 text-ink-muted hover:text-ink disabled:opacity-40"
                              >
                                <Minus size={14} />
                              </button>
                              <span className="w-5 text-center text-sm text-ink">
                                {line.quantity}
                              </span>
                              <button
                                aria-label="Increase quantity"
                                disabled={isPending}
                                onClick={() => updateQuantity(line.id, line.quantity + 1)}
                                className="p-1.5 text-ink-muted hover:text-ink disabled:opacity-40"
                              >
                                <Plus size={14} />
                              </button>
                            </div>
                            <span className="text-sm font-medium text-ink">
                              ${(parseFloat(line.variant.price) * line.quantity).toFixed(2)}
                            </span>
                          </div>
                        </div>
                      </motion.li>
                    ))}
                  </AnimatePresence>
                </ul>
              )}
            </div>

            {lines.length > 0 && (
              <footer className="border-t border-ivory-border px-6 py-5">
                <div className="mb-4 flex items-center justify-between">
                  <span className="text-sm text-ink-muted">Subtotal</span>
                  <span className="font-display text-lg text-ink">
                    ${subtotal.toFixed(2)}
                  </span>
                </div>
                <a
                  href="/checkout"
                  className="flex w-full items-center justify-center gap-2 rounded-full bg-ink px-6 py-3.5 text-sm font-medium text-ivory-bg transition hover:bg-gold-dark"
                >
                  {isPending && <Loader2 size={16} className="animate-spin" />}
                  Checkout
                </a>
              </footer>
            )}
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

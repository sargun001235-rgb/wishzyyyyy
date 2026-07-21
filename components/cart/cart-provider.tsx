"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  useTransition,
} from "react";
import {
  addCartLine,
  getCartSnapshot,
  removeCartLine,
  updateCartLineQuantity,
} from "@/app/actions/cart";

export interface CartLineView {
  id: string;
  quantity: number;
  variant: {
    id: string;
    title: string;
    price: string;
    imageUrl: string | null;
    productTitle: string;
    productHandle: string;
  };
}

interface CartContextValue {
  lines: CartLineView[];
  isOpen: boolean;
  isPending: boolean;
  isLoaded: boolean;
  openCart: () => void;
  closeCart: () => void;
  addItem: (variantId: string, quantity?: number) => Promise<void>;
  updateQuantity: (lineId: string, quantity: number) => Promise<void>;
  removeItem: (lineId: string) => Promise<void>;
  error: string | null;
}

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [lines, setLines] = useState<CartLineView[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const refresh = useCallback(async () => {
    const result = await getCartSnapshot();
    if (result.success) {
      setLines(result.cart.lines);
      setError(null);
    } else {
      setError(result.error);
    }
    setIsLoaded(true);
  }, []);

  // Hydrate on mount so cart contents survive a hard refresh (F5) --
  // the Postgres row is the source of truth, not any client-side storage.
  useEffect(() => {
    refresh();
  }, [refresh]);

  const addItem = useCallback(
    async (variantId: string, quantity = 1) => {
      setError(null);
      startTransition(async () => {
        const result = await addCartLine({ variantId, quantity });
        if (!result.success) {
          setError(result.error);
          return;
        }
        await refresh();
        setIsOpen(true);
      });
    },
    [refresh]
  );

  const updateQuantity = useCallback(
    async (lineId: string, quantity: number) => {
      setError(null);
      startTransition(async () => {
        const result = await updateCartLineQuantity(lineId, quantity);
        if (!result.success) {
          setError(result.error);
          return;
        }
        await refresh();
      });
    },
    [refresh]
  );

  const removeItem = useCallback(
    async (lineId: string) => {
      setError(null);
      startTransition(async () => {
        const result = await removeCartLine(lineId);
        if (!result.success) {
          setError(result.error);
          return;
        }
        await refresh();
      });
    },
    [refresh]
  );

  return (
    <CartContext.Provider
      value={{
        lines,
        isOpen,
        isPending,
        isLoaded,
        openCart: () => setIsOpen(true),
        closeCart: () => setIsOpen(false),
        addItem,
        updateQuantity,
        removeItem,
        error,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within a CartProvider");
  return ctx;
}

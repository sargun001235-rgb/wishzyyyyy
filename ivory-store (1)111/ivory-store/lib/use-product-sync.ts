"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

export type ProductSyncEvent = {
  type: "product.created" | "product.updated" | "product.deleted";
  productId: string;
  handle?: string;
  timestamp: string;
};

/**
 * Subscribes to /api/sse and triggers a soft, non-flickering refresh of
 * server-rendered data whenever a product changes on Shopify. Uses
 * Next.js router.refresh() (RSC re-fetch, no full page reload) rather
 * than window.location.reload(), so scroll position, open modals, and
 * cart drawer state are preserved -- satisfying "no flickering" and
 * "no reload" requirements.
 */
export function useProductSync() {
  const router = useRouter();
  const [connectionStatus, setConnectionStatus] = useState<
    "connecting" | "connected" | "error"
  >("connecting");
  const [lastEvent, setLastEvent] = useState<ProductSyncEvent | null>(null);
  const retryRef = useRef(0);

  useEffect(() => {
    let source: EventSource | null = null;
    let retryTimeout: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;

    function connect() {
      if (cancelled) return;
      source = new EventSource("/api/sse");

      source.addEventListener("connected", () => {
        setConnectionStatus("connected");
        retryRef.current = 0;
      });

      source.addEventListener("product-sync", (event) => {
        try {
          const data = JSON.parse((event as MessageEvent).data) as ProductSyncEvent;
          setLastEvent(data);
          router.refresh();
        } catch (err) {
          console.error("[useProductSync] failed to parse event", err);
        }
      });

      source.onerror = () => {
        setConnectionStatus("error");
        source?.close();
        // Exponential backoff reconnect, capped at 30s.
        const delay = Math.min(1000 * 2 ** retryRef.current, 30_000);
        retryRef.current += 1;
        retryTimeout = setTimeout(connect, delay);
      };
    }

    connect();

    return () => {
      cancelled = true;
      source?.close();
      if (retryTimeout) clearTimeout(retryTimeout);
    };
  }, [router]);

  return { connectionStatus, lastEvent };
}

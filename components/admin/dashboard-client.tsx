"use client";

import { useState, useTransition } from "react";
import { motion } from "framer-motion";
import { RefreshCw, CheckCircle2, XCircle, Clock, LogOut } from "lucide-react";
import { triggerManualSync, retryOrderPush } from "@/app/actions/admin";
import { adminLogout } from "@/app/actions/admin-auth";
import { useProductSync } from "@/lib/use-product-sync";

interface WebhookLog {
  id: string;
  topic: string;
  status: string;
  errorMessage: string | null;
  receivedAt: Date;
}

interface OrderRow {
  id: string;
  status: string;
  customerName: string;
  total: unknown; // Prisma Decimal serialized
  currencyCode: string;
  shopifyPushError: string | null;
  createdAt: Date;
}

interface DashboardData {
  recentLogs: WebhookLog[];
  pendingOrdersCount: number;
  syncFailedOrders: OrderRow[];
  recentOrders: OrderRow[];
  productCount: number;
  redisOk: boolean;
}

export function AdminDashboardClient({ initialData }: { initialData: DashboardData }) {
  const [data, setData] = useState(initialData);
  const [isSyncing, startSyncTransition] = useTransition();
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const { connectionStatus } = useProductSync();

  function handleManualSync() {
    startSyncTransition(async () => {
      const result = await triggerManualSync();
      setMessage(result.success ? "Sync triggered." : result.error);
    });
  }

  async function handleRetry(orderId: string) {
    setRetryingId(orderId);
    const result = await retryOrderPush(orderId);
    setMessage(
      result.success
        ? `Order synced to Shopify as ${result.shopifyOrderName}.`
        : result.error
    );
    if (result.success) {
      setData((prev) => ({
        ...prev,
        syncFailedOrders: prev.syncFailedOrders.filter((o) => o.id !== orderId),
      }));
    }
    setRetryingId(null);
  }

  return (
    <main className="min-h-screen bg-ivory-bg p-6 md:p-10">
      <div className="mx-auto max-w-6xl">
        <header className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="font-display text-3xl text-ink">Store operations</h1>
            <p className="mt-1 text-sm text-ink-muted">
              Sync status, webhook logs, and Cash on Delivery order review.
            </p>
          </div>
          <form action={adminLogout}>
            <button
              type="submit"
              className="flex items-center gap-2 rounded-full border border-ivory-border px-4 py-2 text-sm text-ink-muted transition hover:bg-ivory-card hover:text-ink"
            >
              <LogOut size={16} /> Sign out
            </button>
          </form>
        </header>

        {message && (
          <div className="mb-6 rounded-lg border border-gold/30 bg-gold/10 px-4 py-3 text-sm text-ink">
            {message}
          </div>
        )}

        {/* Status row */}
        <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-4">
          <StatusCard
            label="Live connection"
            value={connectionStatus === "connected" ? "Connected" : "Reconnecting…"}
            tone={connectionStatus === "connected" ? "good" : "warn"}
          />
          <StatusCard
            label="Redis cache"
            value={data.redisOk ? "Healthy" : "Unreachable"}
            tone={data.redisOk ? "good" : "bad"}
          />
          <StatusCard label="Products synced" value={String(data.productCount)} tone="neutral" />
          <StatusCard
            label="Pending COD orders"
            value={String(data.pendingOrdersCount)}
            tone={data.pendingOrdersCount > 0 ? "warn" : "good"}
          />
        </div>

        <div className="mb-8">
          <button
            onClick={handleManualSync}
            disabled={isSyncing}
            className="flex items-center gap-2 rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-ivory-bg transition hover:bg-gold-dark disabled:opacity-50"
          >
            <motion.span
              animate={isSyncing ? { rotate: 360 } : { rotate: 0 }}
              transition={isSyncing ? { repeat: Infinity, duration: 1, ease: "linear" } : {}}
            >
              <RefreshCw size={16} />
            </motion.span>
            {isSyncing ? "Syncing…" : "Trigger manual product sync"}
          </button>
        </div>

        {/* Failed COD orders needing attention */}
        {data.syncFailedOrders.length > 0 && (
          <section className="mb-8">
            <h2 className="mb-3 font-display text-xl text-ink">
              Orders needing attention ({data.syncFailedOrders.length})
            </h2>
            <div className="overflow-hidden rounded-xl border border-ivory-border bg-white/60">
              {data.syncFailedOrders.map((order) => (
                <div
                  key={order.id}
                  className="flex items-center justify-between border-b border-ivory-border px-5 py-4 last:border-b-0"
                >
                  <div>
                    <p className="text-sm font-medium text-ink">{order.customerName}</p>
                    <p className="text-xs text-ink-muted">
                      ${String(order.total)} {order.currencyCode} ·{" "}
                      {order.shopifyPushError ?? "Sync failed"}
                    </p>
                  </div>
                  <button
                    onClick={() => handleRetry(order.id)}
                    disabled={retryingId === order.id}
                    className="rounded-full border border-ivory-border px-4 py-1.5 text-xs font-medium text-ink transition hover:bg-gold/10 disabled:opacity-50"
                  >
                    {retryingId === order.id ? "Retrying…" : "Retry push"}
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Recent orders */}
        <section className="mb-8">
          <h2 className="mb-3 font-display text-xl text-ink">Recent orders</h2>
          <div className="overflow-hidden rounded-xl border border-ivory-border bg-white/60">
            {data.recentOrders.length === 0 ? (
              <p className="px-5 py-6 text-sm text-ink-muted">No orders yet.</p>
            ) : (
              data.recentOrders.map((order) => (
                <div
                  key={order.id}
                  className="flex items-center justify-between border-b border-ivory-border px-5 py-3 last:border-b-0"
                >
                  <div>
                    <p className="text-sm text-ink">{order.customerName}</p>
                    <p className="text-xs text-ink-muted">
                      {new Date(order.createdAt).toLocaleString()}
                    </p>
                  </div>
                  <OrderStatusBadge status={order.status} />
                </div>
              ))
            )}
          </div>
        </section>

        {/* Webhook log */}
        <section>
          <h2 className="mb-3 font-display text-xl text-ink">Webhook activity</h2>
          <div className="overflow-hidden rounded-xl border border-ivory-border bg-white/60">
            {data.recentLogs.length === 0 ? (
              <p className="px-5 py-6 text-sm text-ink-muted">No webhook events yet.</p>
            ) : (
              data.recentLogs.map((log) => (
                <div
                  key={log.id}
                  className="flex items-center justify-between border-b border-ivory-border px-5 py-3 last:border-b-0"
                >
                  <div className="flex items-center gap-3">
                    <LogStatusIcon status={log.status} />
                    <div>
                      <p className="text-sm text-ink">{log.topic}</p>
                      {log.errorMessage && (
                        <p className="text-xs text-red-700">{log.errorMessage}</p>
                      )}
                    </div>
                  </div>
                  <span className="text-xs text-ink-muted">
                    {new Date(log.receivedAt).toLocaleTimeString()}
                  </span>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

function StatusCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "good" | "warn" | "bad" | "neutral";
}) {
  const toneClasses = {
    good: "text-emerald-700",
    warn: "text-gold-dark",
    bad: "text-red-700",
    neutral: "text-ink",
  }[tone];

  return (
    <div className="rounded-xl border border-ivory-border bg-white/60 p-4">
      <p className="text-xs text-ink-muted">{label}</p>
      <p className={`mt-1 font-display text-lg ${toneClasses}`}>{value}</p>
    </div>
  );
}

function LogStatusIcon({ status }: { status: string }) {
  if (status === "processed") return <CheckCircle2 size={16} className="text-emerald-600" />;
  if (status === "failed") return <XCircle size={16} className="text-red-600" />;
  return <Clock size={16} className="text-gold-dark" />;
}

function OrderStatusBadge({ status }: { status: string }) {
  const labels: Record<string, string> = {
    PENDING_COD: "Pending",
    SYNCED_TO_SHOPIFY: "Synced",
    SYNC_FAILED: "Sync failed",
    FULFILLED: "Fulfilled",
    CANCELLED: "Cancelled",
  };
  const tones: Record<string, string> = {
    PENDING_COD: "bg-gold/10 text-gold-dark",
    SYNCED_TO_SHOPIFY: "bg-emerald-50 text-emerald-700",
    SYNC_FAILED: "bg-red-50 text-red-700",
    FULFILLED: "bg-emerald-50 text-emerald-700",
    CANCELLED: "bg-ivory-card text-ink-muted",
  };
  return (
    <span className={`rounded-full px-3 py-1 text-xs font-medium ${tones[status] ?? ""}`}>
      {labels[status] ?? status}
    </span>
  );
}

import { NextRequest } from "next/server";
import Redis from "ioredis";
import { PRODUCT_SYNC_CHANNEL } from "@/lib/redis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic"; // never cache a streaming response

/**
 * GET /api/sse
 *
 * Streams product-sync events to the client as they're published to Redis
 * by the webhook handler. Each connected browser tab gets its own Redis
 * subscriber connection so one slow client can't block others.
 */
export async function GET(req: NextRequest) {
  const encoder = new TextEncoder();
  let subscriber: Redis | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        try {
          controller.enqueue(
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
          );
        } catch {
          // Controller already closed (client disconnected) -- ignore.
        }
      };

      try {
        const redisUrl = process.env.REDIS_URL;
        if (!redisUrl) throw new Error("REDIS_URL is not set");

        subscriber = new Redis(redisUrl, { maxRetriesPerRequest: 3 });

        subscriber.on("error", (err) => {
          console.error("[sse] redis subscriber error", err);
        });

        await subscriber.subscribe(PRODUCT_SYNC_CHANNEL);

        subscriber.on("message", (_channel, message) => {
          try {
            send("product-sync", JSON.parse(message));
          } catch (err) {
            console.error("[sse] failed to forward message", err);
          }
        });

        // Initial handshake so the client knows the stream is live.
        send("connected", { timestamp: new Date().toISOString() });

        // Heartbeat keeps intermediary proxies (and some browsers) from
        // timing out an idle connection.
        heartbeat = setInterval(() => send("heartbeat", { timestamp: Date.now() }), 25_000);
      } catch (err) {
        console.error("[sse] failed to establish stream", err);
        send("error", { message: "Failed to establish real-time connection" });
        controller.close();
      }
    },
    cancel() {
      if (heartbeat) clearInterval(heartbeat);
      if (subscriber) {
        subscriber.unsubscribe().catch(() => {});
        subscriber.quit().catch(() => {});
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no", // disable nginx buffering for real-time delivery
    },
  });
}

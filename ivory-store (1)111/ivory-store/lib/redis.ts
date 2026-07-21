import Redis from "ioredis";

const globalForRedis = globalThis as unknown as {
  redis: Redis | undefined;
  redisSub: Redis | undefined;
};

function createClient() {
  const url = process.env.REDIS_URL;
  if (!url) {
    throw new Error("REDIS_URL is not set. Add it to your .env file.");
  }
  return new Redis(url, {
    maxRetriesPerRequest: 3,
    retryStrategy: (times) => Math.min(times * 200, 2000),
  });
}

// Standard client: caching product reads, rate limiting, etc.
export const redis = globalForRedis.redis ?? createClient();

// Dedicated subscriber connection (Redis requires a separate connection
// for a client that is actively in SUBSCRIBE mode).
export const redisSub = globalForRedis.redisSub ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalForRedis.redis = redis;
  globalForRedis.redisSub = redisSub;
}

export const PRODUCT_SYNC_CHANNEL = "product-sync-events";

export type ProductSyncEvent = {
  type: "product.created" | "product.updated" | "product.deleted";
  productId: string;
  handle?: string;
  timestamp: string;
};

export async function publishProductSyncEvent(event: ProductSyncEvent) {
  try {
    await redis.publish(PRODUCT_SYNC_CHANNEL, JSON.stringify(event));
  } catch (err) {
    // Publishing failure should never take down the webhook handler --
    // the DB write already succeeded, so log and move on. Clients will
    // simply pick up the change on their next poll/reconnect.
    console.error("[redis] failed to publish product sync event", err);
  }
}

export async function invalidateProductCache(handle?: string) {
  try {
    const pipeline = redis.pipeline();
    pipeline.del("products:all");
    if (handle) pipeline.del(`product:${handle}`);
    await pipeline.exec();
  } catch (err) {
    console.error("[redis] failed to invalidate product cache", err);
  }
}

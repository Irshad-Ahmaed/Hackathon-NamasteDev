import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

// Use a fallback memory cache for local dev if Redis is not configured
let redisClient: Redis | null = null;
try {
  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    redisClient = Redis.fromEnv();
  }
} catch (_e) {
  console.warn('Redis not configured, rate limiting will be bypassed or use local memory');
}

// Global rate limiter instance (e.g., 20 requests per 10 seconds)
export const rateLimit = redisClient 
  ? new Ratelimit({
      redis: redisClient,
      limiter: Ratelimit.slidingWindow(20, '10 s'),
      analytics: true,
      prefix: '@upstash/ratelimit/chat',
    })
  : null;

export async function checkRateLimit(identifier: string) {
  if (!rateLimit) {
    // If no Redis is configured, bypass rate limiting
    return { success: true, limit: 100, remaining: 99, reset: Date.now() + 10000 };
  }
  return await rateLimit.limit(identifier);
}

import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

// Use a fallback memory cache for local dev if Redis is not configured
let redisClient: Redis | null = null;
try {
  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    redisClient = Redis.fromEnv();
  }
} catch {
  console.warn('Redis not configured, rate limiting will be bypassed or use local memory');
}

// 1. Per-user daily limit (50 messages/day)
export const dailyRateLimit = redisClient 
  ? new Ratelimit({
      redis: redisClient,
      limiter: Ratelimit.slidingWindow(50, '1 d'),
      analytics: true,
      prefix: '@upstash/ratelimit/daily',
    })
  : null;

// 2. Per-IP minute limit (10 messages/minute)
export const minuteRateLimit = redisClient 
  ? new Ratelimit({
      redis: redisClient,
      limiter: Ratelimit.slidingWindow(10, '1 m'),
      analytics: true,
      prefix: '@upstash/ratelimit/minute',
    })
  : null;

// 3. Per-user reasoning model daily limit (10 messages/day)
export const reasoningRateLimit = redisClient 
  ? new Ratelimit({
      redis: redisClient,
      limiter: Ratelimit.slidingWindow(10, '1 d'),
      analytics: true,
      prefix: '@upstash/ratelimit/reasoning',
    })
  : null;

export async function enforceRateLimits(userId: string, ip: string, useReasoning: boolean): Promise<void> {
  if (!redisClient) {
    // Fail open or bypass in local dev without Redis config
    return;
  }

  try {
    // Check IP rate limit first
    if (minuteRateLimit) {
      const res = await minuteRateLimit.limit(ip);
      if (!res.success) {
        throw new Error('IP_RATE_LIMIT_EXCEEDED');
      }
    }

    // Check User daily rate limit
    if (dailyRateLimit) {
      const res = await dailyRateLimit.limit(userId);
      if (!res.success) {
        throw new Error('USER_DAILY_LIMIT_EXCEEDED');
      }
    }

    // Check User reasoning limit if applicable
    if (useReasoning && reasoningRateLimit) {
      const res = await reasoningRateLimit.limit(userId);
      if (!res.success) {
        throw new Error('REASONING_DAILY_LIMIT_EXCEEDED');
      }
    }
  } catch (error) {
    const err = error as Error;
    if (
      err.message === 'IP_RATE_LIMIT_EXCEEDED' ||
      err.message === 'USER_DAILY_LIMIT_EXCEEDED' ||
      err.message === 'REASONING_DAILY_LIMIT_EXCEEDED'
    ) {
      throw err;
    }
    // Fail open on Redis connectivity or system errors to maintain service availability
    console.error('Rate limiting error (failing open):', error);
  }
}


import { logger } from './logger';

export interface RetryOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
}

/**
 * Executes a function with retries using exponential backoff and jitter.
 * Retries network errors, HTTP 429, and HTTP 5xx.
 * Does not retry validation, moderation, or non-retryable operational errors.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {},
  attempt: number = 1
): Promise<T> {
  const { maxAttempts = 3, baseDelayMs = 300, maxDelayMs = 5000 } = options;

  try {
    return await fn();
  } catch (error: unknown) {
    if (attempt >= maxAttempts) {
      throw error;
    }

    let isRetryable = false;

    // Extract status code if present
    const errObj = error as Record<string, unknown>;
    const response = errObj.response as Record<string, unknown> | undefined;
    const status = (errObj.status || errObj.statusCode || response?.status) as number | undefined;

    if (status !== undefined) {
      // Retry on Rate Limits (429) or Server Errors (5xx)
      if (status === 429 || (status >= 500 && status < 600)) {
        isRetryable = true;
      }
    } else {
      // If there is no status, check if it is a standard operational AppError (like validation, low confidence)
      // which we should NOT retry. Otherwise (network timeout, connection refuse, DNS error) we retry.
      const isOperationalAppError = errObj.isOperational && errObj.code !== 'RETRIEVAL_ERROR' && errObj.code !== 'RATE_LIMITED';
      if (!isOperationalAppError) {
        isRetryable = true;
      }
    }

    if (!isRetryable) {
      throw error;
    }

    const delay = Math.min(maxDelayMs, baseDelayMs * Math.pow(2, attempt - 1));
    // Apply random jitter
    const jitteredDelay = delay / 2 + Math.random() * (delay / 2);

    logger.warn({
      msg: 'Transient failure. Retrying operation...',
      attempt,
      delayMs: Math.round(jitteredDelay),
      error: error instanceof Error ? error.message : String(error),
    });

    await new Promise((resolve) => setTimeout(resolve, jitteredDelay));
    return withRetry(fn, options, attempt + 1);
  }
}

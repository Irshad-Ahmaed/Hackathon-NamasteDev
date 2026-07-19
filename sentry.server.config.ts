import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: 0.1,
  debug: false,
  beforeSend(event, hint) {
    const error = hint.originalException;
    if (error && typeof error === 'object' && 'isOperational' in error && (error as Record<string, unknown>).isOperational) {
      // Ignore operational errors like validation, moderation blocks, rate limits
      return null;
    }
    return event;
  },
});

export class AppError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode: number = 500,
    public readonly isOperational: boolean = true
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export class ValidationError extends AppError {
  constructor(message: string) { super('VALIDATION_ERROR', message, 400); }
}
export class ModerationError extends AppError {
  constructor() { super('MODERATION_BLOCKED', 'Content blocked by moderation', 400); }
}
export class RetrievalError extends AppError {
  constructor(message: string) { super('RETRIEVAL_ERROR', message, 503); }
}
export class RateLimitError extends AppError {
  constructor() { super('RATE_LIMITED', 'Rate limit exceeded', 429); }
}
export class LowConfidenceError extends AppError {
  constructor() { super('LOW_CONFIDENCE', 'Insufficient retrieval confidence', 200); }
}
export class DistressError extends AppError {
  constructor() { super('DISTRESS_SIGNAL', 'Distress signal detected', 200); }
}

const CRISIS_HELPLINE_NAME = process.env.CRISIS_HELPLINE_NAME || 'iCall (India)';
const CRISIS_HELPLINE_NUMBER = process.env.CRISIS_HELPLINE_NUMBER || '9152987821';
export const CRISIS_REVIEW_DATE = process.env.CRISIS_REVIEW_DATE || '2026-12-31'; // Ensure numbers are checked regularly

export const SAFE_ESCALATION_MESSAGE =
  "It sounds like you might be going through something difficult. " +
  `If you are in immediate danger, please dial 112 for emergency services. ` +
  `Otherwise, please reach out to ${CRISIS_HELPLINE_NAME} at ${CRISIS_HELPLINE_NUMBER} or a trusted adult. ` +
  "I'm here for your studies when you're ready.";

export const MODERATION_BLOCKED_MESSAGE =
  "I can help with Class 10 Math and Science questions. Please ask me something from your syllabus.";

export function toUserSafeResponse(err: Error): { message: string; code: string; status: number } {
  if (err instanceof AppError) {
    if (err.code === 'DISTRESS_SIGNAL') {
      return { message: SAFE_ESCALATION_MESSAGE, code: err.code, status: err.statusCode };
    }
    if (err.code === 'MODERATION_BLOCKED') {
      return { message: MODERATION_BLOCKED_MESSAGE, code: err.code, status: err.statusCode };
    }
    return { message: err.message, code: err.code, status: err.statusCode };
  }
  return { message: 'Something went wrong. Please try again.', code: 'INTERNAL_SERVER_ERROR', status: 500 };
}

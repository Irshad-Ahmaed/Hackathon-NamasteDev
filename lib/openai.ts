import OpenAI from 'openai';

let client: OpenAI | null = null;

export const openai = new Proxy({} as OpenAI, {
  get(target, prop, receiver) {
    if (!client) {
      if (!process.env.OPENAI_API_KEY) {
        throw new Error('OPENAI_API_KEY is not set');
      }
      client = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
      });
    }
    return Reflect.get(client, prop, receiver);
  }
});

// Model config — always from env, never hardcoded
export const models = {
  chat: process.env.OPENAI_CHAT_MODEL!,
  reasoning: process.env.OPENAI_REASONING_MODEL!,
  embedding: process.env.OPENAI_EMBEDDING_MODEL ?? 'text-embedding-3-small',
  moderation: process.env.OPENAI_MODERATION_MODEL ?? 'omni-moderation-latest',
} as const;

// Chat completion wrapper with basic backoff retry
export async function createChatCompletion(
  params: OpenAI.Chat.Completions.ChatCompletionCreateParams,
  attempt: number = 0
) {
  try {
    return await openai.chat.completions.create(params);
  } catch (err: unknown) {
    const error = err as { status?: number };
    const isRetryable = error?.status === 429 || (error?.status !== undefined && error.status >= 500);
    if (isRetryable && attempt < 2) {
      const delay = Math.pow(2, attempt) * 1000 + Math.random() * 500;
      await new Promise(resolve => setTimeout(resolve, delay));
      return createChatCompletion(params, attempt + 1);
    }
    throw err;
  }
}

// Token cost estimator
const PRICING: Record<string, { input: number; output: number }> = {
  'gpt-4o-mini': { input: 0.000150 / 1000, output: 0.000600 / 1000 },
  'o4-mini': { input: 0.001100 / 1000, output: 0.004400 / 1000 },
  'text-embedding-3-small': { input: 0.000020 / 1000, output: 0 },
};

export function estimateCostUsd(
  model: string,
  inputTokens: number,
  outputTokens: number
): number {
  const rates = PRICING[model] || PRICING['gpt-4o-mini'];
  return (inputTokens * rates.input) + (outputTokens * rates.output);
}

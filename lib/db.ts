import { neon } from '@neondatabase/serverless';

let client: ReturnType<typeof neon> | null = null;

function getClient() {
  if (!client) {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL environment variable is not set');
    }
    client = neon(process.env.DATABASE_URL);
  }
  return client;
}

// Use apply trap to lazily forward query calls.
// Initialized with a dummy connection string that satisfies the URI validator at import time.
export const sql = new Proxy(neon('postgresql://placeholder:placeholder@placeholder.neon.tech/placeholder?sslmode=require'), {
  apply(_target, thisArg, argumentsList) {
    const activeClient = getClient();
    return Reflect.apply(activeClient, thisArg, argumentsList);
  }
}) as ReturnType<typeof neon>;

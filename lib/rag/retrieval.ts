import { qdrant, COLLECTION } from '../qdrant';
import { openai, models } from '../openai';
import { CitationMetadata } from '../schemas';

export interface RetrievalResult {
  text: string;
  score: number;
  metadata: Record<string, unknown>;
}

export async function retrieveContext(query: string, limit: number = 5): Promise<RetrievalResult[]> {
  const openaiClient = openai;
  const qdrantClient = qdrant;

  // 1. Embed query
  const embeddingResponse = await openaiClient.embeddings.create({
    model: models.embedding,
    input: query,
    encoding_format: 'float',
  });
  
  const vector = embeddingResponse.data[0].embedding;

  // 2. Search Qdrant with reviewed: true filter
  const searchResults = await qdrantClient.search(COLLECTION, {
    vector,
    limit,
    filter: {
      must: [
        {
          key: 'reviewed',
          match: { value: true }
        }
      ]
    },
    with_payload: true,
  });

  return searchResults.map(res => ({
    text: (res.payload?.text as string) || '',
    score: res.score,
    metadata: (res.payload as Record<string, unknown>) || {},
  }));
}

export function buildCitations(results: RetrievalResult[]): CitationMetadata[] {
  return results.map(res => {
    const meta = res.metadata;
    return {
      pointId: String(meta?.pointId || meta?.id || Math.random().toString(36).substring(7)),
      sourceUrl: String(meta?.sourceUrl || ''),
      chapterTitle: String(meta?.chapterTitle || 'Unknown Chapter'),
      pages: Array.isArray(meta?.pages) ? meta.pages : [],
      relevanceScore: res.score,
    };
  });
}

import { qdrant, COLLECTION } from '../qdrant';
import { openai, models } from '../openai';
import { CitationMetadata } from '../schemas';
import { withRetry } from '../resilience';


export interface RetrievalResult {
  text: string;
  score: number;
  metadata: Record<string, unknown>;
}

export interface RetrievalFilters {
  subject?: string;
  language?: string;
  chapterId?: string;
}

export async function retrieveContext(
  query: string, 
  filters?: RetrievalFilters,
  limit: number = 5
): Promise<RetrievalResult[]> {
  const openaiClient = openai;
  const qdrantClient = qdrant;

  // 1. Embed query
  const embeddingResponse = await withRetry(() => 
    openaiClient.embeddings.create({
      model: models.embedding,
      input: query,
      encoding_format: 'float',
    })
  );
  
  const vector = embeddingResponse.data[0].embedding;


  // 2. Search Qdrant with reviewed: true filter and metadata filters
  const must: Record<string, unknown>[] = [
    {
      key: 'reviewed',
      match: { value: true }
    }
  ];

  if (filters?.subject) {
    must.push({
      key: 'subject',
      match: { value: filters.subject }
    });
  }

  if (filters?.language) {
    must.push({
      key: 'language',
      match: { value: filters.language }
    });
  }

  if (filters?.chapterId) {
    const chapterNum = parseInt(filters.chapterId, 10);
    if (!isNaN(chapterNum)) {
      must.push({
        key: 'chapterNumber',
        match: { value: chapterNum }
      });
    }
  }

  const searchResults = await withRetry(() =>
    qdrantClient.search(COLLECTION, {
      vector,
      limit,
      filter: { must },
      with_payload: true,
    })
  );


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
      sourceUrl: String(meta?.sourceUrl || meta?.officialSourceUrl || ''),
      chapterTitle: String(meta?.chapterTitle || 'Unknown Chapter'),
      pages: Array.isArray(meta?.pages) ? meta.pages : [],
      relevanceScore: res.score,
    };
  });
}

import { QdrantClient } from '@qdrant/js-client-rest';

let client: QdrantClient | null = null;

export const qdrant = new Proxy({} as QdrantClient, {
  get(target, prop) {
    if (!client) {
      if (!process.env.QDRANT_URL || !process.env.QDRANT_API_KEY) {
        throw new Error('Qdrant env vars not set');
      }
      client = new QdrantClient({
        url: process.env.QDRANT_URL,
        apiKey: process.env.QDRANT_API_KEY,
      });
    }
    return Reflect.get(client, prop);
  }
});

// The app always targets this alias — never a raw versioned collection name
export const COLLECTION = process.env.QDRANT_COLLECTION_ALIAS ?? 'cbse_class10_live';

export type ChunkPayload = {
  documentId: string;
  sourceTitle: string;
  sourceVersion: string;
  subject: 'mathematics' | 'science';
  chapterNumber: number;
  chapterTitle: string;
  sectionTitle: string | null;
  pageStart: number;
  pageEnd: number;
  chunkIndex: number;
  contentHash: string;
  contentType: 'text' | 'diagram_caption' | 'equation' | 'definition' | 'example';
  language: 'en' | 'hi';
  curriculumVersion: string;
  reviewed: boolean;
  // CONTENT STORAGE POLICY (production):
  // Store only the chunk text (400-700 tokens), not the full chapter.
  // Always include officialSourceUrl so the UI can link back to NCERT/DIKSHA.
  // This limits copyright exposure: we store excerpts for retrieval, not full chapters.
  text: string;               // chunk text only (excerpt, not full chapter)
  officialSourceUrl: string;  // e.g. https://ncert.nic.in/textbook.php or DIKSHA PDF URL
};

import { PDFParse } from 'pdf-parse';
import { logger } from './logger';

export type ExtractedPage = {
  pageNumber: number;
  text: string;
  isImageHeavy: boolean;       // true if text extraction yielded < 100 chars
};

export async function extractPdf(pdfBuffer: Buffer): Promise<ExtractedPage[]> {
  const parser = new PDFParse({ data: new Uint8Array(pdfBuffer) });
  try {
    const result = await parser.getText();

    const pages: ExtractedPage[] = result.pages.map((p) => {
      const text = cleanText(p.text);
      return {
        pageNumber: p.num,
        text,
        isImageHeavy: text.replace(/\s/g, '').length < 100,
      };
    });

    // For image-heavy pages: log warning
    const imageHeavy = pages.filter(p => p.isImageHeavy);
    if (imageHeavy.length > 0) {
      logger.warn({ 
        event: 'pdf_extraction_image_heavy_detected', 
        count: imageHeavy.length,
        pages: imageHeavy.map(p => p.pageNumber)
      });
    }

    return pages;
  } finally {
    await parser.destroy();
  }
}

function cleanText(raw: string): string {
  return raw
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// Caption diagrams via vision model
export async function captionDiagram(
  openai: import('openai').default,
  imageBase64: string,
  context: { subject: string; chapter: string }
): Promise<string> {
  const response = await openai.chat.completions.create({
    model: process.env.OPENAI_CHAT_MODEL!, // vision-capable model
    messages: [{
      role: 'user',
      content: [
        {
          type: 'image_url',
          image_url: { url: `data:image/png;base64,${imageBase64}` }
        },
        {
          type: 'text',
          text: `This image is from an NCERT Class 10 ${context.subject} textbook, Chapter: ${context.chapter}.
                 Describe this diagram in detail using proper scientific terminology.
                 Focus on labels, arrows, processes shown, and relationships between components.
                 Write as a textual description a student can search for.`
        }
      ]
    }],
    max_tokens: 300,
  });
  return response.choices[0].message.content ?? '';
}

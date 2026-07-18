import * as pdf from 'pdf-parse';
import { logger } from './logger';

// @ts-expect-error - pdf-parse has implicit default export
const pdfParse = pdf.default || pdf;

export type ExtractedPage = {
  pageNumber: number;
  text: string;
  isImageHeavy: boolean;       // true if text extraction yielded < 100 chars
};

interface PDFPageData {
  getTextContent: () => Promise<{
    items: Array<{
      transform: number[];
      str: string;
    }>;
  }>;
}

export async function extractPdf(pdfBuffer: Buffer): Promise<ExtractedPage[]> {
  // Option to capture pages cleanly
  const pageTexts: string[] = [];
  const options = {
    pagerender: function (pageData: PDFPageData) {
      return pageData.getTextContent().then(function (textContent) {
        let lastY: number | undefined;
        let text = '';
        for (const item of textContent.items) {
          if (lastY !== item.transform[5] && lastY !== undefined) {
            text += '\n';
          }
          text += item.str + ' ';
          lastY = item.transform[5];
        }
        pageTexts.push(text);
        return text;
      });
    }
  };

  await pdfParse(pdfBuffer, options);

  const pages: ExtractedPage[] = pageTexts.map((text, i) => ({
    pageNumber: i + 1,
    text: cleanText(text),
    isImageHeavy: text.replace(/\s/g, '').length < 100,
  }));

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

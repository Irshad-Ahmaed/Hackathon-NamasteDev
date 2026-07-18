import { openai, models } from './openai';

// Categories in OpenAI Moderation API that signify self-harm or distress
const DISTRESS_CATEGORIES = [
  'self-harm',
  'self-harm/intent',
  'self-harm/instructions',
];

export class DistressSignalError extends Error {
  constructor(message: string = 'Distress or self-harm signal detected.') {
    super(message);
    this.name = 'DistressSignalError';
  }
}

export class ModerationError extends Error {
  constructor(message: string = 'Input violates safety guidelines.') {
    super(message);
    this.name = 'ModerationError';
  }
}

/**
 * Checks input text for moderation violations.
 * Throws DistressSignalError if self-harm/suicide categories are matched.
 * Throws ModerationError if other categories are matched.
 */
export async function moderateInput(text: string): Promise<void> {
  if (!text.trim()) return;

  const openaiClient = openai;
  
  try {
    const moderation = await openaiClient.moderations.create({
      input: text,
      model: models.moderation,
    });

    const result = moderation.results[0];
    
    if (result.flagged) {
      // Check for distress first
      for (const category of DISTRESS_CATEGORIES) {
        if (result.categories[category as keyof typeof result.categories]) {
          throw new DistressSignalError();
        }
      }
      
      // If no distress but still flagged, throw generic moderation error
      throw new ModerationError();
    }
  } catch (error) {
    if (error instanceof DistressSignalError || error instanceof ModerationError) {
      throw error;
    }
    console.error('[moderation] Moderation API error:', error);
    throw new Error('Safety check failed due to an internal error.');
  }
}

/**
 * Output Stream Buffer for Moderation
 * Buffers chunks of text up to a certain length, runs moderation, and yields safe chunks.
 */
export class ModeratedStreamBuffer {
  private buffer: string = '';
  private readonly bufferThreshold: number;
  
  constructor(
    private onFlush: (safeText: string) => void,
    private onError: (error: Error) => void,
    bufferThreshold: number = 450
  ) {
    this.bufferThreshold = bufferThreshold;
  }

  async addChunk(chunk: string) {
    this.buffer += chunk;
    if (this.buffer.length >= this.bufferThreshold) {
      await this.flush();
    }
  }

  async flush() {
    if (!this.buffer) return;
    
    // Trim but keep the original buffer for flushing to preserve spacing
    const textToCheck = this.buffer.trim();
    if (!textToCheck) {
      this.onFlush(this.buffer);
      this.buffer = '';
      return;
    }
    
    try {
      await moderateInput(textToCheck);
      // If safe, flush the original un-trimmed buffer
      this.onFlush(this.buffer);
      this.buffer = ''; 
    } catch (error) {
      if (error instanceof DistressSignalError || error instanceof ModerationError) {
         // Redact block
         this.onFlush('\n\n[Content redacted for safety policy violations.]');
         this.buffer = '';
         throw error;
      } else {
         this.onError(error instanceof Error ? error : new Error(String(error)));
         throw error;
      }
    }
  }
}

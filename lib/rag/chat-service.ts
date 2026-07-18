import { openai } from '../openai';
import { checkRateLimit } from '../rate-limit';
import { moderateInput, ModeratedStreamBuffer, DistressSignalError } from '../moderation';
import { reformulateQuery } from './reformulate';
import { retrieveContext, buildCitations } from './retrieval';
import { buildPrompt } from './prompt';
import { ChatMessage, CitationMetadata } from '../schemas';
import { saveMessage, fetchHistory, createConversation } from '../../server/conversation-service';
import { AppError, SAFE_ESCALATION_MESSAGE } from '../errors';

export interface ChatServiceOptions {
  userId: string;
  tenantId: string;
  conversationId?: string;
  messages: ChatMessage[];
  subject: 'mathematics' | 'science';
}

export async function executeChatPipeline(options: ChatServiceOptions): Promise<ReadableStream> {
  const { userId, tenantId, subject, messages } = options;
  let conversationId = options.conversationId;

  // 1. Rate Limit
  const rateLimitResult = await checkRateLimit(userId);
  if (!rateLimitResult.success) {
    throw new AppError('TOO_MANY_REQUESTS', 'Rate limit exceeded. Please try again later.', 429);
  }

  const latestMessage = messages[messages.length - 1];
  if (!latestMessage || latestMessage.role !== 'user') {
    throw new AppError('BAD_REQUEST', 'Last message must be from the user', 400);
  }

  // 2. Input Moderation
  try {
    await moderateInput(latestMessage.content);
  } catch (error) {
    if (error instanceof DistressSignalError) {
      // Short circuit and return a distress response as stream
      return createStaticStream(SAFE_ESCALATION_MESSAGE, conversationId || 'new');
    }
    throw error;
  }

  // 3. Resolve Conversation & Save User Message
  if (!conversationId) {
    conversationId = await createConversation(tenantId, userId, subject);
  }
  
  await saveMessage(conversationId, 'user', latestMessage.content, userId, tenantId, { subject });

  // 4. Fetch History
  const history = await fetchHistory(conversationId, userId, tenantId);

  // 5. Reformulate Query
  const standaloneQuery = await reformulateQuery(history, latestMessage.content);

  // 6. Retrieve Context
  const contextResults = await retrieveContext(standaloneQuery);
  const citations = buildCitations(contextResults);

  // 7. Evaluate Retrieval Confidence (Basic Thresholding)
  const topScore = contextResults[0]?.score || 0;
  if (topScore < 0.2) {
    // Low confidence -> Fallback
    const fallbackText = "I'm sorry, I couldn't find relevant information in the NCERT textbook to answer your question. I can only assist with topics covered in the Class 10 Math and Science curriculum.";
    await saveMessage(conversationId, 'assistant', fallbackText, userId, tenantId, { 
      subject, mode: 'explain', outcome: 'low_confidence', retrievalTopScore: topScore, retrievedChunkCount: 0 
    });
    return createStaticStream(fallbackText, conversationId, citations, 'refusal');
  }

  // 8. Build Prompt & LLM Call
  const promptMessages = buildPrompt(history, standaloneQuery, contextResults);
  const openaiClient = openai;
  
  const stream = await openaiClient.chat.completions.create({
    model: subject === 'mathematics' ? 'gpt-4o' : 'gpt-4o-mini', // Math gets better reasoning
    messages: promptMessages,
    stream: true,
  });

  // 9. Stream Response & Apply Output Moderation Buffer
  return new ReadableStream({
    async start(controller) {
      // Send Init Event
      const initEvent = JSON.stringify({
        type: 'init',
        conversationId: conversationId!,
        citations,
        outcome: 'success'
      });
      controller.enqueue(`data: ${initEvent}\n\n`);

      let fullResponse = '';

      const moderationBuffer = new ModeratedStreamBuffer(
        (safeText) => {
          fullResponse += safeText;
          const tokenEvent = JSON.stringify({ type: 'token', content: safeText });
          controller.enqueue(`data: ${tokenEvent}\n\n`);
        },
        (error) => {
          const errorEvent = JSON.stringify({ type: 'error', message: error.message, code: 'MODERATION_ERROR' });
          controller.enqueue(`data: ${errorEvent}\n\n`);
        },
        450 // Buffer size
      );

      try {
        for await (const chunk of stream) {
          const content = chunk.choices[0]?.delta?.content || '';
          if (content) {
            await moderationBuffer.addChunk(content);
          }
        }
        await moderationBuffer.flush();

        // 10. Save assistant message after stream completes
        await saveMessage(conversationId!, 'assistant', fullResponse, userId, tenantId, {
           subject, mode: 'explain', outcome: 'success', retrievalTopScore: topScore, retrievedChunkCount: contextResults.length, model: subject === 'mathematics' ? 'gpt-4o' : 'gpt-4o-mini'
        });
      } catch (err) {
        console.error('Streaming error:', err);
        const errorEvent = JSON.stringify({ type: 'error', message: 'Streaming failed', code: 'STREAM_ERROR' });
        controller.enqueue(`data: ${errorEvent}\n\n`);
      } finally {
        controller.close();
      }
    }
  });
}

function createStaticStream(text: string, conversationId: string, citations: CitationMetadata[] = [], outcome: 'success'|'refusal' = 'success'): ReadableStream {
  return new ReadableStream({
    start(controller) {
      const initEvent = JSON.stringify({ type: 'init', conversationId, citations, outcome });
      controller.enqueue(`data: ${initEvent}\n\n`);
      
      const tokenEvent = JSON.stringify({ type: 'token', content: text });
      controller.enqueue(`data: ${tokenEvent}\n\n`);
      
      controller.close();
    }
  });
}

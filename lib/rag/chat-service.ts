import { models, createStreamingChatCompletion, estimateCostUsd } from '../openai';
import { moderateInput, ModeratedStreamBuffer } from '../moderation';
import { reformulateQuery } from './reformulate';
import { retrieveContext, buildCitations, RetrievalResult } from './retrieval';
import { buildPrompt } from './prompt';
import { ChatRequest, CitationMetadata, detectPromptInjection } from '../schemas';
import { saveMessage, fetchHistory, createConversation } from '../../server/conversation-service';
import { AppError, SAFE_ESCALATION_MESSAGE, DistressError } from '../errors';
import { logger } from '../logger';
import { sql } from '../db';
import crypto from 'crypto';

export interface ChatServiceOptions {
  userId: string;
  tenantId: string;
  request: ChatRequest;
  requestId: string;
  startTime: number;
}

export async function executeChatPipeline(options: ChatServiceOptions): Promise<ReadableStream> {
  const { userId, tenantId, request, requestId, startTime } = options;
  const { message, subject, language, conversationId: reqConversationId, chapterId, mode } = request;
  let conversationId = reqConversationId;

  // 1. Prompt Injection Check
  if (detectPromptInjection(message)) {
    throw new AppError('BAD_REQUEST', 'Message contains disallowed content.', 400);
  }

  // 2. Input Moderation
  try {
    await moderateInput(message);
  } catch (error) {
    if (error instanceof DistressError) {
      // Short circuit and return a distress response as stream
      return createStaticStream(SAFE_ESCALATION_MESSAGE, conversationId || 'new');
    }
    throw error;
  }

  // 3. Resolve Conversation & Save User Message
  if (!conversationId) {
    conversationId = await createConversation(tenantId, userId, subject, chapterId);
  }
  
  // Mode-based RAG bypass routing:
  // If the user selects "general" chat mode, we bypass RAG context search and let the model answer freely.
  // If the user selects any academic mode (explain, solve, notes, quiz), they are strictly bound to RAG context.
  const isGeneralChat = mode === 'general';
  
  await saveMessage(conversationId, 'user', message, userId, tenantId, { 
    subject, 
    chapterId, 
    mode: isGeneralChat ? undefined : mode 
  });

  // 4. Fetch History
  const history = await fetchHistory(conversationId, userId, tenantId);

  // 5. Reformulate & Classify Query
  const { query: standaloneQuery, category } = await reformulateQuery(history.slice(0, -1), message);

  let contextResults: RetrievalResult[] = [];
  let citations: CitationMetadata[] = [];
  let topScore = 1.0;
  
  // Decide whether to bypass retrieval:
  // Bypass if the user explicitly chose General Chat, OR if reformulation classified it as chitchat
  const bypassRAG = isGeneralChat || category === 'chitchat';

  const selectedModel = mode === 'solve' ? models.reasoning : models.chat;

  if (!bypassRAG) {
    // 6. Retrieve Context (with filters!)
    contextResults = await retrieveContext(standaloneQuery, { subject, language, chapterId });
    citations = buildCitations(contextResults);

    // 7. Evaluate Retrieval Confidence (Basic Thresholding)
    topScore = contextResults[0]?.score || 0;
    if (topScore < 0.35) {
      // Low confidence -> Fallback
      const fallbackText = "I'm sorry, I couldn't find relevant information in the NCERT textbook to answer your question. I can only assist with topics covered in the Class 10 Math and Science curriculum.";
      const assistantMessageId = crypto.randomUUID();
      const promptTokens = Math.ceil(standaloneQuery.length / 4) + 100;
      const completionTokens = Math.ceil(fallbackText.length / 4);
      const cost = estimateCostUsd(selectedModel, promptTokens, completionTokens);

      await saveMessage(conversationId, 'assistant', fallbackText, userId, tenantId, { 
        id: assistantMessageId,
        subject, 
        mode: isGeneralChat ? undefined : mode, 
        outcome: 'low_confidence', 
        retrievalTopScore: topScore, 
        retrievedChunkCount: 0,
        model: selectedModel,
        inputTokens: promptTokens,
        outputTokens: completionTokens,
        estimatedCostUsd: cost
      });

      // Log low confidence refutation
      const userIdHash = crypto.createHash('sha256').update(userId).digest('hex');
      logger.info({
        requestId,
        userIdHash,
        route: '/api/chat',
        subject,
        chapterId,
        mode,
        statusCode: 200,
        durationMs: Date.now() - startTime,
        retrievalTopScore: topScore,
        retrievedChunkCount: 0,
        model: selectedModel,
        inputTokens: promptTokens,
        outputTokens: completionTokens,
        estimatedCostUsd: cost,
        outcome: 'low_confidence',
      }, 'chat_request_complete');

      // Insert event into DB
      await sql`
        INSERT INTO events (user_id_hash, event_type, subject, chapter_id, mode, outcome, duration_ms, estimated_cost_usd)
        VALUES (${userIdHash}, 'chat_message', ${subject}, ${chapterId || null}, ${mode}, 'low_confidence', ${Date.now() - startTime}, ${cost})
      `;

      return createStaticStream(fallbackText, conversationId, citations, 'refusal', assistantMessageId);
    }
  }

  // Use the provided requestId for the assistant message
  const assistantMessageId = requestId || crypto.randomUUID();

  // 8. Build Prompt & LLM Call
  const promptMessages = buildPrompt(history, standaloneQuery, contextResults, bypassRAG, isGeneralChat);

  
  const stream = await createStreamingChatCompletion({
    model: selectedModel,
    messages: promptMessages,
    stream: true,
    stream_options: { include_usage: true },
  });


  // 9. Stream Response & Apply Output Moderation Buffer
  return new ReadableStream({
    async start(controller) {
      // Send Init Event
      const initEvent = JSON.stringify({
        type: 'init',
        conversationId: conversationId!,
        citations,
        outcome: 'success',
        assistantMessageId
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

      let promptTokens = 0;
      let completionTokens = 0;

      try {
        for await (const chunk of stream) {
          if (chunk.usage) {
            promptTokens = chunk.usage.prompt_tokens;
            completionTokens = chunk.usage.completion_tokens;
          }
          const content = chunk.choices?.[0]?.delta?.content || '';
          if (content) {
            await moderationBuffer.addChunk(content);
          }
        }
        await moderationBuffer.flush();

        const finalPromptTokens = promptTokens || (Math.ceil(standaloneQuery.length / 4) + 500);
        const finalCompletionTokens = completionTokens || Math.ceil(fullResponse.length / 4);
        const finalCost = estimateCostUsd(selectedModel, finalPromptTokens, finalCompletionTokens);

        // 10. Save assistant message after stream completes
        await saveMessage(conversationId!, 'assistant', fullResponse, userId, tenantId, {
           id: assistantMessageId,
           subject, 
           mode: isGeneralChat ? undefined : mode, 
           outcome: 'success', 
           retrievalTopScore: topScore, 
           retrievedChunkCount: contextResults.length, 
           model: selectedModel,
           inputTokens: finalPromptTokens,
           outputTokens: finalCompletionTokens,
           estimatedCostUsd: finalCost
        });

        // Structured Logging on Success
        const userIdHash = crypto.createHash('sha256').update(userId).digest('hex');
        logger.info({
          requestId,
          userIdHash,
          route: '/api/chat',
          subject,
          chapterId,
          mode,
          statusCode: 200,
          durationMs: Date.now() - startTime,
          retrievalTopScore: topScore,
          retrievedChunkCount: contextResults.length,
          model: selectedModel,
          inputTokens: finalPromptTokens,
          outputTokens: finalCompletionTokens,
          estimatedCostUsd: finalCost,
          outcome: 'success',
        }, 'chat_request_complete');

        // Insert event into DB
        await sql`
          INSERT INTO events (user_id_hash, event_type, subject, chapter_id, mode, outcome, duration_ms, estimated_cost_usd)
          VALUES (${userIdHash}, 'chat_message', ${subject}, ${chapterId || null}, ${mode}, 'success', ${Date.now() - startTime}, ${finalCost})
        `;

      } catch (err: unknown) {
        console.error('Streaming error:', err);
        const errorEvent = JSON.stringify({ type: 'error', message: 'Streaming failed', code: 'STREAM_ERROR' });
        controller.enqueue(`data: ${errorEvent}\n\n`);

        const userIdHash = crypto.createHash('sha256').update(userId).digest('hex');
        logger.error({
          requestId,
          userIdHash,
          route: '/api/chat',
          subject,
          chapterId,
          mode,
          statusCode: 500,
          durationMs: Date.now() - startTime,
          retrievalTopScore: topScore,
          retrievedChunkCount: contextResults.length,
          model: selectedModel,
          outcome: 'error',
          error: err instanceof Error ? err.message : String(err),
        }, 'chat_request_complete');

        // Insert failure event into DB
        try {
          await sql`
            INSERT INTO events (user_id_hash, event_type, subject, chapter_id, mode, outcome, duration_ms, estimated_cost_usd)
            VALUES (${userIdHash}, 'chat_message_failed', ${subject}, ${chapterId || null}, ${mode}, 'error', ${Date.now() - startTime}, 0)
          `;
        } catch (dbErr) {
          console.error('Failed to log error event to DB:', dbErr);
        }
      } finally {
        controller.close();
      }
    }
  });
}

function createStaticStream(text: string, conversationId: string, citations: CitationMetadata[] = [], outcome: 'success'|'refusal' = 'success', assistantMessageId?: string): ReadableStream {
  return new ReadableStream({
    start(controller) {
      const initEvent = JSON.stringify({ type: 'init', conversationId, citations, outcome, assistantMessageId });
      controller.enqueue(`data: ${initEvent}\n\n`);
      
      const tokenEvent = JSON.stringify({ type: 'token', content: text });
      controller.enqueue(`data: ${tokenEvent}\n\n`);
      
      controller.close();
    }
  });
}

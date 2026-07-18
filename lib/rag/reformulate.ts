import { openai } from '../openai';
import { ChatMessage } from '../schemas';

const REFORMULATION_PROMPT = `You are a query analysis assistant for StudyNotes+, a CBSE Class 10 AI Tutor platform.
Given a conversation history and a new user query, your task is to reformulate the query into a standalone query for database search AND classify the query category.

You MUST return a JSON object with the following schema:
{
  "query": "The reformulated standalone query suitable for semantic database lookup (if the input is conversational/greeting, keep it minimal)",
  "category": "chitchat" | "academic"
}

Category definition:
- "chitchat": Greetings, friendly banter, introductions, jokes, meta-questions about the AI, or simple instructions ("Hi", "How are you?", "Who are you?", "Help me").
- "academic": Questions or requests seeking academic explanations, textbook facts, problem-solving help, quizzes, or note-generation for CBSE Class 10 Math/Science (e.g. "Explain photosynthesis", "Solve x^2 - 4 = 0", "Generate notes for Ch 1").

Do NOT answer the question. Only return the JSON object.`;

export interface ReformulatedResponse {
  query: string;
  category: 'chitchat' | 'academic';
}

export async function reformulateQuery(messages: ChatMessage[], newQuery: string): Promise<ReformulatedResponse> {
  const openaiClient = openai;
  const contextMessages = (messages || []).map(m => `${m.role}: ${m.content}`).join('\n');
  
  try {
    const response = await openaiClient.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: REFORMULATION_PROMPT },
        { role: 'user', content: `Conversation History:\n${contextMessages}\n\nNew Query: ${newQuery}` }
      ],
      response_format: { type: 'json_object' },
      temperature: 0,
      max_tokens: 250,
    });

    const text = response.choices[0].message.content?.trim();
    if (text) {
      const parsed = JSON.parse(text) as ReformulatedResponse;
      if (parsed.query && parsed.category) {
        return parsed;
      }
    }
  } catch (err) {
    console.error('Error in query classification/reformulation:', err);
  }

  // Fallback if anything fails
  return {
    query: newQuery,
    category: 'academic' // Safe default to run RAG
  };
}

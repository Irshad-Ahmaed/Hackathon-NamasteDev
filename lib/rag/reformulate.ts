import { openai } from '../openai';
import { ChatMessage } from '../schemas';

const REFORMULATION_PROMPT = `You are a query reformulation assistant for a CBSE Class 10 learning platform.
Given a conversation history and a new user query, reformulate the user's latest query into a standalone question that can be used for semantic search over a textbook database.
If the query is already standalone, return it as is. Do not answer the question. Only return the reformulated question.`;

export async function reformulateQuery(messages: ChatMessage[], newQuery: string): Promise<string> {
  // If there's no history, no need to reformulate
  if (!messages || messages.length === 0) {
    return newQuery;
  }

  const openaiClient = openai;
  
  const contextMessages = messages.map(m => `${m.role}: ${m.content}`).join('\n');
  
  const response = await openaiClient.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: REFORMULATION_PROMPT },
      { role: 'user', content: `Conversation History:\n${contextMessages}\n\nNew Query: ${newQuery}` }
    ],
    temperature: 0,
    max_tokens: 250,
  });

  return response.choices[0].message.content?.trim() || newQuery;
}

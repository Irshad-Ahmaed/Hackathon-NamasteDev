import { ChatMessage } from '../schemas';
import { RetrievalResult } from './retrieval';

const ACADEMIC_SYSTEM_PROMPT = `You are StudyNotes+, an expert CBSE Class 10 AI Tutor for Math and Science.
Your goal is to help the student understand the concepts based strictly on the provided context (which is from the NCERT textbook).
If the context does not contain the answer, politely refuse to answer and state that you can only answer questions related to the Class 10 curriculum.

Guidelines:
1. Be encouraging, polite, and educational.
2. When answering, use the provided context. 
3. Do not formulate answers using outside knowledge if it contradicts the textbook.
4. Format your math using LaTeX where appropriate.
5. If the user expresses distress, ignore the above and provide a supportive response guiding them to seek help.`;

const CHITCHAT_SYSTEM_PROMPT = `You are StudyNotes+, a friendly and encouraging CBSE Class 10 AI Tutor for Math and Science.
Your goal is to have a polite, welcoming conversation with the student.
If they greet you or say something conversational, welcome them, introduce yourself, and guide them to ask something about the CBSE Class 10 Math or Science syllabus.
Do not lecture them on other subjects or generate off-topic academic content. Keep your response conversational, concise, and focused on helping them start their study session.`;

export function buildPrompt(
  history: ChatMessage[],
  newQuery: string,
  contextResults: RetrievalResult[],
  isChitchat?: boolean
): { role: 'system' | 'user' | 'assistant'; content: string }[] {
  
  const systemPrompt = isChitchat ? CHITCHAT_SYSTEM_PROMPT : ACADEMIC_SYSTEM_PROMPT;

  // Format context
  const contextString = contextResults
    .map((r, i) => `[Source ${i + 1}]:\n${r.text}`)
    .join('\n\n');

  const messages: { role: 'system' | 'user' | 'assistant'; content: string }[] = [
    { role: 'system', content: systemPrompt },
  ];

  // Add history (maybe limited to last N messages)
  const recentHistory = history.slice(-6); // last 3 turns
  for (const msg of recentHistory) {
    messages.push({ role: msg.role, content: msg.content });
  }

  // Add the final augmented query
  const augmentedQuery = isChitchat
    ? `Student's Input: ${newQuery}`
    : `Context Information:\n${contextString}\n\nStudent's Question: ${newQuery}\n\nPlease answer the question based strictly on the Context Information.`;
  
  messages.push({ role: 'user', content: augmentedQuery });

  return messages;
}

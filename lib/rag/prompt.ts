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

// Used when the LLM auto-classifies the query as a greeting / small-talk (chitchat category)
const CHITCHAT_SYSTEM_PROMPT = `You are StudyNotes+, a friendly and encouraging CBSE Class 10 AI Tutor for Math and Science.
Your goal is to have a polite, welcoming conversation with the student.
If they greet you or say something conversational, welcome them, introduce yourself, and guide them to ask something about the CBSE Class 10 Math or Science syllabus.
Do not lecture them on other subjects or generate off-topic academic content. Keep your response conversational, concise, and focused on helping them start their study session.`;

// Used when the user explicitly switches to "General Chat" mode in the UI
const GENERAL_CHAT_SYSTEM_PROMPT = `You are StudyNotes+, a smart and helpful AI assistant. 
The student has switched to General Chat mode, meaning they want to talk freely without being restricted to any specific textbook or curriculum.
You can answer any topic — science, math, history, current events, coding, life advice, or casual conversation — accurately and helpfully.
Be friendly, clear, and engaging. If the student mentions school or academic topics, feel free to connect your answer to their studies where relevant.
Always be safe, respectful, and age-appropriate for a Class 10 student.`;

export function buildPrompt(
  history: ChatMessage[],
  newQuery: string,
  contextResults: RetrievalResult[],
  bypassRAG?: boolean,
  isGeneralChat?: boolean
): { role: 'system' | 'user' | 'assistant'; content: string }[] {
  
  // Select the right system prompt:
  // - isGeneralChat (user picked 💬 General Chat): full freedom, no NCERT constraints
  // - bypassRAG but not general (auto-detected chitchat): warm redirect to syllabus
  // - Academic mode: strict NCERT context-grounded answers
  let systemPrompt: string;
  if (isGeneralChat) {
    systemPrompt = GENERAL_CHAT_SYSTEM_PROMPT;
  } else if (bypassRAG) {
    systemPrompt = CHITCHAT_SYSTEM_PROMPT;
  } else {
    systemPrompt = ACADEMIC_SYSTEM_PROMPT;
  }

  // Format context (empty string when bypassRAG)
  const contextString = contextResults
    .map((r, i) => `[Source ${i + 1}]:\n${r.text}`)
    .join('\n\n');

  const messages: { role: 'system' | 'user' | 'assistant'; content: string }[] = [
    { role: 'system', content: systemPrompt },
  ];

  // Add history (last 3 turns = 6 messages)
  const recentHistory = history.slice(-6);
  for (const msg of recentHistory) {
    messages.push({ role: msg.role, content: msg.content });
  }

  // Add the final augmented query with appropriate framing
  let augmentedQuery: string;
  if (isGeneralChat) {
    augmentedQuery = newQuery;
  } else if (bypassRAG) {
    augmentedQuery = `Student's Input: ${newQuery}`;
  } else {
    augmentedQuery = `Context Information:\n${contextString}\n\nStudent's Question: ${newQuery}\n\nPlease answer the question based strictly on the Context Information.`;
  }
  
  messages.push({ role: 'user', content: augmentedQuery });

  return messages;
}

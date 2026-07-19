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

// Used for interactive quiz mode
const QUIZ_SYSTEM_PROMPT = `You are StudyNotes+, an expert CBSE Class 10 AI Tutor for Math and Science.
Your goal is to test the student by generating quiz questions (MCQs or short-answer) strictly based on the provided context (which is from the NCERT textbook).

Guidelines:
1. Generate 3 to 5 questions based on the retrieved textbook context.
2. For each question, provide a helpful "Hint:" to guide the student, but do NOT provide the answer.
3. Do NOT reproduce verbatim exam questions from past papers — generate similar conceptual questions instead.
4. Format math equations using LaTeX.
5. If the student answers, check their answers in the next turn. Tell them which answers are correct, grade their attempt, and explain the correct answers clearly using the textbook context.
6. Format your output clearly (e.g., using "Q1.", "Hint:").`;

export function buildPrompt(
  history: ChatMessage[],
  newQuery: string,
  contextResults: RetrievalResult[],
  bypassRAG?: boolean,
  isGeneralChat?: boolean,
  isQuiz?: boolean
): { role: 'system' | 'user' | 'assistant'; content: string }[] {
  
  // Select the right system prompt:
  // - isGeneralChat (user picked 💬 General Chat): full freedom, no NCERT constraints
  // - isQuiz (user picked 🎯 Quiz Me): interactive test questions with hints
  // - bypassRAG but not general (auto-detected chitchat): warm redirect to syllabus
  // - Academic mode: strict NCERT context-grounded answers
  let systemPrompt: string;
  if (isGeneralChat) {
    systemPrompt = GENERAL_CHAT_SYSTEM_PROMPT;
  } else if (isQuiz) {
    systemPrompt = QUIZ_SYSTEM_PROMPT;
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
  } else if (isQuiz) {
    augmentedQuery = `Context Information:\n${contextString}\n\nStudent's Input/Response: ${newQuery}\n\nPlease generate a quiz or evaluate the student's answer based strictly on the Context Information.`;
  } else if (bypassRAG) {
    augmentedQuery = `Student's Input: ${newQuery}`;
  } else {
    augmentedQuery = `Context Information:\n${contextString}\n\nStudent's Question: ${newQuery}\n\nPlease answer the question based strictly on the Context Information.`;
  }
  
  messages.push({ role: 'user', content: augmentedQuery });

  return messages;
}

// --- Interactive Notes Workspace prompts -----------------------------------

const HIGHLIGHT_CONVENTION = `Highlighting rules (IMPORTANT — never emit raw HTML or style attributes):
- Inline emphasis: wrap text in double equals, e.g. ==key term==.
- Block highlight: use a fenced block on its own lines:
  :::highlight-yellow
  content
  :::
  Allowed colors: highlight-yellow, highlight-green, highlight-blue, highlight-red.
- Do NOT output <mark>, <span>, style="...", or any HTML. Use only Markdown and the conventions above.`;

const NOTES_STRUCTURE = `Produce structured Markdown with these sections (omit a section only if truly not applicable):
- ## Overview
- ## Key Concepts
- ## Definitions
- ## Formulas (use LaTeX, e.g. $a^2 + b^2 = c^2$)
- ## Worked Examples (or a clearly marked source-backed summary)
- ## Common Mistakes
- ## Revision Checklist
- ## Sources (cite NCERT chapter/pages when factual content comes from the provided context)`;

const NOTES_GENERATION_SYSTEM = `You are StudyNotes+, an expert CBSE Class 10 AI Tutor for Math and Science.
You are generating a student's private study-notes document from NCERT source text.
Ground all factual content strictly in the provided source text. Do not invent facts, formulas, or examples that are not supported by the source.
${NOTES_STRUCTURE}
${HIGHLIGHT_CONVENTION}`;

const NOTES_EDIT_SYSTEM_TRANSFORM = `You are StudyNotes+, editing a student's existing study-notes document.
The user gives a formatting/organization instruction (e.g. highlight, reorder, shorten, remove).
Return the COMPLETE updated Markdown document — not a diff, not a fragment.
Preserve all correct existing content and any existing citations. Do NOT add new factual claims.
${HIGHLIGHT_CONVENTION}`;

const NOTES_EDIT_SYSTEM_KNOWLEDGE = `You are StudyNotes+, editing a student's existing study-notes document.
The user asks to add knowledge (examples, definitions, derivations, facts, or exam questions).
You are given approved NCERT source context. Only add content that is supported by that context, and cite it in a ## Sources section.
If the context does not support the request, keep the document unchanged except for a short note explaining you could not find supporting NCERT content.
Return the COMPLETE updated Markdown document — not a diff, not a fragment.
Preserve all correct existing content and existing citations.
${HIGHLIGHT_CONVENTION}`;

export function buildNotesGenerationPrompt(
  subject: 'mathematics' | 'science',
  chapterNumber: number,
  chapterTitle: string,
  chapterText: string
): { role: 'system' | 'user'; content: string }[] {
  return [
    { role: 'system', content: NOTES_GENERATION_SYSTEM },
    {
      role: 'user',
      content: `Subject: ${subject}\nChapter ${chapterNumber}: ${chapterTitle}\n\nNCERT source text:\n\n${chapterText}\n\nTask: Generate the study-notes document now. Maximum ~1200 words.`,
    },
  ];
}

export function buildNotesEditPrompt(
  documentContent: string,
  instruction: string,
  commandClass: 'transform' | 'knowledge',
  contextText: string
): { role: 'system' | 'user'; content: string }[] {
  const system =
    commandClass === 'knowledge' ? NOTES_EDIT_SYSTEM_KNOWLEDGE : NOTES_EDIT_SYSTEM_TRANSFORM;

  const contextBlock =
    commandClass === 'knowledge'
      ? `\n\nApproved NCERT context (only use facts supported here):\n${contextText || '[No approved context was found for this chapter.]'}`
      : '';

  return [
    { role: 'system', content: system },
    {
      role: 'user',
      content: `Current document:\n\n${documentContent}\n\nInstruction: ${instruction}${contextBlock}\n\nReturn the complete updated Markdown document.`,
    },
  ];
}

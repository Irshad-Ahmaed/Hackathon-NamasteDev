# StudyNotes+ — Hackathon Pitch Deck

> Copy each "## Slide N" section into one slide. Bullets = on-slide text.
> "Speaker notes" = what you say. Keep ~7 slides for a 3–5 min pitch.

---

## Slide 1 — Title

**StudyNotes+** — *MVP*
*AI-powered interactive study companion — starting with CBSE Class 10 (Math & Science)*

- Built for: Indian students preparing for CBSE Class 10 board exams
- Grounded in official NCERT curriculum — not generic chatbot answers
- Live demo: Generate Notes, ask questions, watch the AI build a personal revision canvas
- This is an MVP proving the core idea: **learn and generate notes at the same time, with zero effort** — built to scale to any class, subject, and a fully autonomous AI agent

**Speaker notes:** Students drown in PDFs and YouTube but have no structured, editable, exam-ready notes they own. StudyNotes+ turns the textbook into an interactive, AI-assisted study workspace. Frame it as an MVP: the wedge is CBSE Class 10, the vision is a cross-class, cross-subject platform with an autonomous agent and B2B+B2C reach.

---

## Slide 2 — The Problem

Students struggle to study effectively:

- NCERT textbooks are long and unstructured; hard to convert into revision material
- Generic AI chat gives answers that may be wrong or off-syllabus
- Notes taken in chat disappear; no single editable, owned revision document
- No safe way to ask the AI to *restructure* their own notes without losing work

**Speaker notes:** The gap is not "more content" — it's *trusted, editable, personal* study material tied to the exact syllabus. Privacy and safety matter because the users are minors.

---

## Slide 3 — Our Solution

**StudyNotes+ = NCERT-grounded chat + a student-owned, AI-editable notes canvas**

- **Explain / Solve modes:** RAG over approved NCERT chunks with citations
- **Generate Notes mode:** AI drafts a structured revision document in the canvas
- **AI Commands:** "highlight key points", "add a derivation", "reorder" — applied safely
- **Manual editing + LaTeX (KaTeX):** formulas render properly
- **Revisions, Undo, conflict handling:** every change is versioned and recoverable

**Speaker notes:** Two surfaces — a chat for questions, and a notes canvas that persists. The differentiating feature is the canvas: it's *the student's* document, editable by them and by the AI, with full version history.

---

## Slide 4 — Demo Flow (what to click)

1. Sign in → pick **Mathematics** → choose a chapter
2. Ask a question in **Explain** mode → see cited NCERT-grounded answer
3. Switch to **Generate Notes** → AI streams a structured revision doc into the canvas
4. Type a command: *"highlight the main points in green"* → AI edits only that, keeps the rest
5. Undo / refresh → your notes and revision history are still there

**Speaker notes:** Emphasize the side-by-side desktop layout we just built: chat and canvas split 50/50, so the student watches notes build next to the conversation. On mobile it overlays.

---

## Slide 5 — How It Works (Architecture)

- **Next.js 16 (App Router) + React 19 + TypeScript** frontend
- **Retrieval:** Qdrant vector DB + OpenAI embeddings over approved NCERT chunks
- **LLM:** OpenAI chat / reasoning / moderation models, streamed over SSE
- **Data:** Neon PostgreSQL (tenants, conversations, note documents + versions)
- **Safety/scale:** Clerk auth, Upstash Redis rate limiting, Sentry, moderation
- **Ownership boundary:** every query scoped by `user_id` + `tenant_id`

**Speaker notes:** Point to the two sequence diagrams in the README if asked. Key idea: the AI never writes to the student's saved doc until a server-authoritative `note_document_saved` event — so previews can't corrupt work.

---

## Slide 6 — What Makes It Safe & Robust

- **Tenant + user-scoped data:** students only see their own workspace
- **Optimistic concurrency:** `expectedRevision` check → `409` on conflict, never silent overwrite
- **Smallest-change editing:** AI transforms only the targeted text, preserves the rest
- **Safe highlights:** fixed CSS class allowlist; no raw HTML / inline styles accepted
- **Moderation + encryption:** inputs/outputs moderated, message content encrypted
- **Cancellation-safe streams:** stopping generation can't leave a half-saved doc

**Speaker notes:** This is the part judges care about for a student product — we engineered for failure modes (concurrent edits, cancelled streams, prompt injection) rather than happy paths.

---

## Slide 7 — Impact & Future Scope

**Why it matters (the core purpose)**
- A platform where students **learn and generate notes at the same time, with zero effort**
- Turns a 300-page NCERT PDF into a personal, owned, versioned revision document
- Students stay on-syllabus (NCERT-only retrieval) with source citations

**Future scope (this is an MVP)**
- Any class & subject — not limited to CBSE Class 10 Maths/Science
- Autonomous AI agent — no need to select subject, course, or mode; the agent figures it out
- B2B + B2C — schools/institutions and direct-to-student

**Speaker notes:** Close by offering to live-demo any slide. Emphasize this is an MVP wedge: prove the "learn + notes together" loop on one exam, then expand horizontally (classes/subjects), vertically (agent autonomy), and commercially (B2B and B2C). Thank the judges.

---

## Backup / Appendix (only if asked)

- **Note document model:** `user_note_documents` (one per student+chapter) with `user_note_document_versions` archive; uniqueness `(tenant_id, user_id, subject, chapter_number, language)`
- **API contract:** `POST/GET/PATCH /api/note-documents`, `POST .../commands`, `POST .../undo`; legacy `/api/notes` returns `410 Gone`
- **Stream event:** `{ type: "note_document_saved", documentId, revision, operation, citations }` — client treats doc as saved only after this, not after transport `done`
- **Quality gates:** `tsc --noEmit`, `eslint`, `vitest` (18 tests: ownership, tenant boundary, concurrency, command classification, prompt injection)
- **Limits:** notes ≤ 24,000 chars, instructions ≤ 1,000 chars; inputs/outputs moderated

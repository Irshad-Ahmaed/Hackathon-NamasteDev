import pptxgen from "pptxgenjs";
import fs from "fs";

const pptx = new pptxgen();
pptx.defineLayout({ name: "WIDE", width: 13.333, height: 7.5 });
pptx.layout = "WIDE";
pptx.author = "StudyNotes+";
pptx.title = "StudyNotes+ — Hackathon Pitch Deck";

// ---- Palette (CBSE/education-inspired indigo + amber) ----
const C = {
  bg: "0B1020",        // deep navy
  bg2: "121A33",       // panel
  indigo: "6366F1",    // primary accent
  indigo2: "818CF8",
  amber: "F59E0B",     // secondary accent
  amber2: "FBBF24",
  teal: "2DD4BF",
  text: "F8FAFC",
  muted: "94A3B8",
  card: "1A2440",
  cardLine: "2C3A63",
  white: "FFFFFF",
};

const W = 13.333, H = 7.5;

// ---- helpers ----
function bg(slide, top = C.bg) {
  // base fill
  slide.background = { color: top };
  // decorative gradient orbs via semi-transparent ovals
  slide.addShape(pptx.ShapeType.ellipse, {
    x: -1.5, y: -2, w: 5, h: 5, fill: { color: C.indigo, transparency: 82 }, line: { type: "none" },
  });
  slide.addShape(pptx.ShapeType.ellipse, {
    x: W - 3.5, y: H - 3, w: 5.5, h: 5.5, fill: { color: C.amber, transparency: 88 }, line: { type: "none" },
  });
  slide.addShape(pptx.ShapeType.ellipse, {
    x: W - 1.2, y: -1.5, w: 3, h: 3, fill: { color: C.teal, transparency: 90 }, line: { type: "none" },
  });
}

function chip(slide, x, y, w, text, fill, txtColor = C.white) {
  slide.addShape(pptx.ShapeType.roundRect, {
    x, y, w, h: 0.42, rectRadius: 0.21,
    fill: { color: fill }, line: { type: "none" },
  });
  slide.addText(text, {
    x, y, w, h: 0.42, align: "center", valign: "middle",
    fontFace: "Arial", fontSize: 11, bold: true, color: txtColor,
  });
}

function title(slide, text, sub) {
  slide.addText(text, {
    x: 0.7, y: 0.45, w: 11.9, h: 0.9,
    fontFace: "Arial", fontSize: 34, bold: true, color: C.text,
  });
  if (sub) {
    slide.addText(sub, {
      x: 0.72, y: 1.35, w: 11.8, h: 0.5,
      fontFace: "Arial", fontSize: 15, italic: true, color: C.muted,
    });
  }
}

function accentBar(slide) {
  slide.addShape(pptx.ShapeType.roundRect, {
    x: 0.7, y: 1.32, w: 1.6, h: 0.09, rectRadius: 0.045,
    fill: { color: C.amber }, line: { type: "none" },
  });
}

function bullets(slide, items, x, y, w, h, opts = {}) {
  const fs2 = opts.fontSize || 15;
  const gap = opts.gap || 0.62;
  let cy = y;
  items.forEach((it, i) => {
    // bullet dot
    slide.addShape(pptx.ShapeType.ellipse, {
      x, y: cy + 0.07, w: 0.14, h: 0.14,
      fill: { color: i % 2 === 0 ? C.indigo : C.amber }, line: { type: "none" },
    });
    slide.addText(it, {
      x: x + 0.32, y: cy - 0.06, w: w - 0.32, h: gap,
      fontFace: "Arial", fontSize: fs2, color: C.text, valign: "top", lineSpacingMultiple: 1.05,
    });
    cy += gap;
  });
}

function footer(slide, n) {
  slide.addText("StudyNotes+", {
    x: 0.7, y: H - 0.5, w: 4, h: 0.3, fontFace: "Arial", fontSize: 9, color: C.muted,
  });
  slide.addText(`${n} / 7`, {
    x: W - 1.7, y: H - 0.5, w: 1, h: 0.3, align: "right", fontFace: "Arial", fontSize: 9, color: C.muted,
  });
}

// =========================================================
// SLIDE 1 — TITLE
// =========================================================
{
  const s = pptx.addSlide();
  bg(s, C.bg);
  s.addShape(pptx.ShapeType.roundRect, {
    x: 0.9, y: 1.7, w: 3.0, h: 0.55, rectRadius: 0.27,
    fill: { color: C.indigo }, line: { type: "none" },
  });
  s.addText("AI STUDY COMPANION", {
    x: 0.9, y: 1.7, w: 3.0, h: 0.55, align: "center", valign: "middle",
    fontFace: "Arial", fontSize: 12, bold: true, color: C.white, charSpacing: 1,
  });
  s.addText("StudyNotes+", {
    x: 0.85, y: 2.2, w: 11.6, h: 1.3,
    fontFace: "Arial", fontSize: 60, bold: true, color: C.text,
  });
  s.addShape(pptx.ShapeType.roundRect, {
    x: 0.9, y: 3.35, w: 1.5, h: 0.45, rectRadius: 0.22,
    fill: { color: C.teal }, line: { type: "none" },
  });
  s.addText("MVP", {
    x: 0.9, y: 3.35, w: 1.5, h: 0.45, align: "center", valign: "middle",
    fontFace: "Arial", fontSize: 13, bold: true, color: "06231F", charSpacing: 1,
  });
  // gradient accent underline
  s.addShape(pptx.ShapeType.roundRect, {
    x: 0.9, y: 3.75, w: 4.2, h: 0.12, rectRadius: 0.06,
    fill: { color: C.amber }, line: { type: "none" },
  });
  s.addText(
    "Interactive, NCERT-grounded study workspace for CBSE Class 10 — Maths & Science.",
    { x: 0.9, y: 4.0, w: 11.4, h: 0.7, fontFace: "Arial", fontSize: 20, color: C.indigo2 }
  );
  s.addText(
    "An MVP proving the core idea: learn and generate notes at the same time, with zero effort. Built to scale to any class, subject, and a fully autonomous AI agent.",
    { x: 0.9, y: 4.75, w: 11.4, h: 0.8, fontFace: "Arial", fontSize: 15, italic: true, color: C.muted }
  );
  chip(s, 0.9, 5.95, 2.4, "LIVE DEMO", C.amber, "1A1A1A");
  chip(s, 3.5, 5.95, 3.2, "MVP · NEXT.JS 16", C.card, C.indigo2);
  footer(s, 1);
}

// =========================================================
// SLIDE 2 — THE PROBLEM
// =========================================================
{
  const s = pptx.addSlide();
  bg(s);
  title(s, "The Problem", "Students have content — but not study material they own or trust.");
  accentBar(s);
  const items = [
    "NCERT textbooks are long and unstructured — turning 300 pages into revision notes is slow and tedious.",
    "Generic AI chat gives answers that may be wrong, off-syllabus, or impossible to verify.",
    "Useful notes typed in chat disappear — there is no single editable, owned revision document.",
    "Students can't safely ask the AI to restructure their own notes without risking lost work.",
  ];
  bullets(s, items, 0.9, 1.9, 11.5, 4.8, { fontSize: 16, gap: 0.95 });
  // side stat card
  s.addShape(pptx.ShapeType.roundRect, {
    x: 10.4, y: 1.95, w: 2.2, h: 3.6, rectRadius: 0.18,
    fill: { color: C.card }, line: { color: C.cardLine, width: 1 },
  });
  s.addText("300+", { x: 10.4, y: 2.2, w: 2.2, h: 0.8, align: "center", fontFace: "Arial", fontSize: 34, bold: true, color: C.amber });
  s.addText("pages per\nNCERT book", { x: 10.4, y: 3.0, w: 2.2, h: 0.8, align: "center", fontFace: "Arial", fontSize: 12, color: C.muted });
  s.addText("0", { x: 10.4, y: 3.9, w: 2.2, h: 0.8, align: "center", fontFace: "Arial", fontSize: 34, bold: true, color: C.indigo2 });
  s.addText("owned, editable\nrevision docs", { x: 10.4, y: 4.7, w: 2.2, h: 0.8, align: "center", fontFace: "Arial", fontSize: 12, color: C.muted });
  footer(s, 2);
}

// =========================================================
// SLIDE 3 — SOLUTION
// =========================================================
{
  const s = pptx.addSlide();
  bg(s);
  title(s, "Our Solution", "NCERT-grounded chat + a student-owned, AI-editable notes canvas.");
  accentBar(s);
  const cards = [
    { t: "Explain / Solve", d: "RAG over approved NCERT chunks with source citations.", c: C.indigo },
    { t: "Generate Notes", d: "AI drafts a structured revision document straight into the canvas.", c: C.amber },
    { t: "AI Commands", d: '"Highlight key points", "add a derivation", "reorder" — applied safely.', c: C.teal },
    { t: "Manual + LaTeX", d: "Edit Markdown; KaTeX renders formulas correctly.", c: C.indigo2 },
    { t: "Revisions", d: "Undo, version history and conflict handling on every change.", c: C.amber2 },
    { t: "Side-by-side", d: "Desktop: chat and canvas split 50/50. Mobile: overlay.", c: C.indigo },
  ];
  const cw = 3.75, ch = 2.05, gx = 0.35, gy = 0.35;
  const ox = 0.9, oy = 2.0;
  cards.forEach((card, i) => {
    const col = i % 3, row = Math.floor(i / 3);
    const x = ox + col * (cw + gx), y = oy + row * (ch + gy);
    s.addShape(pptx.ShapeType.roundRect, {
      x, y, w: cw, h: ch, rectRadius: 0.14,
      fill: { color: C.card }, line: { color: C.cardLine, width: 1 },
    });
    s.addShape(pptx.ShapeType.roundRect, {
      x: x + 0.25, y: y + 0.25, w: 0.5, h: 0.12, rectRadius: 0.06,
      fill: { color: card.c }, line: { type: "none" },
    });
    s.addText(card.t, { x: x + 0.25, y: y + 0.45, w: cw - 0.5, h: 0.5, fontFace: "Arial", fontSize: 17, bold: true, color: C.text });
    s.addText(card.d, { x: x + 0.25, y: y + 1.0, w: cw - 0.5, h: 0.9, fontFace: "Arial", fontSize: 13, color: C.muted, lineSpacingMultiple: 1.05 });
  });
  footer(s, 3);
}

// =========================================================
// SLIDE 4 — DEMO FLOW
// =========================================================
{
  const s = pptx.addSlide();
  bg(s);
  title(s, "Live Demo Flow", "Five clicks from sign-in to a personalized, versioned revision doc.");
  accentBar(s);
  const steps = [
    "Sign in → pick Mathematics → choose a chapter",
    "Ask in Explain mode → see a cited, NCERT-grounded answer",
    "Switch to Generate Notes → AI streams a structured doc into the canvas",
    'Type: "highlight the main points in green" → AI edits only that, keeps the rest',
    "Undo / refresh → your notes and full revision history are still there",
  ];
  let y = 2.0;
  steps.forEach((st, i) => {
    s.addShape(pptx.ShapeType.ellipse, {
      x: 0.95, y, w: 0.6, h: 0.6, fill: { color: i % 2 ? C.amber : C.indigo }, line: { type: "none" },
    });
    s.addText(String(i + 1), { x: 0.95, y, w: 0.6, h: 0.6, align: "center", valign: "middle", fontFace: "Arial", fontSize: 20, bold: true, color: C.white });
    s.addText(st, { x: 1.8, y: y - 0.05, w: 10.6, h: 0.7, fontFace: "Arial", fontSize: 17, color: C.text, valign: "middle" });
    if (i < steps.length - 1) {
      s.addShape(pptx.ShapeType.line, { x: 1.25, y: y + 0.6, w: 0, h: 0.42, line: { color: C.cardLine, width: 1.5, dashType: "dash" } });
    }
    y += 1.02;
  });
  footer(s, 4);
}

// =========================================================
// SLIDE 5 — ARCHITECTURE
// =========================================================
{
  const s = pptx.addSlide();
  bg(s);
  title(s, "How It Works", "A streaming, retrieval-augmented pipeline with a strict ownership boundary.");
  accentBar(s);
  const items = [
    "Frontend: Next.js 16 (App Router) + React 19 + TypeScript, streamed over SSE",
    "Retrieval: Qdrant vector DB + OpenAI embeddings over approved NCERT chunks",
    "LLM: OpenAI chat / reasoning / moderation models, token-streamed to the UI",
    "Data: Neon PostgreSQL — tenants, conversations, note documents + versions",
    "Safety & scale: Clerk auth, Upstash Redis rate limiting, Sentry, moderation",
    "Ownership: every query scoped by user_id + tenant_id — students see only their workspace",
  ];
  bullets(s, items, 0.9, 1.95, 11.5, 4.6, { fontSize: 15.5, gap: 0.72 });
  footer(s, 5);
}

// =========================================================
// SLIDE 6 — SAFETY & ROBUSTNESS
// =========================================================
{
  const s = pptx.addSlide();
  bg(s);
  title(s, "Safe & Robust by Design", "Engineered for failure modes, not just happy paths.");
  accentBar(s);
  const items = [
    "Tenant + user-scoped data — students only ever see their own workspace",
    "Optimistic concurrency — expectedRevision check returns 409 on conflict, never silent overwrite",
    "Smallest-change editing — AI transforms only targeted text, preserves everything else",
    "Safe highlights — fixed CSS class allowlist; no raw HTML or inline styles accepted",
    "Moderation + encryption — inputs and outputs moderated, message content encrypted",
    "Cancellation-safe streams — stopping generation can't leave a half-saved document",
  ];
  bullets(s, items, 0.9, 1.95, 11.5, 4.6, { fontSize: 15.5, gap: 0.72 });
  footer(s, 6);
}

// =========================================================
// SLIDE 7 — IMPACT & NEXT
// =========================================================
{
  const s = pptx.addSlide();
  bg(s);
  title(s, "Impact & Future Scope", "An MVP today — a platform for effortless learning + notes tomorrow.");
  accentBar(s);
  // two columns
  s.addShape(pptx.ShapeType.roundRect, { x: 0.9, y: 2.0, w: 5.7, h: 3.7, rectRadius: 0.14, fill: { color: C.card }, line: { color: C.cardLine, width: 1 } });
  s.addText("WHY IT MATTERS", { x: 1.15, y: 2.2, w: 5.2, h: 0.4, fontFace: "Arial", fontSize: 14, bold: true, color: C.amber, charSpacing: 1 });
  bullets(s, [
    "Core purpose: a platform where students learn and generate notes at the same time, with zero effort",
    "Turns a 300-page NCERT book into a personal, owned, versioned revision doc",
    "Students stay on-syllabus (NCERT-only retrieval) with source citations",
  ], 1.15, 2.7, 5.2, 2.8, { fontSize: 14, gap: 0.78 });

  s.addShape(pptx.ShapeType.roundRect, { x: 6.8, y: 2.0, w: 5.7, h: 3.7, rectRadius: 0.14, fill: { color: C.card }, line: { color: C.cardLine, width: 1 } });
  s.addText("FUTURE SCOPE", { x: 7.05, y: 2.2, w: 5.2, h: 0.4, fontFace: "Arial", fontSize: 14, bold: true, color: C.teal, charSpacing: 1 });
  bullets(s, [
    "Any class & subject — not just CBSE Class 10 Maths/Science",
    "Autonomous AI agent — no need to pick subject, course, or mode",
    "B2B + B2C: schools/institutions and direct-to-student",
  ], 7.05, 2.7, 5.2, 2.8, { fontSize: 14, gap: 0.78 });
  footer(s, 7);
}

// =========================================================
// APPENDIX
// =========================================================
{
  const s = pptx.addSlide();
  bg(s);
  title(s, "Appendix — For the Judges", "Deep-dive facts if asked.");
  accentBar(s);
  const items = [
    "Data model: user_note_documents (one per student+chapter) with user_note_document_versions archive; uniqueness (tenant_id, user_id, subject, chapter_number, language)",
    "API: POST/GET/PATCH /api/note-documents, POST .../commands, POST .../undo; legacy /api/notes returns 410 Gone",
    "Stream event { type: 'note_document_saved', documentId, revision, operation, citations } — client treats doc as saved only after this, not after transport 'done'",
    "Quality gates: tsc --noEmit, eslint, vitest (18 tests: ownership, tenant boundary, concurrency, command classification, prompt injection)",
    "Limits: notes ≤ 24,000 chars, instructions ≤ 1,000 chars; inputs/outputs moderated",
  ];
  bullets(s, items, 0.9, 1.95, 11.6, 4.8, { fontSize: 13.5, gap: 0.82 });
  footer(s, 7);
}

const out = "docs/StudyNotes+-Pitch-Deck.pptx";
pptx.writeFile({ fileName: out }).then(() => {
  console.log("Wrote", out, fs.statSync(out).size, "bytes");
});

import type { Difficulty, QuizConfig, ShortAnswerItem, TopicSuggestion } from '@shared/types'

export const QUIZ_SYSTEM = `You are an expert examiner and instructional designer building a diagnostic quiz for a self-study app.
You write precise, fair questions that test understanding rather than trivia. You never leak the answer inside the question. You always reply with strict JSON and nothing else.`

export const GRADE_SYSTEM = `You are a careful, fair examiner marking short-answer responses for a self-study app.
You judge meaning, not wording. You are precise about misconceptions and never inflate a grade, but you are warm and specific in your feedback. You always reply with strict JSON and nothing else.`

export const LESSON_SYSTEM = `You are an exceptional private tutor writing written lessons for a self-study app.
Your explanations are clear, concrete and beautifully structured. You use plain language, memorable analogies and worked examples. You talk directly to the learner. You never mention being an AI, never suggest videos, and never pad your writing with filler. You write in Markdown.`

const DIFFICULTY_GUIDE: Record<Difficulty, string> = {
  easy: `EASY. Test recall of core definitions and one-step understanding. Distractors should be clearly wrong to a prepared learner. Suitable for someone new to the subject.`,
  medium: `MEDIUM. Test application and connections between ideas. Distractors should reflect plausible misconceptions. Requires real understanding, not just recall.`,
  hard: `HARD. Test analysis, edge cases and transferring ideas to unfamiliar situations. Distractors should be genuinely tempting. Short-answer questions may require combining two ideas.`
}

export function topicPrompt(subject: string, notes?: string): string {
  return `A learner wants to study: "${subject}".
${notes?.trim() ? `Extra context from the learner: "${notes.trim()}"` : ''}

Propose 6 focused, testable subtopics that together give a well-rounded introduction to this subject.
Each subtopic must be specific enough to quiz on (not "Introduction" or "Miscellaneous"), and the six should not overlap.

Return this JSON shape:
{"topics":[{"title":"3-6 word topic name","blurb":"one short sentence on what it covers"}]}`
}

export function quizPrompt(config: QuizConfig): string {
  const topics = config.topics.length ? config.topics : [config.subject]
  return `Write a ${config.count}-question diagnostic quiz.

SUBJECT: ${config.subject}
FOCUS TOPICS (use these exact names as the "topic" field, and cover them evenly):
${topics.map((t) => `- ${t}`).join('\n')}
DIFFICULTY: ${config.difficulty.toUpperCase()} — ${DIFFICULTY_GUIDE[config.difficulty]}
${config.notes?.trim() ? `LEARNER NOTES: ${config.notes.trim()}` : ''}

QUESTION MIX
- About 70% "multiple_choice", 30% "short_answer". Use as many short answers as the count allows (1 for 5, 2 for 10, 3 for 15, 4 for 20), but never all multiple choice.
- Aim for at least 3 different topics in the set.
- Every question must be independently answerable without seeing other questions.

MULTIPLE CHOICE RULES
- Exactly 4 options. Exactly one is correct.
- Distractors must be plausible and reflect real misconceptions, not joke answers.
- Vary the position of the correct answer. Never use "all of the above", "none of the above", or "both A and B".
- Do not use negative phrasing ("which is NOT") more than once.

SHORT ANSWER RULES
- Answerable in 1–3 sentences with a clearly correct answer.
- No multi-part questions, no "list all", no questions that need a diagram.
- The model answer states the essential idea and the accepted answers list 2–4 wording variants.

EXPLANATIONS
- 2–3 sentences: why the correct answer is right, and the idea a learner needs to understand.
- No references to question numbers.

Return strict JSON only, in exactly this shape:
{
  "questions": [
    {
      "topic": "one of the focus topics, verbatim",
      "type": "multiple_choice",
      "difficulty": "easy" | "medium" | "hard",
      "prompt": "the question",
      "options": ["first", "second", "third", "fourth"],
      "correctOption": 0,
      "explanation": "why this is right",
      "modelAnswer": "the correct option text"
    },
    {
      "topic": "one of the focus topics, verbatim",
      "type": "short_answer",
      "difficulty": "easy" | "medium" | "hard",
      "prompt": "the question",
      "modelAnswer": "a model answer",
      "acceptedAnswers": ["alternative wording", "another acceptable answer"],
      "explanation": "the reasoning"
    }
  ]
}
"correctOption" is the 0-based index of the correct option. Do not include markdown fences.`
}

export function gradePrompt(subject: string, items: ShortAnswerItem[]): string {
  return `Mark these short answers from a quiz on "${subject}".

${items
  .map(
    (item, index) => `ITEM ${index + 1}
id: ${item.id}
topic: ${item.topic}
question: ${item.prompt}
model answer: ${item.modelAnswer}
learner's answer: ${item.answer}`
  )
  .join('\n\n')}

GRADING RULES
- "correct": the learner's answer has the essential idea, even if worded differently or with minor imprecision.
- "partial": a relevant start or part of the idea, but a key element is missing or muddled. Award this only when there is real understanding.
- "incorrect": wrong, empty of the key idea, or contains a misconception that undermines the answer.
- Ignore spelling, grammar, capitalisation and typos.
- Feedback: 1–2 sentences, addressed to the learner. For correct answers, add one small insight that deepens understanding. For partial/incorrect answers, name the exact gap or misconception and state the missing idea. Never scold.

Return strict JSON only:
{"grades":[{"id":"the item id","grade":"correct"|"partial"|"incorrect","feedback":"..."}]}`
}

export interface LessonContext {
  subject: string
  topic: string
  difficulty: Difficulty
  misses: Array<{
    prompt: string
    yourAnswer: string
    correctAnswer: string
    explanation: string
  }>
}

export function lessonPrompt(ctx: LessonContext): string {
  const misses = ctx.misses.length
    ? `\nTHE LEARNER GOT THESE QUESTIONS WRONG — use them to target the lesson:\n${ctx.misses
        .map(
          (m, i) => `${i + 1}. Question: ${m.prompt}
   Their answer: ${m.yourAnswer || '(left blank — they did not know)'}
   Correct answer: ${m.correctAnswer}
   Why: ${m.explanation}`
        )
        .join('\n')}`
    : `\nThe learner has not attempted questions on this topic yet. Write the lesson from first principles, assuming curiosity but no prior knowledge of this specific subtopic.`

  return `Write a self-contained lesson that teaches this topic properly.

SUBJECT: ${ctx.subject}
TOPIC: ${ctx.topic}
LEVEL: ${ctx.difficulty}
${misses}

STRUCTURE (follow this closely)
1. Start with a single "# " heading: a specific, inviting lesson title. No preamble before it.
2. "## The big idea" — 2–4 sentences that give the learner the mental model before any detail.
3. Three to five taught sections with "## " headings. Each section explains one idea in connected prose, building on the last. Use short paragraphs. Bullets only where a list is genuinely clearer.
4. Include at least one worked example with visible reasoning steps, and at least one analogy that maps precisely onto the idea.
5. "## Where you went wrong" (only if there are missed questions above) — walk through each missed question: what the learner likely thought, why it fails, and the correct way to reason. Be kind and precise.
6. "## Common traps" — 2–4 misunderstandings, each in one sentence plus its correction.
7. "## Check yourself" — 3 questions that test the lesson, numbered.
8. "## Answers" — the answers with brief reasoning, matching the numbering.

WRITING RULES
- Address the learner as "you". Warm, direct, no filler, no "in this lesson we will".
- Aim for 700–1100 words. Go deeper rather than wider.
- Define every technical term the first time you use it.
- Do not repeat the quiz questions verbatim unless you are explaining a miss.
- For maths or formulas, use LaTeX: $inline$ and $$display$$.
- Diagrams: include at most one Mermaid diagram, and only if it truly clarifies structure or process. Use simple valid syntax, e.g.:
\`\`\`mermaid
flowchart LR
  A[Input] --> B[Process] --> C[Result]
\`\`\`
  Keep node labels plain text without brackets or quotes inside. Do not use images, HTML tags, video links or external links.
- Markdown only. No code fence around the whole lesson.`
}

export function normalizeTopicSuggestions(raw: unknown): TopicSuggestion[] {
  const data = raw as { topics?: unknown }
  const list = Array.isArray(data?.topics) ? data.topics : Array.isArray(raw) ? raw : []
  return list
    .map((item) => {
      if (typeof item === 'string') return { title: item.trim(), blurb: '' }
      const obj = item as Record<string, unknown>
      const title = typeof obj?.title === 'string' ? obj.title.trim() : ''
      const blurb = typeof obj?.blurb === 'string' ? obj.blurb.trim() : ''
      return { title, blurb }
    })
    .filter((t) => t.title.length > 1)
    .slice(0, 8)
}

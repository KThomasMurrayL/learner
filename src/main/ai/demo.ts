import type { LessonRequest, QuizConfig, ShortAnswerGrade, ShortAnswerItem, TopicSuggestion } from '@shared/types'
import type { AiRequest, DeltaHandler } from './core'
import { stripOuterFence } from './text'

const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

const TOPICS: TopicSuggestion[] = [
  { title: 'Retrieval practice', blurb: 'Pulling ideas from memory instead of rereading them.' },
  { title: 'Spaced repetition', blurb: 'Letting a little forgetting happen before you review.' },
  { title: 'Interleaving', blurb: 'Mixing problem types so you must choose a strategy.' },
  { title: 'Elaboration', blurb: 'Connecting new ideas to what you already know.' },
  { title: 'Metacognition', blurb: 'Judging what you actually know, not what feels familiar.' },
  { title: 'Sleep and consolidation', blurb: 'How rest turns practice into durable memory.' }
]

const QUESTION_BANK = [
  {
    topic: 'Retrieval practice',
    type: 'multiple_choice' as const,
    prompt: 'Which study activity is most likely to make a new idea stick?',
    options: [
      'Rereading the chapter until it feels familiar',
      'Highlighting the key sentences',
      'Closing the book and explaining the idea from memory',
      'Copying the summary into a neater notebook'
    ],
    correctOption: 2,
    explanation:
      'Retrieving an idea from memory strengthens the memory itself. Rereading and highlighting mostly build familiarity, which feels productive but fades quickly.'
  },
  {
    topic: 'Spaced repetition',
    type: 'multiple_choice' as const,
    prompt: 'What does spacing your practice actually change?',
    options: [
      'It reduces the total time you need to study',
      'It makes each review slightly harder but far more durable',
      'It removes the need for sleep between sessions',
      'It guarantees you will not forget the material'
    ],
    correctOption: 1,
    explanation:
      'A gap between reviews lets some forgetting occur, so retrieving again takes real effort. That effort is what consolidates the memory.'
  },
  {
    topic: 'Interleaving',
    type: 'multiple_choice' as const,
    prompt: 'You are learning three kinds of algebra problem. Which practice schedule is usually best?',
    options: [
      'Twenty of type A, then twenty of type B, then twenty of type C',
      'Ten of each type, in a mixed order you cannot predict',
      'Only type A until it is perfect, then move on',
      'Read all three worked examples and skip practice'
    ],
    correctOption: 1,
    explanation:
      'Interleaving forces you to identify which strategy a problem needs. Blocked practice lets you repeat one procedure on autopilot.'
  },
  {
    topic: 'Elaboration',
    type: 'short_answer' as const,
    prompt: 'In one or two sentences, explain why explaining an idea to someone else exposes gaps in your understanding.',
    modelAnswer:
      'Explaining forces you to retrieve and organise the idea in your own words, so vague or missing connections become obvious when you cannot produce them.',
    explanation:
      'Recognition is not the same as recall. Producing an explanation is a harder retrieval task, and the places where you stall reveal what you never really understood.'
  },
  {
    topic: 'Metacognition',
    type: 'multiple_choice' as const,
    prompt: 'Why can rereading feel so effective while helping so little?',
    options: [
      'It improves confidence faster than it improves recall',
      'It only works for visual learners',
      'It uses too much working memory',
      'It is effective, but only in the morning'
    ],
    correctOption: 0,
    explanation:
      'Fluency — the ease of processing something — is easily mistaken for mastery. Confidence rises quickly while the ability to retrieve the idea stays weak.'
  },
  {
    topic: 'Retrieval practice',
    type: 'short_answer' as const,
    prompt: 'A friend says "I do not test myself because I might get it wrong." Give one reason self-testing is still worth it when you fail.',
    modelAnswer:
      'A failed attempt shows exactly what is missing and makes the eventual correct retrieval more memorable; the effort and feedback improve learning more than avoiding errors does.',
    explanation:
      'Errors are diagnostic. When you attempt retrieval and then see the correct answer, you are learning precisely where the gap is — something rereading does not reveal.'
  },
  {
    topic: 'Sleep and consolidation',
    type: 'multiple_choice' as const,
    prompt: 'What is the best description of sleep’s role in learning?',
    options: [
      'It is passive downtime with no effect on memory',
      'It replaces the need for practice',
      'It actively consolidates and reorganises what you practised',
      'It only matters for physical skills'
    ],
    correctOption: 2,
    explanation:
      'During sleep the brain replays and reorganises recent experience. Practice creates the trace; sleep helps stabilise and integrate it.'
  },
  {
    topic: 'Spaced repetition',
    type: 'short_answer' as const,
    prompt: 'Why is a review schedule that feels slightly uncomfortable often better than one that feels easy?',
    modelAnswer:
      'Because discomfort usually means retrieval is effortful, and effortful retrieval produces stronger, longer-lasting memory than easy, fluent review.',
    explanation:
      'This is the idea of desirable difficulty. If review feels effortless, the memory is being recognised rather than reconstructed.'
  }
]

export async function demoSuggestTopics(): Promise<TopicSuggestion[]> {
  await wait(500)
  return TOPICS
}

export async function demoQuiz(config: QuizConfig): Promise<unknown> {
  await wait(900)
  const count = Math.max(1, Math.min(config.count, 20))
  const questions = Array.from({ length: count }, (_, index) => {
    const base = QUESTION_BANK[index % QUESTION_BANK.length]
    const round = Math.floor(index / QUESTION_BANK.length)
    const topic = config.topics.length ? config.topics[index % config.topics.length] : base.topic
    return {
      topic,
      type: base.type,
      difficulty: config.difficulty,
      prompt: round === 0 ? base.prompt : `${base.prompt} (variant ${round + 1})`,
      options: base.options,
      correctOption: base.correctOption,
      modelAnswer: base.modelAnswer,
      explanation: base.explanation
    }
  })
  return { questions }
}

export async function demoGrade(items: ShortAnswerItem[]): Promise<ShortAnswerGrade[]> {
  await wait(700)
  return items.map((item) => {
    const answer = item.answer.toLowerCase()
    const keywords = `${item.modelAnswer} ${item.prompt}`
      .toLowerCase()
      .split(/[^a-z]+/)
      .filter((word) => word.length > 5)
    const hits = keywords.filter((word) => answer.includes(word)).length
    if (answer.trim().length < 12) {
      return { id: item.id, grade: 'incorrect', feedback: 'This is too short to show the idea. Say what happens and why it matters.' }
    }
    if (hits >= 2) {
      return {
        id: item.id,
        grade: 'correct',
        feedback: 'You captured the core idea. Notice how you linked the mechanism to the outcome — that is what makes it stick.'
      }
    }
    if (hits === 1) {
      return {
        id: item.id,
        grade: 'partial',
        feedback: 'You are circling the right idea but missing the key link. Say explicitly what causes the improvement, not just that it happens.'
      }
    }
    return {
      id: item.id,
      grade: 'incorrect',
      feedback: `The answer needs the central idea: ${item.modelAnswer}`
    }
  })
}

function demoLessonMarkdown(request: LessonRequest): string {
  const misses = request.misses.length
    ? `\n## Where you went wrong\n\n${request.misses
        .map(
          (miss, index) => `### ${index + 1}. ${miss.prompt}\n\nYou answered: *${miss.yourAnswer || 'nothing — you marked it as unknown.'}*\n\nThe correct answer is **${miss.correctAnswer.replace(/[.\s]+$/, '')}**. ${miss.explanation}\n\nNotice the reasoning step you skipped: the question asks you to connect a *mechanism* to an *outcome*, not just recognise a term.`
        )
        .join('\n\n')}\n`
    : ''

  return `# ${request.topic}: building durable understanding

## The big idea

Learning is not the act of putting information in. It is the act of **retrieving and reconstructing** it. Every time you pull an idea out of memory and put it back together, the pathway gets stronger and easier to find. That single principle explains why testing beats rereading, why spacing beats cramming, and why struggle is a feature rather than a bug.

Think of memory as a forest trail. Rereading is looking at a map of the trail; retrieval is walking it. The map feels clear, but only walking makes the path real.

## Retrieval beats recognition

When you reread a page, the information is right in front of you. Your brain processes it fluently — and fluency feels like knowledge. Psychologists call this the **illusion of competence**.

A retrieval attempt removes the information and asks your brain to reconstruct it:

$$\\text{learning} \\approx \\text{effortful retrieval} + \\text{feedback}$$

If the answer arrives instantly, the practice was probably too easy. If you have to reach for it and get it partly wrong, then see the correction, you are learning.

A useful loop:

\`\`\`mermaid
flowchart LR
  A[Study a small idea] --> B[Close the notes]
  B --> C[Retrieve from memory]
  C --> D{Correct?}
  D -- Yes --> E[Space the next review]
  D -- No --> F[Revisit just that gap]
  F --> C
\`\`\`

## Spacing and desirable difficulty

Cramming works for tomorrow and fails next month. Spacing distributes the same number of reviews across days, so each one starts with a little forgetting to overcome. The forgetting is the point: it makes retrieval effortful, and effortful retrieval is what consolidates memory.

A simple schedule for a new topic:

| Review | When | What to do |
| --- | --- | --- |
| 1 | Same day | Recall the main idea, no notes |
| 2 | Next day | Answer 2–3 questions from memory |
| 3 | Three days later | Explain it aloud, then check |
| 4 | One week later | Mix it with an older topic |

## Interleaving

Practising one type of problem twenty times in a row builds a routine, not a decision. Real tests do not label the problem type for you. Interleaving mixes types so you must ask, *what kind of problem is this, and which strategy fits?*

It feels worse. That is expected. The difficulty is you learning to select a strategy, which is a separate skill from executing one.

${misses}
## Common traps

- **Confusing familiarity with mastery.** If you recognise it, you do not necessarily recall it. Close the page and check.
- **Practising only what you are good at.** Comfort is a poor signal. Spend time where retrieval fails.
- **Treating errors as verdicts.** An error is a location marker for the next review, not evidence that you cannot learn the topic.
- **Skipping sleep.** Consolidation happens between sessions, not during them.

## Check yourself

1. Why does closing the book and reciting an idea work better than rereading the same paragraph twice?
2. Your review session feels effortless. What should you change?
3. You have three problem types to learn. Describe a practice schedule that uses interleaving and spacing.

## Answers

1. Reciting is retrieval: it forces reconstruction from memory, which strengthens the memory and reveals gaps. Rereading mostly produces fluency, which feels like learning but is not durable.
2. Make it harder: increase the gap before the next review, retrieve without cues, or mix in a different topic. Effort is the signal that the practice is doing something.
3. Mix the three types in an unpredictable order within a session, and return to the same mix after a day, then after three days. Keep a short gap before each review so retrieval stays effortful.`
}

export async function demoLesson(request: LessonRequest, onDelta?: DeltaHandler): Promise<string> {
  const markdown = stripOuterFence(demoLessonMarkdown(request))
  if (!onDelta) {
    await wait(600)
    return markdown
  }
  const chunks = markdown.match(/[\s\S]{1,60}/g) ?? [markdown]
  for (const chunk of chunks) {
    onDelta(chunk)
    await wait(18)
  }
  return markdown
}

export async function demoChat(_request: AiRequest): Promise<string> {
  await wait(500)
  return 'READY'
}

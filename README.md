# Learner

A local macOS app for learning anything the honest way: **quiz first, then teach what you missed.**

You type a subject, pick the topics worth testing, and choose how many questions you want. The app writes a
diagnostic quiz, opens it, and gives you a dedicated **“I don’t know this”** button so you never have to guess.
When you finish, it marks every answer — multiple choice locally, written answers for meaning — and then writes
proper written lessons for the gaps it found.

No accounts, no sync server, no telemetry, no videos. Everything is stored on your Mac; the only network traffic
is the prompt sent to the AI provider you choose.

---

## Run it

```bash
npm install
npm run dev
```

Build a double-clickable app:

```bash
npm run dist     # → dist/mac-arm64/Learner.app
npm run dmg      # → dist/Learner-1.0.0-arm64.dmg
```

`npm run dev` and a packaged build both run the UI from local files (`file://`), not from a web server.

---

## Connect an AI provider

Open **Settings** (⌘,) and choose one:

| Provider | What it uses | Needs a key? |
| --- | --- | --- |
| **Claude subscription** | The local `claude` CLI, i.e. your Claude Code sign-in | No |
| **OpenCode subscription** | The local `opencode` CLI with a model you pick | No |
| **Claude API key** | `api.anthropic.com` directly | Yes |
| **Any OpenAI-compatible API** | OpenAI, OpenRouter, Groq, Ollama, LM Studio, OpenCode Zen, … | Only for hosted APIs |
| **Demo mode** | Fixed sample quiz and lesson, no AI calls | No |

The subscription options are the easiest if you already use Claude Code or OpenCode. Learner shells out to
`claude -p` / `opencode run` in the background, so your existing sign-in does the work and no key is stored in the
app. Use **Test connection** to confirm it works.

API keys are encrypted with macOS `safeStorage` (Keychain) and stored only in the app’s data file. For local
servers such as Ollama, leave the key empty and point the base URL at `http://localhost:11434/v1`.

---

## How a session works

1. **Subject** — anything: photosynthesis, linear algebra, Kubernetes networking, music theory.
2. **Topics** — the app suggests six, and you choose which ones the quiz should cover (or type your own).
3. **Quiz** — 5, 10, 15 or 20 questions, in gentle / standard / challenging difficulty. A mix of multiple choice
   and short written answers.
4. **“I don’t know this”** — marks the question as *unanswered* instead of guessing, and sends that topic to your
   lessons. Guessing is penalised by making your lessons less useful; skipping is not.
5. **Marking** — multiple choice is exact; written answers are read for meaning (not spelling), with partial
   credit. A model answer and explanation accompany every question.
6. **Lessons** — written for the topics you missed, in the order of your biggest gaps. Each lesson is a real
   tutorial: a mental model, taught sections, a worked example, “where you went wrong”, common traps, and a
   check-yourself section with answers. Maths renders with LaTeX; diagrams render locally with Mermaid.
7. **Practice again** — build a fresh quiz on just the weak topics, or keep the session in your library.

Lessons start writing automatically after marking, in the background, while you read the results.

---

## Where things live

- Quizzes, answers and lessons: `~/Library/Application Support/Learner/learner-data.json`
- Encrypted API keys: the same file, under `settings.provider.keys`
- Settings → **Data & privacy → Show in Finder** opens the file.

The file is plain JSON for lessons and answers, so it is easy to back up or inspect. Streaming lessons are
resumable: if the app closes mid-lesson, the lesson is marked as interrupted and can be rewritten with one click.

---

## Architecture

```
src/
  main/                 Electron main process (no renderer network access needed)
    ai/                 provider adapters: Anthropic API, OpenAI-compatible, Claude/OpenCode CLIs, demo
    ai/prompts.ts       the examiner, grader and tutor prompts
    ai/normalize.ts     forgiving parsing of model JSON into the domain model
    store.ts            atomic local JSON store + safeStorage key encryption
    index.ts            window, menus, IPC, cancellation
  preload/              contextBridge API (typed in shared/types.ts)
  renderer/             React + TypeScript UI
    screens/            Home, Quiz, Results, Lessons, Library, Settings
    components/         Markdown (KaTeX + Mermaid), Sidebar, icons, toasts
    lib/                local grading, scoring, formatting
  shared/types.ts       domain types shared by main, preload and renderer
```

- Context isolation is on, `nodeIntegration` is off, and the renderer never sees an API key.
- Long generations are cancellable and time-limited.
- Written answers are graded in one batched request; lessons are generated one at a time so you can start reading
  the first while the rest are written.

---

## Keyboard

| Key | Action |
| --- | --- |
| `⌘N` | New quiz |
| `⌘,` | Settings |
| `1`–`4` | Pick an answer |
| `U` | “I don’t know this” |
| `←` / `→` | Move between questions |
| `Enter` | Next question |

---

## Notes

- Quiz JSON is validated and normalised, so a model that returns slightly malformed options or answer keys still
  produces a usable quiz. If JSON parsing fails, the request is retried once.
- If AI marking fails, written answers fall back to a word-overlap check and the result is labelled as a rough
  guide rather than silently pretending to be accurate.
- Mermaid diagrams are rendered with `securityLevel: 'strict'`; lessons are Markdown-only (no raw HTML, no remote
  images), so a bad model response cannot inject scripts.

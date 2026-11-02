# 🧠 Jeu Quizz AI

> A no-build quiz web app for AI engineering interview prep: LeetCode complexities, Python code review, transformer internals and the AI agent stack.

Jeu Quizz AI is a small single-page app in French. Questions are drawn at random and the choices are shuffled. Every correction explains the reasoning, and shows Python code when that helps.

## Features

- **🧩 LeetCode**: a problem is drawn at random, and you answer **3 chained questions** about it:
  1. optimal **time** complexity,
  2. **space** complexity of that optimal solution,
  3. a **general-culture** question about the problem (Kadane, Floyd, the Dyck language, Bloch's binary-search bug…).

  When you pick a **wrong** complexity, the game shows a Python algorithm that really has that non-optimal complexity, or explains why no sensible one exists. When you're **right**, it shows the optimal Python solution.
- **🔍 Code review**: spot the bug, security hole or performance trap in a Python snippet (mutable defaults, SQL injection, late-binding closures, races, `zero_grad`, blocking `asyncio`…), then compare with the corrected version.
- **⚡ Transformers & Mistral**: precise questions on causal multi-head attention and its move to **grouped-query attention** in PyTorch. Also covers KV-cache memory math, sliding window and rolling buffer (Mistral 7B), sparse MoE (Mixtral), GGUF/AWQ/GPTQ, LoRA/QLoRA, PagedAttention, continuous batching, GPU sizing and scaling laws. Each answer links to its source (Karpathy, 3Blue1Brown, Jay Alammar, the arXiv papers, the HF LLM Course, Stanford CS336).
- **🤖 AI agent stack**: LLM and system prompt, RAG over structured and unstructured data, MCP tools for Outlook, OAuth-based document access, guardrails, caching, a small/large model router and observability.
- **Bonus**:
  - Progress is saved in `localStorage`: best score, accuracy, and a **"Revoir mes erreurs"** review mode that replays only the cards you missed. A card leaves the list once you answer it fully right.
  - Keyboard shortcuts: <kbd>1</kbd>–<kbd>4</kbd> to answer, <kbd>Enter</kbd> to continue.
  - Deep links such as `?rubrique=agent-stack`.

## Quick start

No build step and no dependencies. Serve the folder with any static server (ES modules don't load over `file://`):

```bash
git clone <this-repo> jeu-quizz-ai
cd jeu-quizz-ai
python -m http.server 8080      # or: npx serve -l 8080 .
```

Then open <http://localhost:8080>.

The app only uses relative paths, so it works as-is on GitHub Pages, including from a sub-folder.

## Usage examples

- Open the home page and click **Jouer** on a rubric. A LeetCode game is 3 problems × 3 questions; the other rubrics are 6–8 questions per game.
- Go straight to a rubric: `http://localhost:8080/?rubrique=leetcode`. Valid values are `leetcode`, `code-review`, `transformers` and `agent-stack`.
- After a game, click **Revoir mes erreurs (n)** to replay only the cards you got wrong.

## Project structure

```
index.html            # entry point (served as-is)
styles.css            # dark theme, token colours for Python highlighting
src/
  app.js              # DOM controller: home, quiz and summary screens, keyboard
  engine.js           # pure game logic: seeded RNG, deck building, shuffling, state machine
  stats.js            # pure progress persistence (localStorage-compatible)
  format.js           # HTML escaping, dedent tag, tiny Python highlighter, inline markup
  data/
    index.js          # rubric registry
    leetcode.js       # problems with time/space/trivia steps and alternative solutions
    codeReview.js     # buggy snippets + fixes
    transformers.js   # transformers, Mistral, quantization, serving questions
    agentStack.js     # AI agent stack questions
test/                 # node:test suites
```

### Adding content

Each item in `src/data/*.js` is plain data. In a LeetCode problem, each wrong complexity choice references either:

- a `solution`, meaning an algorithm that really has that complexity, or
- a `note`, explaining why no sensible algorithm has it.

The test suite enforces this, so a mismatched complexity fails CI.

## Tests

```bash
npm test        # = node --test (Node 18+)
```

The tests cover the engine (shuffling keeps the right answer, the game state machine, scoring), the stats (merging, review list, corrupted storage) and the formatter (escaping, highlighting).

They also check the integrity of every question bank:

- 4 unique choices per question,
- each wrong-complexity choice matches the complexity of its linked algorithm,
- no unused solutions,
- sources are given,
- a perfect run of every rubric scores 100 %.

## License

[MIT](./LICENSE) © 2026 Mathieu Ract

> Built autonomously by [Claude Code](https://claude.com/claude-code).

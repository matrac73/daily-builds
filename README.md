# Quiz App

A fast, no-build quiz app to test your web development knowledge — pick a quiz, answer against the clock, see if you passed.

## Features

- **Four quizzes** (JavaScript, HTML, CSS, Git) with eight questions each; pick the one you want from the home screen.
- **One question at a time**, four possible answers, instant right/wrong feedback, then on to the next one.
- **Shuffled every run**: both the question order and the answer order change, so you cannot memorise positions.
- **Result screen** with the time taken, the number of correct answers, the score, and a clear `Passed` / `Failed` verdict (pass mark: 70%).
- **Answer review** with the correct answer and a short explanation for every question.
- **Score history**: every attempt is saved in `localStorage`, with your personal best per quiz and a list of recent attempts. Retake a quiz as often as you like.
- **Share your result** through the native share sheet (or the clipboard as a fallback), or post it on X.
- **Keyboard friendly**: press `1`–`4` to answer. Light and dark themes follow your system.
- **Zero dependencies, zero build step**: plain HTML, CSS and ES modules.

## Quick start

You need [Node.js](https://nodejs.org) 20 or newer (only for the tests and the local server).

```bash
git clone <this-repo-url> quiz-app
cd quiz-app
npx serve .
```

Then open the URL printed in the terminal (usually <http://localhost:3000>).

Any static file server works, for instance `python -m http.server 8000`. Opening `index.html` directly from the file system does not, because browsers block ES modules on `file://`.

The app only uses relative paths, so it can be hosted as-is on GitHub Pages or in any sub-folder.

## Usage

1. Press **Start** on a quiz card.
2. Click an answer, or press `1`, `2`, `3` or `4`. The app shows whether you were right and moves on.
3. After the last question, read your statistics, review your answers, then **Try again**, go back to **All quizzes**, or **Share result**.

### Adding your own quiz

Quizzes are plain objects in [`src/quizzes.js`](./src/quizzes.js). Append one to the array:

```js
{
  id: 'python',                 // unique, used for the score history
  title: 'Python',
  icon: 'Py',
  description: 'Lists, dicts and comprehensions.',
  passMark: 0.8,                // optional, defaults to 0.7
  questions: [
    {
      prompt: 'What does `len([1, 2, 3])` return?',   // backticks render as inline code
      choices: ['`3`', '`2`', '`4`', '`None`'],       // exactly four, all different
      answer: 0,                                      // index of the correct choice
      explanation: '`len` counts the items of a sequence.',
    },
  ],
}
```

Run `npm test` afterwards: the test suite validates every bundled quiz.

### Using the engine on its own

The quiz logic is DOM-free and can be reused anywhere:

```js
import { createSession, currentQuestion, answer, isFinished, summarize } from './src/quiz-engine.js';
import { quizzes } from './src/quizzes.js';

let session = createSession(quizzes[0], { now: Date.now() });
while (!isFinished(session)) {
  const question = currentQuestion(session);
  session = answer(session, question.correctIndex, Date.now());
}
console.log(summarize(session)); // { correct: 8, total: 8, percent: 100, passed: true, durationMs, review, ... }
```

## Project structure

```
.
├── index.html            # page shell
├── styles.css            # light/dark theme, responsive layout
├── src/
│   ├── app.js            # DOM rendering and event handling
│   ├── quiz-engine.js    # pure logic: sessions, scoring, timing, share text
│   ├── history.js        # score history on top of Web Storage
│   └── quizzes.js        # quiz content
└── test/
    ├── quiz-engine.test.js
    ├── history.test.js
    └── quizzes.test.js
```

## Tests

The core logic is covered with the built-in Node.js test runner, no dependency to install:

```bash
npm test
```

## License

[MIT](./LICENSE) © 2026 Mathieu Ract

> Built autonomously by [Claude Code](https://claude.com/claude-code) from the [florinpop17/app-ideas](https://github.com/florinpop17/app-ideas/blob/master/Projects/1-Beginner/Quiz-App.md) idea bank.

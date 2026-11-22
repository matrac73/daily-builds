/**
 * Bundled quizzes. Text between backticks is rendered as inline code.
 * `answer` is the index of the correct entry in `choices`.
 */
export const quizzes = [
  {
    id: 'javascript',
    title: 'JavaScript',
    icon: 'JS',
    description: 'Types, arrays, promises and the quirks everyone trips over.',
    questions: [
      {
        prompt: 'What does `typeof null` evaluate to?',
        choices: ['`"object"`', '`"null"`', '`"undefined"`', '`"number"`'],
        answer: 0,
        explanation: 'A historical bug kept for compatibility: `typeof null` is `"object"`.',
      },
      {
        prompt: 'Which array method returns a new array with only the elements that pass a test?',
        choices: ['`filter`', '`map`', '`forEach`', '`reduce`'],
        answer: 0,
        explanation: '`filter` keeps the elements for which the callback returns a truthy value.',
      },
      {
        prompt: 'What does `[1, 2, 3].map(n => n * 2)` return?',
        choices: ['`[2, 4, 6]`', '`[1, 2, 3]`', '`12`', '`undefined`'],
        answer: 0,
        explanation: '`map` builds a new array from the return value of each call.',
      },
      {
        prompt: 'Which keyword declares a block-scoped binding that cannot be reassigned?',
        choices: ['`const`', '`let`', '`var`', '`static`'],
        answer: 0,
        explanation: '`const` and `let` are both block-scoped, but only `const` forbids reassignment.',
      },
      {
        prompt: "What is the result of `'5' + 3`?",
        choices: ["`'53'`", '`8`', '`NaN`', 'A `TypeError`'],
        answer: 0,
        explanation: 'With a string operand, `+` concatenates: the number is converted to a string.',
      },
      {
        prompt: 'What does `Promise.all` do when one of its promises rejects?',
        choices: [
          'It rejects right away with that reason',
          'It waits for every promise, then rejects',
          'It resolves with `undefined` in that slot',
          'It ignores the rejection',
        ],
        answer: 0,
        explanation: '`Promise.all` fails fast. Use `Promise.allSettled` to wait for everything.',
      },
      {
        prompt: 'Which operator falls back to its right-hand side only when the left is `null` or `undefined`?',
        choices: ['`??`', '`||`', '`&&`', '`?.`'],
        answer: 0,
        explanation: 'Unlike `||`, the nullish coalescing operator `??` keeps `0`, `""` and `false`.',
      },
      {
        prompt: 'What does `0.1 + 0.2 === 0.3` evaluate to?',
        choices: ['`false`', '`true`', '`NaN`', 'It throws'],
        answer: 0,
        explanation: 'Binary floating point gives `0.30000000000000004`, which is not `0.3`.',
      },
    ],
  },
  {
    id: 'html',
    title: 'HTML',
    icon: '</>',
    description: 'Semantic elements, forms and the attributes that matter.',
    questions: [
      {
        prompt: 'Which element should wrap the dominant, unique content of a page?',
        choices: ['`<main>`', '`<section>`', '`<div>`', '`<body>`'],
        answer: 0,
        explanation: '`<main>` marks the primary content and is exposed as a landmark to assistive tech.',
      },
      {
        prompt: 'Which attribute provides the text alternative of an image?',
        choices: ['`alt`', '`title`', '`src`', '`caption`'],
        answer: 0,
        explanation: '`alt` is read by screen readers and shown when the image fails to load.',
      },
      {
        prompt: 'Which `<script>` attribute downloads the file in parallel and runs it, in order, after the document is parsed?',
        choices: ['`defer`', '`async`', '`lazy`', '`nomodule`'],
        answer: 0,
        explanation: '`async` scripts also download in parallel, but run as soon as they arrive, in any order.',
      },
      {
        prompt: 'Which element gives a form control such as an `<input>` its accessible name?',
        choices: ['`<label>`', '`<legend>`', '`<caption>`', '`<span>`'],
        answer: 0,
        explanation: 'A `<label>` linked with `for` (or wrapping the control) names it and extends its click target.',
      },
      {
        prompt: 'What is `<meta name="viewport" content="width=device-width, initial-scale=1">` for?',
        choices: [
          'Matching the layout width to the device width',
          'Declaring the character encoding',
          'Preventing the user from zooming',
          'Enabling dark mode',
        ],
        answer: 0,
        explanation: 'Without it, mobile browsers lay the page out on a wide virtual viewport and shrink it.',
      },
      {
        prompt: 'Which `type` makes an `<input>` show a native date picker?',
        choices: ['`date`', '`calendar`', '`datepicker`', '`day`'],
        answer: 0,
        explanation: '`<input type="date">` yields a `YYYY-MM-DD` value and a browser-provided picker.',
      },
      {
        prompt: 'Which element represents a self-contained composition, such as a blog post?',
        choices: ['`<article>`', '`<aside>`', '`<details>`', '`<figure>`'],
        answer: 0,
        explanation: 'An `<article>` should still make sense when lifted out of the page, as in a feed.',
      },
      {
        prompt: 'Which attribute makes an `<a>` open its link in a new tab?',
        choices: ['`target="_blank"`', '`rel="external"`', '`href="new"`', '`open="tab"`'],
        answer: 0,
        explanation: '`target="_blank"` opens a new browsing context, usually a new tab.',
      },
    ],
  },
  {
    id: 'css',
    title: 'CSS',
    icon: '{ }',
    description: 'Box model, specificity, flexbox and units.',
    questions: [
      {
        prompt: 'Which property sets the space between an element’s content and its border?',
        choices: ['`padding`', '`margin`', '`gap`', '`outline`'],
        answer: 0,
        explanation: '`padding` is inside the border, `margin` is outside of it.',
      },
      {
        prompt: 'With `box-sizing: border-box`, what does `width` cover?',
        choices: [
          'Content, padding and border',
          'Content only',
          'Content and padding',
          'Content, padding, border and margin',
        ],
        answer: 0,
        explanation: 'Padding and border are taken out of the declared width; margin never is.',
      },
      {
        prompt: 'Which selector has the highest specificity?',
        choices: ['`#nav`', '`.nav.active`', '`ul li a`', '`a:hover`'],
        answer: 0,
        explanation: 'One ID (1,0,0) outweighs any number of classes, pseudo-classes or type selectors.',
      },
      {
        prompt: 'Which declaration turns an element into a flex container?',
        choices: ['`display: flex`', '`flex: 1`', '`position: flex`', '`flex-direction: row`'],
        answer: 0,
        explanation: '`flex` and `flex-direction` only have an effect once `display: flex` is set.',
      },
      {
        prompt: 'What is `1rem` relative to?',
        choices: [
          'The font size of the root element',
          'The font size of the parent element',
          'The width of the viewport',
          'The width of the element itself',
        ],
        answer: 0,
        explanation: '`rem` means “root em”: it follows the font size of `<html>`.',
      },
      {
        prompt: 'In a flex container with `flex-direction: row`, which property aligns items vertically?',
        choices: ['`align-items`', '`justify-content`', '`flex-wrap`', '`text-align`'],
        answer: 0,
        explanation: '`align-items` works on the cross axis, `justify-content` on the main axis.',
      },
      {
        prompt: 'Which `position` value pins an element to the viewport so it stays put while the page scrolls?',
        choices: ['`fixed`', '`absolute`', '`relative`', '`static`'],
        answer: 0,
        explanation: '`absolute` is positioned against the nearest positioned ancestor and scrolls with it.',
      },
      {
        prompt: 'Which at-rule applies styles only when the viewport matches a condition, such as a minimum width?',
        choices: ['`@media`', '`@supports`', '`@import`', '`@font-face`'],
        answer: 0,
        explanation: '`@media (min-width: 40rem) { … }` is the backbone of responsive layouts.',
      },
    ],
  },
  {
    id: 'git',
    title: 'Git',
    icon: '⑂',
    description: 'Everyday commands, from staging to undoing mistakes.',
    questions: [
      {
        prompt: 'Which command stages changes for the next commit?',
        choices: ['`git add`', '`git commit`', '`git push`', '`git stash`'],
        answer: 0,
        explanation: '`git add` copies changes to the index; `git commit` then records the index.',
      },
      {
        prompt: 'Which command creates a new branch and switches to it?',
        choices: [
          '`git switch -c feature`',
          '`git branch feature`',
          '`git merge feature`',
          '`git fetch feature`',
        ],
        answer: 0,
        explanation: '`git branch feature` creates the branch but leaves you where you are.',
      },
      {
        prompt: 'What does `git pull` do by default?',
        choices: [
          'Fetches from the remote, then integrates into the current branch',
          'Only downloads new commits, without touching your branch',
          'Uploads local commits to the remote',
          'Discards all local changes',
        ],
        answer: 0,
        explanation: '`git pull` is `git fetch` followed by a merge (or a rebase, if configured).',
      },
      {
        prompt: 'Which command shows the commit history of the current branch?',
        choices: ['`git log`', '`git status`', '`git diff`', '`git remote`'],
        answer: 0,
        explanation: 'Try `git log --oneline --graph` for a compact view.',
      },
      {
        prompt: 'What does `git stash` do?',
        choices: [
          'Shelves uncommitted changes and restores a clean working tree',
          'Deletes untracked files',
          'Removes the last commit',
          'Uploads your changes to the remote',
        ],
        answer: 0,
        explanation: 'Bring the shelved changes back with `git stash pop`.',
      },
      {
        prompt: 'Which command undoes an earlier commit by adding a new one, without rewriting history?',
        choices: ['`git revert`', '`git reset --hard`', '`git rebase`', '`git commit --amend`'],
        answer: 0,
        explanation: '`git revert` is safe on shared branches because existing commits stay untouched.',
      },
      {
        prompt: 'Which file lists the paths Git should leave untracked?',
        choices: ['`.gitignore`', '`.gitkeep`', '`.gitconfig`', '`.gitattributes`'],
        answer: 0,
        explanation: 'Patterns in `.gitignore` keep build output, dependencies and secrets out of commits.',
      },
      {
        prompt: 'What does `HEAD` refer to?',
        choices: [
          'The commit that is currently checked out',
          'The very first commit of the repository',
          'The remote server',
          'The most recent commit across all branches',
        ],
        answer: 0,
        explanation: '`HEAD` usually points to a branch, which in turn points to its latest commit.',
      },
    ],
  },
];

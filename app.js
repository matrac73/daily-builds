import { mount } from './src/fouet.js';
import { bookmarkletHref } from './src/bookmarklet.js';

mount();

const link = document.getElementById('bookmarklet');
try {
  link.href = bookmarkletHref(new URL('./src/fouet.js', location.href).href);
  // Clicking it here would only toggle the whip already on this page: nudge instead.
  link.addEventListener('click', (e) => {
    e.preventDefault();
    link.classList.add('nudge');
    link.addEventListener('animationend', () => link.classList.remove('nudge'), { once: true });
  });
} catch {
  link.replaceWith(Object.assign(document.createElement('p'), {
    className: 'note',
    textContent: 'Serve this page over http(s) to get the bookmarklet (see README).',
  }));
}

// A tiny hyperscript helper. Text always goes through text nodes, never
// innerHTML, so survey titles and choices cannot inject markup.

/**
 * h('button', { class: 'primary', onclick: save }, 'Save')
 * Props starting with "on" become event listeners; `false`/`null`/`undefined`
 * props and children are skipped; other props are set as attributes.
 */
export function h(tag, props = {}, ...children) {
  const element = document.createElement(tag);
  for (const [name, value] of Object.entries(props)) {
    if (value === false || value === null || value === undefined) continue;
    if (name.startsWith('on')) {
      element.addEventListener(name.slice(2), value);
    } else {
      element.setAttribute(name, value === true ? '' : value);
    }
  }
  element.append(...children.flat().filter((child) => child !== false && child !== null && child !== undefined));
  return element;
}

export const plural = (count, noun) => `${count} ${noun}${count === 1 ? '' : 's'}`;

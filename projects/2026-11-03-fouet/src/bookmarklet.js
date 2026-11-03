// Builds the `javascript:` URL that loads Fouet on any page.

/**
 * The bookmarklet toggles an already-mounted whip, or dynamically imports the
 * module from `moduleUrl` (must be absolute and served with CORS) and turns it on.
 */
export function bookmarkletHref(moduleUrl) {
  const url = new URL(moduleUrl);
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error(`Fouet bookmarklet needs an http(s) module URL, got ${url.protocol}`);
  }
  const code =
    '(()=>{const f=window.__fouet;if(f){f.toggle();return}' +
    `import(${JSON.stringify(url.href)}).then(m=>m.mount().toggle())` +
    '.catch(e=>alert("Fouet could not load here: "+e.message))})()';
  return `javascript:${encodeURIComponent(code)}`;
}

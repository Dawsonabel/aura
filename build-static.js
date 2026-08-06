/* Build a single self-contained HTML file of the phone app.

   Everything (fonts, CSS, app.js, and the browser-side API shim in
   browser-backend.js) is inlined, so the result runs from any static host —
   or a hosted preview link — with no Node server behind it.

   Usage:  node build-static.js [outfile]     # default: dist/aura-demo.html
*/
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const OUT = process.argv[2] || path.join(ROOT, 'dist', 'aura-demo.html');
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');

/* ---- fonts: rewrite url(./x.woff2) to base64 data URIs ---- */
const fontCss = read('fonts/gas-fonts.css').replace(/url\(\.\/([^)]+\.woff2)\)/g, (m, file) => {
  const b64 = fs.readFileSync(path.join(ROOT, 'fonts', file)).toString('base64');
  return `url(data:font/woff2;base64,${b64})`;
});

const styles = read('styles.css');
const html = read('index.html');

/* ---- pull the parts we need out of index.html ----
   The output is a page fragment: no doctype/html/head/body wrappers, so it can be
   dropped into any host shell. <title> is kept for the browser tab. */
const title = (html.match(/<title>([\s\S]*?)<\/title>/) || [, 'Gas — See who likes you'])[1];
const bodyInner = html
  .replace(/[\s\S]*?<body[^>]*>/i, '')
  .replace(/<\/body>[\s\S]*/i, '')
  .replace(/<script src="[^"]*"><\/script>\s*/g, '');   // local scripts are inlined below

const scripts = ['storage-fallback.js', 'config.js', 'browser-backend.js', 'app.js'].map(f =>
  `<script>\n/* ===== ${f} ===== */\n${read(f)}\n</script>`
).join('\n');

/* The host shell owns <head>, so make sure the phone viewport is set from script. */
const viewportFix = `<script>
(function(){
  var m=document.querySelector('meta[name="viewport"]');
  if(!m){ m=document.createElement('meta'); m.name='viewport'; document.head.appendChild(m); }
  m.content='width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no';
})();
</script>`;

const out = `<title>${title}</title>
${viewportFix}
<style>
/* ===== fonts/gas-fonts.css (woff2 inlined) ===== */
${fontCss}
/* ===== styles.css ===== */
${styles}
</style>
${bodyInner}
${scripts}
`;

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, out);
console.log(`✅ ${path.relative(ROOT, OUT)} — ${(Buffer.byteLength(out) / 1024 / 1024).toFixed(2)} MB, self-contained`);

import puppeteer from 'puppeteer-core';

const browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null });
const page = await browser.newPage();
await page.goto('file:///C:/Users/Lenovo%20ThinkPad/.gemini/antigravity-ide/scratch/classroom-socratic-addon/public/wysiwyg-demo.html', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => customElements.get('math-field'));
const sleep = ms => new Promise(r => setTimeout(r, ms));

const res = await page.evaluate(async (vals) => {
  const out = {};
  for (const v of vals) {
    const mf = document.createElement('math-field');
    document.body.appendChild(mf);
    await new Promise(r => setTimeout(r, 300));
    mf.value = v;
    await new Promise(r => setTimeout(r, 100));
    const last = mf.lastOffset;
    const rows = [];
    for (let k = 0; k <= last; k++) {
      mf.value = v;
      mf.position = k;
      mf.insert('Z', { insertionMode: 'insertAfter' });
      rows.push(k + ': ' + mf.value);
    }
    out[v] = rows;
    mf.remove();
  }
  return out;
}, ['\\log_3\\left(6\\right)', '\\log_{10}\\left(6\\right)']);
for (const [v, rows] of Object.entries(res)) { console.log(v); rows.forEach(r => console.log('  ' + r)); }
await page.close(); await browser.disconnect(); process.exit(0);

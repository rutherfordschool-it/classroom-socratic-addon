import puppeteer from 'puppeteer-core';

const browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null });
const page = await browser.newPage();
await page.goto('file:///C:/Users/Lenovo%20ThinkPad/.gemini/antigravity-ide/scratch/classroom-socratic-addon/public/wysiwyg-demo.html', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => document.querySelector('#teacherPromptWrap .mte') && customElements.get('math-field'));
const sleep = ms => new Promise(r => setTimeout(r, ms));
await page.evaluate(() => { const e = document.querySelector('#teacherPromptWrap .mte'); e.innerHTML = ''; e.focus(); });
for (const ch of 'log36') { await page.keyboard.type(ch); await sleep(60); }
await sleep(200);
const info = () => page.evaluate(() => {
  const mf = document.querySelector('#teacherPromptWrap math-field');
  const pos = mf.position;
  let l, r, err = '';
  try { l = mf.getValue(0, pos, 'latex'); r = mf.getValue(pos, mf.lastOffset, 'latex'); } catch (e) { err = String(e); }
  return { pos, last: mf.lastOffset, l, r, err };
});
console.log('start', await info());
for (let i = 1; i <= 4; i++) { await page.keyboard.press('ArrowLeft'); await sleep(150); console.log('Left', i, await info()); }
await page.close(); await browser.disconnect(); process.exit(0);

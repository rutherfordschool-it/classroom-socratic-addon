import puppeteer from 'puppeteer-core';

const browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null });
const page = await browser.newPage();
await page.goto('file:///C:/Users/Lenovo%20ThinkPad/.gemini/antigravity-ide/scratch/classroom-socratic-addon/public/wysiwyg-demo.html', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => document.querySelector('#teacherPromptWrap .mte') && customElements.get('math-field'));
const sleep = ms => new Promise(r => setTimeout(r, ms));
await sleep(300);

const btns = await page.$$('#teacherPromptWrap .mte-btn');
const kbBtn = btns[btns.length - 1];

await kbBtn.click();
await sleep(250);
console.log('Toolbar ⌨ click 1 (should open):', await page.evaluate(() => window.mathVirtualKeyboard.visible));

await kbBtn.click();
await sleep(250);
console.log('Toolbar ⌨ click 2 (should close):', await page.evaluate(() => window.mathVirtualKeyboard.visible));

// Now test standalone #targetAnswer toggle button
const getTogglePt = () => page.evaluate(() => {
  const mf = document.getElementById('targetAnswer');
  const btn = mf.shadowRoot.querySelector('[part="virtual-keyboard-toggle"]');
  const r = btn.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
});

const pt1 = await getTogglePt();
await page.mouse.click(pt1.x, pt1.y);
await sleep(400);
console.log('Standalone toggle click 1 (should open):', await page.evaluate(() => window.mathVirtualKeyboard.visible));

const pt2 = await getTogglePt();
await page.mouse.click(pt2.x, pt2.y);
await sleep(400);
console.log('Standalone toggle click 2 (should close):', await page.evaluate(() => window.mathVirtualKeyboard.visible));

// Reload open demo/discovery tabs
const pages = await browser.pages();
for (const p of pages) {
  if (p !== page && (p.url().includes('wysiwyg-demo.html') || p.url().includes('attachment-discovery.html'))) {
    await p.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
  }
}

await page.close();
await browser.disconnect();
process.exit(0);

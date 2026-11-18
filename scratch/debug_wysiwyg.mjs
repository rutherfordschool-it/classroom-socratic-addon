import puppeteer from 'puppeteer-core';

const FILE_URL = 'file:///C:/Users/Lenovo%20ThinkPad/.gemini/antigravity-ide/scratch/classroom-socratic-addon/public/wysiwyg-demo.html';
const browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null });
const page = await browser.newPage();
await page.setViewport({ width: 1400, height: 1000 });
await page.goto(FILE_URL, { waitUntil: 'networkidle0', timeout: 30000 });
await page.waitForFunction(() => customElements.get('math-field'), { timeout: 20000 });
await new Promise(r => setTimeout(r, 800));

const selInfo = () => page.evaluate(() => {
  const s = getSelection(); if (!s.rangeCount) return 'none';
  const r = s.getRangeAt(0);
  return `${r.startContainer.nodeName} "${(r.startContainer.textContent || '').slice(0, 40)}" @${r.startOffset} active=${document.activeElement.className || document.activeElement.tagName}`;
});

await page.click('#levelBWrap .mte');
console.log('after click:', await selInfo());
await page.keyboard.press('End');
console.log('after End:', await selInfo());
await page.keyboard.down('Control'); await page.keyboard.press('KeyM'); await page.keyboard.up('Control');
await new Promise(r => setTimeout(r, 400));
const structure = () => page.evaluate(() => [...document.querySelector('#levelBWrap .mte').childNodes].map(n => n.nodeType === 3 ? JSON.stringify(n.data.slice(0, 15)) : `<${n.className}:${n.dataset.latex}>`).join(' | '));
console.log('after Ctrl+M:', await structure());
await page.keyboard.type('x^2', { delay: 60 });
console.log('after typing:', await structure());
await page.keyboard.press('Enter');
await new Promise(r => setTimeout(r, 300));
console.log('after Enter:', await structure());
await page.close();
await browser.disconnect();

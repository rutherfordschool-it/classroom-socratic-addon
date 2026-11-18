import puppeteer from 'puppeteer-core';

const browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null });
const page = await browser.newPage();
await page.goto('file:///C:/Users/Lenovo%20ThinkPad/.gemini/antigravity-ide/scratch/classroom-socratic-addon/public/wysiwyg-demo.html', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => customElements.get('math-field'));

const sleep = ms => new Promise(r => setTimeout(r, ms));

const res = await page.evaluate(() => {
  const mf = document.createElement('math-field');
  document.body.appendChild(mf);
  mf.focus();
  mf.insert('\\log_{#?}\\left(#?\\right)', { selectionMode: 'placeholder', focus: true });
  return { val: mf.value, pos: mf.position };
});
console.log('Inserted:', res);

// Type 3 -> Tab -> 6
await page.keyboard.type('3');
await sleep(50);
await page.keyboard.press('Tab');
await sleep(50);
await page.keyboard.type('6');
await sleep(50);

console.log('Before ): pos:', await page.evaluate(() => {
  const mf = document.querySelectorAll('math-field')[document.querySelectorAll('math-field').length - 1];
  return { val: mf.value, pos: mf.position, lastOffset: mf.lastOffset };
}));

await page.keyboard.type(')');
await sleep(50);

console.log('After ): pos:', await page.evaluate(() => {
  const mf = document.querySelectorAll('math-field')[document.querySelectorAll('math-field').length - 1];
  return { val: mf.value, pos: mf.position, lastOffset: mf.lastOffset };
}));

await page.close();
await browser.disconnect();

import puppeteer from 'puppeteer-core';

const browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null });
const page = await browser.newPage();
await page.goto('file:///C:/Users/Lenovo%20ThinkPad/.gemini/antigravity-ide/scratch/classroom-socratic-addon/public/wysiwyg-demo.html', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => customElements.get('math-field'));

const res = await page.evaluate(() => {
  const mf = document.createElement('math-field');
  document.body.appendChild(mf);
  mf.focus();
  mf.insert('\\log_{#?}', { selectionMode: 'placeholder', focus: true });
  return {
    val: mf.value,
    pos: mf.position,
    sel: mf.selection
  };
});
console.log('Insert \\log_{#?}:', res);

await page.keyboard.type('3');
console.log('After typing 3:', await page.evaluate(() => document.querySelectorAll('math-field')[document.querySelectorAll('math-field').length - 1].value));

await page.keyboard.type('(');
console.log('After typing (:', await page.evaluate(() => document.querySelectorAll('math-field')[document.querySelectorAll('math-field').length - 1].value));

await page.keyboard.type('6');
console.log('After typing 6:', await page.evaluate(() => document.querySelectorAll('math-field')[document.querySelectorAll('math-field').length - 1].value));

await page.close();
await browser.disconnect();

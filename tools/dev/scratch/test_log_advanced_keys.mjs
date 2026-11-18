import puppeteer from 'puppeteer-core';

const browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null });
const page = await browser.newPage();
await page.goto('file:///C:/Users/Lenovo%20ThinkPad/.gemini/antigravity-ide/scratch/classroom-socratic-addon/public/wysiwyg-demo.html', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => customElements.get('math-field'));

const res = await page.evaluate(() => {
  const mf = document.createElement('math-field');
  document.body.appendChild(mf);
  mf.focus();
  mf.insert('\\log_{#?}\\left(#?\\right)', { selectionMode: 'placeholder', focus: true });

  // Add keydown listener to handle _ and ( and Space
  mf.addEventListener('keydown', (e) => {
    if (e.key === '_') {
      // If we are in log base placeholder or already in subscript, ignore extra _
      if (mf.value.includes('\\log_{\\placeholder{}}') || mf.value.includes('\\log_{')) {
        e.preventDefault();
        e.stopPropagation();
      }
    } else if (e.key === '(') {
      if (mf.value.includes('\\log')) {
        e.preventDefault();
        e.stopPropagation();
        mf.executeCommand('moveToNextPlaceholder');
      }
    } else if (e.key === ' ') {
      if (mf.value.includes('\\placeholder') && mf.position < mf.lastOffset) {
        e.preventDefault();
        e.stopPropagation();
        mf.executeCommand('moveToNextPlaceholder');
      }
    }
  });

  return { val: mf.value, pos: mf.position };
});
console.log('Inserted log:', res);

// Simulate user typing "3"
await page.keyboard.type('3');
console.log('After "3":', await page.evaluate(() => document.querySelectorAll('math-field')[document.querySelectorAll('math-field').length - 1].value));

// Simulate user typing "_" (redundant underscore if typed log_3)
await page.keyboard.type('_');
console.log('After redundant "_":', await page.evaluate(() => document.querySelectorAll('math-field')[document.querySelectorAll('math-field').length - 1].value));

// Simulate user typing "("
await page.keyboard.type('(');
console.log('After "(": pos:', await page.evaluate(() => {
  const mf = document.querySelectorAll('math-field')[document.querySelectorAll('math-field').length - 1];
  return { val: mf.value, pos: mf.position };
}));

// Simulate user typing "6"
await page.keyboard.type('6');
console.log('After "6":', await page.evaluate(() => document.querySelectorAll('math-field')[document.querySelectorAll('math-field').length - 1].value));

await page.close();
await browser.disconnect();

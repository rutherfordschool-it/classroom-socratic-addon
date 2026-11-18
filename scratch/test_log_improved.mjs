import puppeteer from 'puppeteer-core';

const browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null });
const page = await browser.newPage();

const sleep = ms => new Promise(r => setTimeout(r, ms));

// Test directly on math-field
const testRes = await page.evaluate(() => {
  const mf = document.createElement('math-field');
  document.body.appendChild(mf);
  mf.focus();
  mf.insert('\\log_{#?}\\left(#?\\right)', { selectionMode: 'placeholder', focus: true });
  return {
    val: mf.value,
    pos: mf.position
  };
});
console.log('Inserted placeholder:', testRes);

// Type "3" in base
await page.keyboard.type('3');
await sleep(100);

let val1 = await page.evaluate(() => document.querySelectorAll('math-field')[document.querySelectorAll('math-field').length - 1].value);
console.log('After typing 3 in base:', val1);

// Now what happens if user types "(" or Tab or ArrowRight?
await page.keyboard.press('Tab');
await sleep(100);
await page.keyboard.type('6');
await sleep(100);

let val2 = await page.evaluate(() => document.querySelectorAll('math-field')[document.querySelectorAll('math-field').length - 1].value);
console.log('After Tab and 6:', val2);

await page.close();
await browser.disconnect();

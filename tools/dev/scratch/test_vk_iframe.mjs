import puppeteer from 'puppeteer-core';

const browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null });
const page = await browser.newPage();
await page.goto('file:///C:/Users/Lenovo%20ThinkPad/.gemini/antigravity-ide/scratch/classroom-socratic-addon/public/wysiwyg-demo.html', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => document.querySelector('#targetAnswer') && customElements.get('math-field'));
await new Promise(r => setTimeout(r, 300));

// Scroll targetAnswer to top of viewport so keyboard doesn't cover it
await page.evaluate(() => {
  document.body.style.paddingBottom = '500px';
  document.getElementById('targetAnswer').scrollIntoView({ block: 'start' });
});
await new Promise(r => setTimeout(r, 200));

const clickToggle = async () => {
  const pt = await page.evaluate(() => {
    const mf = document.getElementById('targetAnswer');
    const btn = mf.shadowRoot.querySelector('[part="virtual-keyboard-toggle"]');
    const r = btn.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, topEl: document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)?.tagName };
  });
  console.log('Clicking toggle at:', pt);
  await page.mouse.click(pt.x, pt.y);
};

await clickToggle();
await new Promise(r => setTimeout(r, 500));
console.log('With policy=auto, after click 1:', await page.evaluate(() => window.mathVirtualKeyboard.visible));

await clickToggle();
await new Promise(r => setTimeout(r, 500));
console.log('With policy=auto, after click 2 (500ms later):', await page.evaluate(() => window.mathVirtualKeyboard.visible));

// Now test with mathVirtualKeyboardPolicy = 'sandboxed'
await page.evaluate(() => {
  window.mathVirtualKeyboard.hide();
  document.getElementById('targetAnswer').mathVirtualKeyboardPolicy = 'sandboxed';
});
await new Promise(r => setTimeout(r, 300));

await clickToggle();
await new Promise(r => setTimeout(r, 500));
console.log('With policy=sandboxed, after click 1:', await page.evaluate(() => window.mathVirtualKeyboard.visible));

await clickToggle();
await new Promise(r => setTimeout(r, 500));
console.log('With policy=sandboxed, after click 2 (500ms later):', await page.evaluate(() => window.mathVirtualKeyboard.visible));

await page.close();
await browser.disconnect();
process.exit(0);

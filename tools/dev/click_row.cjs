const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');

const ARTIFACT_DIR = 'C:\\Users\\Lenovo ThinkPad\\.gemini\\antigravity-cli\\brain\\413efb06-696b-43a5-984c-06d813a052d4';

async function main() {
  const browser = await puppeteer.connect({
    browserURL: 'http://127.0.0.1:9222',
    defaultViewport: null
  });

  const pages = await browser.pages();
  const page = pages.find(p => p.url().includes('classroom.google.com'));
  if (!page) throw new Error('Classroom tab not found');

  await page.bringToFront();

  // Find exact row text element and click its center
  const targetRect = await page.evaluate(() => {
    const all = Array.from(document.querySelectorAll('*'));
    const match = all.find(el => el.innerText && el.innerText.trim().startsWith('SocratesAI: Product, Quotient') && el.children.length === 0);
    if (!match) return null;
    const clickable = match.closest('div[role="button"], div[tabindex], li, a') || match;
    const r = clickable.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2, tag: clickable.tagName, text: match.innerText };
  });

  console.log('Target rect:', targetRect);

  if (targetRect) {
    console.log(`Clicking at (${targetRect.x}, ${targetRect.y})...`);
    await page.mouse.click(targetRect.x, targetRect.y);
  }

  await new Promise(r => setTimeout(r, 3000));

  const screenshotPath = path.join(ARTIFACT_DIR, 'classwork_after_mouse_click.png');
  await page.screenshot({ path: screenshotPath });
  console.log('Screenshot saved to:', screenshotPath);

  // Check what appeared
  const links = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('a, button, [role="button"]'))
      .filter(el => el.offsetParent !== null)
      .map(el => ({
        tag: el.tagName,
        text: (el.innerText || el.getAttribute('aria-label') || '').trim().replace(/\n+/g, ' '),
        href: el.href || null
      }))
      .filter(x => x.text.length > 0 && (x.text.includes('View') || x.text.includes('instruction') || x.text.includes('Student') || x.text.includes('Turned') || x.text.includes('Assigned') || x.href));
  });

  console.log('Found action links:', JSON.stringify(links, null, 2));

  browser.disconnect();
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});

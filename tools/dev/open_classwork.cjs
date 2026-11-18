const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');

const ARTIFACT_DIR = 'C:\\Users\\Lenovo ThinkPad\\.gemini\\antigravity-cli\\brain\\413efb06-696b-43a5-984c-06d813a052d4';

async function main() {
  console.log('Connecting to Chrome on port 9222...');
  const browser = await puppeteer.connect({
    browserURL: 'http://127.0.0.1:9222',
    defaultViewport: null
  });

  const pages = await browser.pages();
  const page = pages.find(p => p.url().includes('classroom.google.com'));
  if (!page) {
    throw new Error('Classroom tab not found');
  }

  await page.bringToFront();
  console.log('Navigating to Classwork page...');
  await page.goto('https://classroom.google.com/w/ODkwNzY5OTc4MjEw/t/all', { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 2000));

  const screenshotPath = path.join(ARTIFACT_DIR, 'classwork_tab.png');
  await page.screenshot({ path: screenshotPath });
  console.log('Screenshot saved to:', screenshotPath);

  // Find all assignments on Classwork page
  const list = await page.evaluate(() => {
    const items = [];
    document.querySelectorAll('[data-item-id], [role="article"], ol li, [data-stream-item-id]').forEach(el => {
      const text = el.innerText || '';
      if (text.includes('SocratesAI') || text.includes('Product')) {
        const link = el.querySelector('a');
        items.push({
          tag: el.tagName,
          text: text.slice(0, 150).replace(/\n+/g, ' '),
          href: link ? link.href : null
        });
      }
    });
    return items;
  });

  console.log('Found assignment elements:', JSON.stringify(list, null, 2));

  // Click on the SocratesAI assignment card to expand it
  console.log('Clicking on SocratesAI assignment...');
  const clicked = await page.evaluate(() => {
    const all = Array.from(document.querySelectorAll('div, span, h3, a'));
    const item = all.find(el => el.innerText && el.innerText.includes('SocratesAI: Product, Quotient') && el.offsetParent !== null);
    if (item) {
      const clickable = item.closest('[role="button"], a, [data-item-id], li') || item;
      clickable.click();
      return { success: true, text: item.innerText };
    }
    return { success: false };
  });

  console.log('Click result:', clicked);
  await new Promise(r => setTimeout(r, 2500));

  const expandedScreenshot = path.join(ARTIFACT_DIR, 'classwork_expanded.png');
  await page.screenshot({ path: expandedScreenshot });
  console.log('Expanded screenshot saved to:', expandedScreenshot);

  // Inspect what links and buttons appeared in the expanded view
  const expandedDetails = await page.evaluate(() => {
    const links = Array.from(document.querySelectorAll('a, button, [role="button"]'))
      .filter(el => el.offsetParent !== null)
      .map(el => ({
        tag: el.tagName,
        text: (el.innerText || el.getAttribute('aria-label') || '').trim().replace(/\n+/g, ' '),
        href: el.href || null
      }))
      .filter(x => x.text.length > 0 && x.text.length < 100);
    return links;
  });

  console.log('Visible action links/buttons:', JSON.stringify(expandedDetails.slice(0, 30), null, 2));

  browser.disconnect();
}

main().catch(e => {
  console.error('Error:', e);
  process.exit(1);
});

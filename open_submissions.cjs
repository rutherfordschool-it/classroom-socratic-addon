const puppeteer = require('puppeteer-core');
const path = require('path');

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
  console.log('Navigating directly to assignment submissions page...');
  const submissionsUrl = 'https://classroom.google.com/c/ODkwNzY5OTc4MjEw/a/ODkwOTU4OTg5OTcx/submissions/by-status/and-sort-name/list';
  await page.goto(submissionsUrl, { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 3000));

  const screenshotPath = path.join(ARTIFACT_DIR, 'classroom_submissions_list.png');
  await page.screenshot({ path: screenshotPath });
  console.log('Submissions list screenshot saved to:', screenshotPath);

  // Inspect student roster and submission states
  const data = await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('[role="row"], [data-student-id], tr, [data-row-id], li'))
      .map(r => r.innerText ? r.innerText.trim().replace(/\n+/g, ' | ') : '')
      .filter(t => t.length > 5);

    const links = Array.from(document.querySelectorAll('a'))
      .filter(a => a.offsetParent !== null && a.innerText)
      .map(a => ({ text: a.innerText.trim().replace(/\n+/g, ' '), href: a.href }));

    return { rows: Array.from(new Set(rows)), links };
  });

  console.log('Found rows:', JSON.stringify(data.rows, null, 2));
  console.log('Found links:', JSON.stringify(data.links, null, 2));

  browser.disconnect();
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});

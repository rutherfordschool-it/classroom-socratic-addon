const puppeteer = require('puppeteer-core');
const path = require('path');

const ARTIFACT_DIR = 'C:\\Users\\Lenovo ThinkPad\\.gemini\antigravity-cli\\brain\\413efb06-696b-43a5-984c-06d813a052d4';

async function main() {
  console.log('Connecting to Chrome on port 9222...');
  const browser = await puppeteer.connect({
    browserURL: 'http://127.0.0.1:9222',
    defaultViewport: null
  });

  const pages = await browser.pages();
  const classroomPage = pages.find(p => p.url().includes('classroom.google.com'));
  if (!classroomPage) {
    console.error('Classroom page not found!');
    process.exit(1);
  }

  await classroomPage.bringToFront();
  console.log('Current URL:', classroomPage.url());

  // Click on the assignment with SocratesAI text
  console.log('Searching for SocratesAI assignment element...');
  const assignmentSelector = await classroomPage.evaluate(() => {
    const elements = Array.from(document.querySelectorAll('div, span, a, h3, h2'));
    const target = elements.find(el => el.textContent && el.textContent.includes('SocratesAI') && el.offsetParent !== null);
    if (target) {
      // Find the clickable card container
      const card = target.closest('[data-stream-item-id], [role="article"], [role="button"], a, div[tabindex]') || target;
      card.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return { found: true, text: target.textContent.trim().slice(0, 100), tagName: card.tagName };
    }
    return { found: false };
  });

  console.log('Assignment search result:', assignmentSelector);

  // Click using evaluate or coordinates
  await classroomPage.evaluate(() => {
    const elements = Array.from(document.querySelectorAll('div, span, a, h3, h2'));
    const target = elements.find(el => el.textContent && el.textContent.includes('SocratesAI') && el.offsetParent !== null);
    if (target) {
      const clickable = target.closest('[role="button"], a, [data-stream-item-id]') || target;
      clickable.click();
    }
  });

  console.log('Waiting 3 seconds for UI update / navigation...');
  await new Promise(r => setTimeout(r, 3000));

  console.log('New URL:', classroomPage.url());
  const screenshotPath = path.join(ARTIFACT_DIR, 'classroom_assignment_view.png');
  await classroomPage.screenshot({ path: screenshotPath });
  console.log('Screenshot saved to:', screenshotPath);

  // Check frames and links
  const frames = classroomPage.frames();
  console.log(`Page frames count: ${frames.length}`);
  for (let i = 0; i < frames.length; i++) {
    const f = frames[i];
    console.log(`Frame ${i}: ${f.url().slice(0, 100)}`);
  }

  browser.disconnect();
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});

import puppeteer from 'puppeteer-core';

const browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null });
const pages = await browser.pages();
const demo = pages.find(p => p.url().includes('wysiwyg-demo.html'));
if (demo) {
  const info = await demo.evaluate(() => {
    return {
      title: document.title,
      howtoText: document.querySelector('.howto')?.innerText,
      teacherPromptText: document.querySelector('#teacherPromptWrap')?.innerText,
      teacherPromptHtml: document.querySelector('#teacherPromptWrap')?.innerHTML,
      levelBText: document.querySelector('#levelBWrap')?.innerText,
      targetAnswerVal: document.querySelector('#targetAnswer')?.value
    };
  });
  console.log('Demo Page in User Chrome:', JSON.stringify(info, null, 2));
} else {
  console.log('Demo page not found');
}
await browser.disconnect();

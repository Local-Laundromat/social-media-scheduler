const puppeteer = require('puppeteer');

async function fetchWebsiteContent(url) {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();

  await page.goto(url, { waitUntil: 'networkidle2' });

  // Extract text content
  const content = await page.evaluate(() => {
    return {
      title: document.title,
      headings: Array.from(document.querySelectorAll('h1, h2, h3')).map(h => h.innerText),
      text: document.body.innerText,
    };
  });

  await browser.close();
  return content;
}

(async () => {
  console.log('=== AI SERVICES PAGE ===');
  const aiServices = await fetchWebsiteContent('https://sunpd.app/ai-services');
  console.log(JSON.stringify(aiServices, null, 2));

  console.log('\n\n=== MAIN PAGE ===');
  const mainPage = await fetchWebsiteContent('https://sunpd.app');
  console.log(JSON.stringify(mainPage, null, 2));
})();

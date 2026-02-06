// Minimal Puppeteer E2E test for login -> admin dashboard
const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  page.setDefaultTimeout(15000);

  try {
    await page.goto('http://localhost:3000/login.html');
    await page.type('#username', 'admintest');
    await page.type('#password', 'adminpass');
    await Promise.all([
      page.click('#loginForm button[type="submit"]'),
      page.waitForNavigation({ waitUntil: 'networkidle0' })
    ]);

    const url = page.url();
    if (!url.includes('/admin/dashboard.html')) {
      throw new Error('Did not reach admin dashboard, current URL: ' + url);
    }

    // Check overview title present
    const text = await page.$eval('main h2', el => el.textContent.trim());
    if (!text.toLowerCase().includes('overview')) {
      throw new Error('Overview heading not found on dashboard');
    }

    console.log('E2E login -> dashboard: success');
    await browser.close();
    process.exit(0);
  } catch (err) {
    console.error('E2E test failed:', err.message);
    await browser.close();
    process.exit(2);
  }
})();
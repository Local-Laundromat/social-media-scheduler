const { join } = require('path');

/**
 * @type {import("puppeteer").Configuration}
 */
module.exports = {
  // Skip downloading Chromium on Railway (use system Chromium instead)
  skipDownload: process.env.RAILWAY_ENVIRONMENT ? true : false,

  // Use bundled Chromium locally
  cacheDirectory: join(__dirname, '.cache', 'puppeteer'),
};

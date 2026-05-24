/**
 * Link Shortener Service
 * Handles URL shortening with Bitly API and click tracking
 */

const { BitlyClient } = require('bitly');

class LinkShortenerService {
  constructor() {
    this.bitlyToken = process.env.BITLY_ACCESS_TOKEN;
    this.bitly = this.bitlyToken && this.bitlyToken !== 'your_bitly_access_token_here'
      ? new BitlyClient(this.bitlyToken)
      : null;

    this.isConfigured = !!this.bitly;
  }

  /**
   * Shorten a single URL
   * @param {string} longUrl - The URL to shorten
   * @param {object} options - Additional options (title, tags)
   * @returns {Promise<object>} - { shortUrl, longUrl, id, clicks: 0 }
   */
  async shortenUrl(longUrl, options = {}) {
    if (!this.isConfigured) {
      console.warn('Bitly not configured, returning original URL');
      return {
        shortUrl: longUrl,
        longUrl: longUrl,
        id: null,
        clicks: 0,
        configured: false
      };
    }

    try {
      // Validate URL
      if (!this.isValidUrl(longUrl)) {
        throw new Error('Invalid URL format');
      }

      // Shorten with Bitly
      const result = await this.bitly.shorten(longUrl);

      return {
        shortUrl: result.link,
        longUrl: result.long_url,
        id: result.id,
        clicks: 0,
        configured: true
      };
    } catch (error) {
      console.error('Error shortening URL:', error);
      // Fallback to original URL on error
      return {
        shortUrl: longUrl,
        longUrl: longUrl,
        id: null,
        clicks: 0,
        error: error.message
      };
    }
  }

  /**
   * Get click stats for a shortened URL
   * @param {string} bitlinkId - The Bitly link ID
   * @returns {Promise<object>} - { clicks, referrers, countries }
   */
  async getClickStats(bitlinkId) {
    if (!this.isConfigured || !bitlinkId) {
      return { clicks: 0, referrers: [], countries: [] };
    }

    try {
      const clicks = await this.bitly.clicks(bitlinkId);
      return {
        clicks: clicks.link_clicks?.[0]?.clicks || 0,
        configured: true
      };
    } catch (error) {
      console.error('Error getting click stats:', error);
      return { clicks: 0, error: error.message };
    }
  }

  /**
   * Extract and shorten all URLs from text
   * @param {string} text - Text containing URLs
   * @returns {Promise<object>} - { text: modifiedText, urls: [{ original, shortened }] }
   */
  async shortenUrlsInText(text) {
    if (!text || !this.isConfigured) {
      return { text, urls: [] };
    }

    // URL regex pattern
    const urlPattern = /(https?:\/\/[^\s]+)/g;
    const urls = text.match(urlPattern) || [];

    if (urls.length === 0) {
      return { text, urls: [] };
    }

    const shortenedUrls = [];
    let modifiedText = text;

    // Shorten each URL
    for (const url of urls) {
      const result = await this.shortenUrl(url);

      if (result.shortUrl !== url) {
        modifiedText = modifiedText.replace(url, result.shortUrl);
        shortenedUrls.push({
          original: url,
          shortened: result.shortUrl,
          id: result.id
        });
      }
    }

    return {
      text: modifiedText,
      urls: shortenedUrls
    };
  }

  /**
   * Validate URL format
   * @param {string} url - URL to validate
   * @returns {boolean}
   */
  isValidUrl(url) {
    try {
      const urlObj = new URL(url);
      return urlObj.protocol === 'http:' || urlObj.protocol === 'https:';
    } catch (e) {
      return false;
    }
  }

  /**
   * Check if Bitly is configured
   * @returns {boolean}
   */
  isEnabled() {
    return this.isConfigured;
  }
}

// Export singleton instance
module.exports = new LinkShortenerService();

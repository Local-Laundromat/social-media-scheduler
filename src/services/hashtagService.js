/**
 * Hashtag Suggestion Service
 * AI-powered hashtag recommendations using OpenAI
 */

const { getOpenAI } = require('./openai');

class HashtagService {
  constructor() {
    this.openai = null;
    this.isConfigured = false;
  }

  /**
   * Initialize OpenAI client
   */
  initialize() {
    if (!this.openai) {
      try {
        this.openai = getOpenAI();
        this.isConfigured = !!this.openai;
      } catch (error) {
        console.warn('OpenAI not configured for hashtag suggestions');
        this.isConfigured = false;
      }
    }
  }

  /**
   * Generate hashtag suggestions based on post content
   * @param {string} caption - The post caption/content
   * @param {string} platform - Target platform (instagram, twitter, facebook, etc.)
   * @param {number} count - Number of hashtags to generate (default: 15)
   * @returns {Promise<object>} - { hashtags: { high: [], medium: [], niche: [] }, raw: [] }
   */
  async suggestHashtags(caption, platform = 'instagram', count = 15) {
    this.initialize();

    if (!this.isConfigured) {
      return {
        hashtags: { high: [], medium: [], niche: [] },
        raw: [],
        error: 'OpenAI not configured'
      };
    }

    if (!caption || caption.trim().length === 0) {
      return {
        hashtags: { high: [], medium: [], niche: [] },
        raw: [],
        error: 'No caption provided'
      };
    }

    try {
      const platformLimits = {
        instagram: 30,
        twitter: 3,
        facebook: 10,
        tiktok: 20,
        linkedin: 5,
        pinterest: 20
      };

      const maxHashtags = platformLimits[platform.toLowerCase()] || count;

      const prompt = `You are a social media expert specializing in hashtag strategy.

Analyze this ${platform} post and suggest ${count} relevant, trending hashtags.

Post content: "${caption}"

Categorize the hashtags into three tiers based on their reach and competition:

1. HIGH VOLUME (5 hashtags): Popular hashtags with 100k+ posts. High visibility but high competition.
2. MEDIUM VOLUME (5 hashtags): Moderate hashtags with 10k-100k posts. Good balance of reach and competition.
3. NICHE (5 hashtags): Specific hashtags with <10k posts. Low competition, highly targeted audience.

Important rules:
- All hashtags must be relevant to the post content
- Include mix of general and specific hashtags
- Consider ${platform} best practices (max ${maxHashtags} hashtags)
- No spaces in hashtags
- No special characters except underscores
- Return ONLY valid hashtags that exist

Return response as JSON in this exact format:
{
  "high": ["#hashtag1", "#hashtag2", "#hashtag3", "#hashtag4", "#hashtag5"],
  "medium": ["#hashtag1", "#hashtag2", "#hashtag3", "#hashtag4", "#hashtag5"],
  "niche": ["#hashtag1", "#hashtag2", "#hashtag3", "#hashtag4", "#hashtag5"]
}`;

      const completion = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You are a social media hashtag expert. Always return valid JSON with categorized hashtag suggestions.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.7,
        max_tokens: 500,
        response_format: { type: 'json_object' }
      });

      const response = completion.choices[0].message.content;
      const parsed = JSON.parse(response);

      // Ensure all hashtags start with #
      const formatHashtag = (tag) => {
        const cleaned = tag.trim().replace(/\s+/g, '');
        return cleaned.startsWith('#') ? cleaned : `#${cleaned}`;
      };

      const hashtags = {
        high: (parsed.high || []).map(formatHashtag),
        medium: (parsed.medium || []).map(formatHashtag),
        niche: (parsed.niche || []).map(formatHashtag)
      };

      const raw = [
        ...hashtags.high,
        ...hashtags.medium,
        ...hashtags.niche
      ];

      return {
        hashtags,
        raw,
        platform,
        maxHashtags,
        tokensUsed: completion.usage?.total_tokens || 0
      };

    } catch (error) {
      console.error('Error generating hashtag suggestions:', error);
      return {
        hashtags: { high: [], medium: [], niche: [] },
        raw: [],
        error: error.message
      };
    }
  }

  /**
   * Get popular hashtags for a specific niche/topic
   * @param {string} topic - Topic or niche
   * @param {number} count - Number of hashtags
   * @returns {Promise<string[]>}
   */
  async getPopularHashtagsForTopic(topic, count = 10) {
    this.initialize();

    if (!this.isConfigured) {
      return [];
    }

    try {
      const prompt = `List ${count} currently trending and popular hashtags for the topic: "${topic}".

Return only the hashtags, one per line, with the # symbol.
Make sure they are real, existing hashtags that are currently popular.`;

      const completion = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.5,
        max_tokens: 200
      });

      const response = completion.choices[0].message.content;
      const hashtags = response
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.startsWith('#'))
        .slice(0, count);

      return hashtags;

    } catch (error) {
      console.error('Error getting popular hashtags:', error);
      return [];
    }
  }

  /**
   * Check if hashtag service is configured
   * @returns {boolean}
   */
  isEnabled() {
    this.initialize();
    return this.isConfigured;
  }
}

// Export singleton instance
module.exports = new HashtagService();

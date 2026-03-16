const express = require('express');
const router = express.Router();
const OpenAI = require('openai');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || 'not-configured'
});

/**
 * POST /api/generate-caption - Generate AI caption for image
 */
router.post('/generate-caption', async (req, res) => {
  const { image_url, company, listing_details } = req.body;

  if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY === 'not-configured') {
    return res.json({
      success: false,
      error: 'OpenAI API key not configured. Please add OPENAI_API_KEY to your .env file'
    });
  }

  try {
    // Build context for AI
    let context = '';

    if (company) {
      context += `Company: ${company}\n`;
    }

    if (listing_details) {
      context += `Property Details:\n`;
      if (listing_details.address) context += `Address: ${listing_details.address}\n`;
      if (listing_details.price) context += `Price: $${listing_details.price.toLocaleString()}\n`;
      if (listing_details.bedrooms) context += `Bedrooms: ${listing_details.bedrooms}\n`;
      if (listing_details.bathrooms) context += `Bathrooms: ${listing_details.bathrooms}\n`;
      if (listing_details.sqft) context += `Square Feet: ${listing_details.sqft}\n`;
    }

    // Generate caption using GPT-4 Vision
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are a professional social media manager specializing in real estate and business marketing. Create engaging, professional captions for social media posts. Use emojis strategically. Keep captions concise but impactful (2-4 sentences). Include relevant hashtags at the end.`
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `Generate an engaging social media caption for this image. ${context ? 'Context:\n' + context : ''}\n\nMake it attention-grabbing and professional.`
            },
            {
              type: 'image_url',
              image_url: {
                url: image_url
              }
            }
          ]
        }
      ],
      max_tokens: 300,
      temperature: 0.7
    });

    const caption = response.choices[0].message.content;

    res.json({
      success: true,
      caption: caption.trim()
    });

  } catch (error) {
    console.error('OpenAI error:', error);

    // Fallback to text-only generation if image URL fails
    if (error.message && error.message.includes('url')) {
      try {
        const fallbackResponse = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content: 'You are a professional social media manager. Create engaging captions for social media posts.'
            },
            {
              role: 'user',
              content: `Generate an engaging social media caption. ${company ? `Company: ${company}` : ''} ${listing_details ? `Details: ${JSON.stringify(listing_details)}` : ''}`
            }
          ],
          max_tokens: 200
        });

        res.json({
          success: true,
          caption: fallbackResponse.choices[0].message.content.trim()
        });
      } catch (fallbackError) {
        res.status(500).json({
          success: false,
          error: 'Failed to generate caption',
          details: fallbackError.message
        });
      }
    } else {
      res.status(500).json({
        success: false,
        error: 'Failed to generate caption',
        details: error.message
      });
    }
  }
});

/**
 * POST /api/generate-template-caption - Generate caption from template
 * (Simpler, cheaper alternative without image analysis)
 */
router.post('/generate-template-caption', async (req, res) => {
  const { type, data, company } = req.body;

  if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY === 'not-configured') {
    // Provide a simple template fallback
    let caption = '';

    if (type === 'listing' && data) {
      caption = `🏡 NEW LISTING!\n\n`;
      if (data.address) caption += `${data.address}\n`;
      if (data.price) caption += `💰 $${data.price.toLocaleString()}\n`;
      if (data.bedrooms && data.bathrooms) {
        caption += `🛏️ ${data.bedrooms} bed | 🛁 ${data.bathrooms} bath\n`;
      }
      caption += `\nContact us for more details! 📞`;
    } else {
      caption = `Check out this amazing ${type}! 🎉\n\nContact us to learn more.`;
    }

    return res.json({
      success: true,
      caption,
      note: 'Template-generated caption (OpenAI not configured)'
    });
  }

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You are a professional social media manager. Create engaging captions for social media posts. Use emojis and keep it concise.'
        },
        {
          role: 'user',
          content: `Create a ${type} social media caption. ${company ? `Company: ${company}. ` : ''}Details: ${JSON.stringify(data)}`
        }
      ],
      max_tokens: 200,
      temperature: 0.8
    });

    res.json({
      success: true,
      caption: response.choices[0].message.content.trim()
    });

  } catch (error) {
    console.error('OpenAI error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate caption'
    });
  }
});

/**
 * POST /api/generate-hashtags - Generate relevant hashtags for content
 */
router.post('/generate-hashtags', async (req, res) => {
  const { caption, industry, platforms } = req.body;

  if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY === 'not-configured') {
    // Provide generic hashtag suggestions
    const genericTags = [
      '#socialmedia',
      '#marketing',
      '#business',
      '#entrepreneur',
      '#digitalmarketing',
      '#contentcreator',
      '#smallbusiness',
      '#branding'
    ];

    return res.json({
      success: true,
      hashtags: genericTags.slice(0, 10),
      note: 'Generic hashtags (OpenAI not configured)'
    });
  }

  try {
    const platformsStr = Array.isArray(platforms) ? platforms.join(', ') : platforms || 'social media';

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are a social media hashtag expert. Generate relevant, trending hashtags that will maximize reach and engagement. Consider platform-specific best practices.`
        },
        {
          role: 'user',
          content: `Generate 15-20 relevant hashtags for this content:

Caption: "${caption}"
${industry ? `Industry: ${industry}` : ''}
Platforms: ${platformsStr}

Provide a mix of:
- High-traffic popular hashtags (100k+ posts)
- Medium-traffic niche hashtags (10k-100k posts)
- Low-competition specific hashtags (<10k posts)

Return ONLY the hashtags as a comma-separated list, no explanations.`
        }
      ],
      max_tokens: 200,
      temperature: 0.7
    });

    const hashtagsText = response.choices[0].message.content.trim();
    const hashtags = hashtagsText
      .split(/[,\n]/)
      .map(tag => tag.trim())
      .filter(tag => tag.startsWith('#'))
      .slice(0, 20);

    res.json({
      success: true,
      hashtags,
      breakdown: {
        popular: hashtags.slice(0, 5),
        niche: hashtags.slice(5, 12),
        specific: hashtags.slice(12)
      }
    });

  } catch (error) {
    console.error('Hashtag generation error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate hashtags',
      details: error.message
    });
  }
});

/**
 * POST /api/translate-caption - Translate caption to another language
 */
router.post('/translate-caption', async (req, res) => {
  const { caption, targetLanguage, tone } = req.body;

  if (!caption || !targetLanguage) {
    return res.status(400).json({
      success: false,
      error: 'Caption and target language are required'
    });
  }

  if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY === 'not-configured') {
    return res.json({
      success: false,
      error: 'OpenAI API key not configured'
    });
  }

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are a professional translator specializing in social media content. Maintain the ${tone || 'original'} tone and preserve emojis and hashtags.`
        },
        {
          role: 'user',
          content: `Translate this social media caption to ${targetLanguage}. Keep emojis and adapt hashtags appropriately:

"${caption}"

Provide ONLY the translated caption, no explanations.`
        }
      ],
      max_tokens: 300,
      temperature: 0.5
    });

    const translatedCaption = response.choices[0].message.content.trim();

    res.json({
      success: true,
      originalCaption: caption,
      translatedCaption,
      targetLanguage
    });

  } catch (error) {
    console.error('Translation error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to translate caption',
      details: error.message
    });
  }
});

/**
 * POST /api/optimize-caption - Optimize caption for specific platform
 */
router.post('/optimize-caption', async (req, res) => {
  const { caption, platform, goal } = req.body;

  if (!caption || !platform) {
    return res.status(400).json({
      success: false,
      error: 'Caption and platform are required'
    });
  }

  if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY === 'not-configured') {
    return res.json({
      success: false,
      error: 'OpenAI API key not configured'
    });
  }

  try {
    const platformGuidelines = {
      facebook: 'Optimize for Facebook: friendly tone, longer text (up to 500 chars), encourage comments and shares',
      instagram: 'Optimize for Instagram: Visual storytelling, 150-300 chars, strong first line, strategic line breaks, emoji-heavy',
      tiktok: 'Optimize for TikTok: Short, punchy, trendy language, max 150 chars, lots of hashtags, call-to-action'
    };

    const guideline = platformGuidelines[platform.toLowerCase()] || platformGuidelines.instagram;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are a social media optimization expert. ${guideline}${goal ? ` Goal: ${goal}` : ''}`
        },
        {
          role: 'user',
          content: `Optimize this caption for ${platform}:

"${caption}"

Provide ONLY the optimized caption, no explanations.`
        }
      ],
      max_tokens: 300,
      temperature: 0.7
    });

    const optimizedCaption = response.choices[0].message.content.trim();

    res.json({
      success: true,
      originalCaption: caption,
      optimizedCaption,
      platform,
      improvements: `Optimized for ${platform} best practices${goal ? ` with focus on ${goal}` : ''}`
    });

  } catch (error) {
    console.error('Optimization error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to optimize caption',
      details: error.message
    });
  }
});

module.exports = router;

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

module.exports = router;

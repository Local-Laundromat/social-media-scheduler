/**
 * Profile API Routes
 * Handles user profile settings including brand voice preferences
 */

const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
const { authenticateSupabaseToken } = require('./authApi');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

/**
 * PUT /api/profile/brand-voice
 * Update brand voice preferences
 */
router.put('/brand-voice', authenticateSupabaseToken, async (req, res) => {
  try {
    const userId = req.userId;
    const { tone, custom_description, emoji_usage, response_length, contact_email, contact_phone } = req.body;

    // Validate required fields
    if (!tone) {
      return res.status(400).json({
        success: false,
        error: 'Brand voice tone is required'
      });
    }

    // Validate tone value
    const validTones = ['friendly', 'professional', 'playful', 'expert', 'custom'];
    if (!validTones.includes(tone)) {
      return res.status(400).json({
        success: false,
        error: `Invalid tone. Must be one of: ${validTones.join(', ')}`
      });
    }

    // Validate emoji_usage
    const validEmojiUsage = ['heavy', 'moderate', 'light', 'none'];
    if (emoji_usage && !validEmojiUsage.includes(emoji_usage)) {
      return res.status(400).json({
        success: false,
        error: `Invalid emoji_usage. Must be one of: ${validEmojiUsage.join(', ')}`
      });
    }

    // Validate response_length
    const validResponseLengths = ['brief', 'medium', 'detailed'];
    if (response_length && !validResponseLengths.includes(response_length)) {
      return res.status(400).json({
        success: false,
        error: `Invalid response_length. Must be one of: ${validResponseLengths.join(', ')}`
      });
    }

    // Build brand_voice object
    const brandVoice = {
      tone,
      emoji_usage: emoji_usage || 'moderate',
      response_length: response_length || 'medium'
    };

    // Add optional fields only if provided
    if (custom_description) {
      brandVoice.custom_description = custom_description;
    }
    if (contact_email) {
      brandVoice.contact_email = contact_email;
    }
    if (contact_phone) {
      brandVoice.contact_phone = contact_phone;
    }

    // Update profile with brand voice settings
    const { data, error } = await supabase
      .from('profiles')
      .update({ brand_voice: brandVoice })
      .eq('id', userId)
      .select()
      .single();

    if (error) {
      console.error('Supabase error updating brand voice:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to update brand voice settings'
      });
    }

    res.json({
      success: true,
      message: 'Brand voice settings updated successfully',
      brand_voice: data.brand_voice
    });

  } catch (error) {
    console.error('Error updating brand voice:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

/**
 * GET /api/profile/brand-voice
 * Get current brand voice preferences
 */
router.get('/brand-voice', authenticateSupabaseToken, async (req, res) => {
  try {
    const userId = req.userId;

    const { data, error } = await supabase
      .from('profiles')
      .select('brand_voice')
      .eq('id', userId)
      .single();

    if (error) {
      console.error('Supabase error fetching brand voice:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch brand voice settings'
      });
    }

    res.json({
      success: true,
      brand_voice: data.brand_voice || {
        tone: 'friendly',
        emoji_usage: 'moderate',
        response_length: 'medium'
      }
    });

  } catch (error) {
    console.error('Error fetching brand voice:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

module.exports = router;

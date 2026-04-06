const axios = require('axios');
const { supabase } = require('../database/supabase');

/**
 * Delete a post from social media platforms
 * @param {Object} post - Post object with platform post IDs
 * @param {Object} tokens - Object with platform tokens {facebook, instagram, tiktok}
 * @returns {Object} Results of deletion attempts
 */
async function deleteFromPlatforms(post, tokens) {
  const results = {
    facebook: { success: false, message: '' },
    instagram: { success: false, message: '' },
    tiktok: { success: false, message: '' }
  };

  // Delete from Facebook
  if (post.facebook_post_id && tokens.facebook) {
    try {
      await axios.delete(
        `https://graph.facebook.com/v18.0/${post.facebook_post_id}`,
        { params: { access_token: tokens.facebook } }
      );
      results.facebook = { success: true, message: 'Deleted from Facebook' };
    } catch (error) {
      const message = error.response?.data?.error?.message || error.message;
      results.facebook = { success: false, message: `Facebook delete failed: ${message}` };
      console.error('Facebook delete error:', message);
    }
  }

  // Delete from Instagram
  if (post.instagram_post_id && tokens.instagram) {
    try {
      await axios.delete(
        `https://graph.facebook.com/v18.0/${post.instagram_post_id}`,
        { params: { access_token: tokens.instagram } }
      );
      results.instagram = { success: true, message: 'Deleted from Instagram' };
    } catch (error) {
      const message = error.response?.data?.error?.message || error.message;
      results.instagram = { success: false, message: `Instagram delete failed: ${message}` };
      console.error('Instagram delete error:', message);
    }
  }

  // Delete from TikTok
  if (post.tiktok_post_id && tokens.tiktok) {
    try {
      // TikTok uses different API for deletion
      await axios.post(
        'https://open.tiktokapis.com/v2/post/delete/',
        { post_id: post.tiktok_post_id },
        {
          headers: {
            'Authorization': `Bearer ${tokens.tiktok}`,
            'Content-Type': 'application/json'
          }
        }
      );
      results.tiktok = { success: true, message: 'Deleted from TikTok' };
    } catch (error) {
      const message = error.response?.data?.error?.message || error.message;
      results.tiktok = { success: false, message: `TikTok delete failed: ${message}` };
      console.error('TikTok delete error:', message);
    }
  }

  return results;
}

/**
 * Get platform tokens for a user
 * @param {string} userId - User ID
 * @returns {Object} Platform tokens
 */
async function getPlatformTokens(userId) {
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('facebook_page_token, instagram_token, tiktok_access_token')
    .eq('id', userId)
    .single();

  if (error || !profile) {
    return { facebook: null, instagram: null, tiktok: null };
  }

  return {
    facebook: profile.facebook_page_token,
    instagram: profile.instagram_token,
    tiktok: profile.tiktok_access_token
  };
}

module.exports = {
  deleteFromPlatforms,
  getPlatformTokens
};

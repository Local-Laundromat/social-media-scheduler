/**
 * AI Comment Monitor & Responder Service
 * Monitors Facebook/Instagram comments and generates AI responses
 */

const OpenAI = require('openai');
const { get, getAll, insert, update: updateRow, deleteRows, customQuery, customGet, run, isSupabase } = require('../database/helpers');

// Helper function to get OpenAI client for a user
function getOpenAIClient(userApiKey) {
  const apiKey = userApiKey || process.env.OPENAI_API_KEY || 'not-configured';

  if (!apiKey || apiKey === 'not-configured') {
    return null;
  }

  return new OpenAI({ apiKey });
}

/**
 * Fetch recent comments from Facebook post
 * @param {string} postId - Facebook post ID
 * @param {string} accessToken - Facebook access token
 * @returns {Promise<Array>} Comments
 */
async function fetchFacebookComments(postId, accessToken) {
  try {
    const response = await fetch(
      `https://graph.facebook.com/v18.0/${postId}/comments?access_token=${accessToken}&fields=id,message,from,created_time,parent`
    );

    const data = await response.json();

    if (data.error) {
      console.error('Facebook API error:', data.error);
      return [];
    }

    return data.data || [];
  } catch (error) {
    console.error('Error fetching Facebook comments:', error);
    return [];
  }
}

/**
 * Fetch recent comments from Instagram post
 * @param {string} mediaId - Instagram media ID
 * @param {string} accessToken - Instagram access token
 * @returns {Promise<Array>} Comments
 */
async function fetchInstagramComments(mediaId, accessToken) {
  try {
    const response = await fetch(
      `https://graph.instagram.com/${mediaId}/comments?access_token=${accessToken}&fields=id,text,username,timestamp`
    );

    const data = await response.json();

    if (data.error) {
      console.error('Instagram API error:', data.error);
      return [];
    }

    return data.data || [];
  } catch (error) {
    console.error('Error fetching Instagram comments:', error);
    return [];
  }
}

/**
 * Analyze comment sentiment and intent using AI
 * @param {string} commentText - The comment text
 * @param {string} userApiKey - User's OpenAI API key (optional)
 * @returns {Promise<Object>} Analysis result
 */
async function analyzeComment(commentText, userApiKey = null) {
  const openai = getOpenAIClient(userApiKey);

  if (!openai) {
    // Fallback: simple keyword analysis
    const lowerText = commentText.toLowerCase();

    const isQuestion = lowerText.includes('?') ||
                      lowerText.includes('how') ||
                      lowerText.includes('what') ||
                      lowerText.includes('when') ||
                      lowerText.includes('where');

    const isInterested = lowerText.includes('interested') ||
                         lowerText.includes('available') ||
                         lowerText.includes('price') ||
                         lowerText.includes('contact');

    const isPositive = lowerText.includes('beautiful') ||
                      lowerText.includes('love') ||
                      lowerText.includes('amazing') ||
                      lowerText.includes('great');

    const isNegative = lowerText.includes('bad') ||
                      lowerText.includes('terrible') ||
                      lowerText.includes('worst');

    return {
      type: isQuestion ? 'question' : isInterested ? 'inquiry' : isPositive ? 'praise' : isNegative ? 'complaint' : 'general',
      sentiment: isPositive ? 'positive' : isNegative ? 'negative' : 'neutral',
      priority: isInterested || isQuestion ? 'high' : 'medium',
      autoReplyRecommended: isPositive || (isQuestion && !isNegative),
      keywords: []
    };
  }

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are a social media comment analyst. Analyze comments and return JSON with:
- type: "question", "inquiry", "praise", "complaint", "spam", "general"
- sentiment: "positive", "negative", "neutral"
- priority: "high", "medium", "low"
- autoReplyRecommended: true/false (whether safe to auto-reply)
- keywords: array of important keywords
- intent: brief description of user's intent`
        },
        {
          role: 'user',
          content: `Analyze this comment: "${commentText}"`
        }
      ],
      response_format: { type: "json_object" },
      temperature: 0.3
    });

    return JSON.parse(response.choices[0].message.content);
  } catch (error) {
    console.error('Comment analysis error:', error);
    return {
      type: 'general',
      sentiment: 'neutral',
      priority: 'medium',
      autoReplyRecommended: false,
      keywords: []
    };
  }
}

/**
 * Generate AI reply to comment
 * @param {Object} comment - Comment object
 * @param {Object} analysis - Analysis result
 * @param {Object} userProfile - User's brand profile
 * @param {string} userApiKey - User's OpenAI API key (optional)
 * @returns {Promise<string>} Generated reply
 */
async function generateReply(comment, analysis, userProfile = {}, userApiKey = null) {
  const {
    company = 'our team',
    brandVoice = 'professional and friendly',
    contactInfo = {}
  } = userProfile;

  const openai = getOpenAIClient(userApiKey);

  if (!openai) {
    // Fallback: template-based responses
    const templates = {
      question: `Thanks for your question! Please DM us or contact ${contactInfo.email || 'us'} for more details. 😊`,
      inquiry: `We'd love to help! Please reach out to us at ${contactInfo.phone || contactInfo.email || 'our office'} to discuss this further. 🏡`,
      praise: `Thank you so much for your kind words! We really appreciate it! ❤️`,
      complaint: `We're sorry to hear that. Please DM us so we can make this right.`,
      general: `Thanks for your comment! 😊`
    };

    return templates[analysis.type] || templates.general;
  }

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are a ${brandVoice} social media manager for ${company}, a real estate business.
Generate brief, engaging replies to comments.
- Keep responses under 50 words
- Be helpful and professional
- Use 1-2 emojis appropriately
- Include contact info when relevant: ${JSON.stringify(contactInfo)}
- Match the tone: ${analysis.sentiment} sentiment, ${analysis.type} type`
        },
        {
          role: 'user',
          content: `Generate a reply to this ${analysis.type} comment: "${comment.text || comment.message}"`
        }
      ],
      max_tokens: 150,
      temperature: 0.7
    });

    return response.choices[0].message.content.trim();
  } catch (error) {
    console.error('Reply generation error:', error);
    return `Thanks for your comment! Please reach out to us for more information. 😊`;
  }
}

/**
 * Post reply to Facebook comment
 * @param {string} commentId - Comment ID
 * @param {string} replyText - Reply text
 * @param {string} accessToken - Access token
 * @returns {Promise<Object>} Result
 */
async function postFacebookReply(commentId, replyText, accessToken) {
  try {
    const response = await fetch(
      `https://graph.facebook.com/v18.0/${commentId}/comments`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: replyText,
          access_token: accessToken
        })
      }
    );

    const data = await response.json();

    if (data.error) {
      return { success: false, error: data.error.message };
    }

    return { success: true, id: data.id };
  } catch (error) {
    console.error('Error posting Facebook reply:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Post reply to Instagram comment
 * @param {string} commentId - Comment ID
 * @param {string} replyText - Reply text
 * @param {string} accessToken - Access token
 * @returns {Promise<Object>} Result
 */
async function postInstagramReply(commentId, replyText, accessToken) {
  try {
    const response = await fetch(
      `https://graph.instagram.com/${commentId}/replies`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: replyText,
          access_token: accessToken
        })
      }
    );

    const data = await response.json();

    if (data.error) {
      return { success: false, error: data.error.message };
    }

    return { success: true, id: data.id };
  } catch (error) {
    console.error('Error posting Instagram reply:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Monitor comments for a user's posts
 * @param {number} userId - User ID
 * @returns {Promise<Array>} New comments with AI suggestions
 */
async function monitorUserComments(userId) {
  try {
    // Get user's social media credentials
    const user = await get('users', { id: userId });

    if (!user) {
      throw new Error('User not found');
    }

    // Get user's recent posts
    const posts = await customQuery(
      `SELECT * FROM posts
       WHERE user_id = ?
       AND status = 'posted'
       AND (facebook_post_id IS NOT NULL OR instagram_post_id IS NOT NULL)
       ORDER BY posted_at DESC
       LIMIT 10`,
      [userId],
      async () => {
        const { db } = require('../database/helpers');
        const { data, error } = await db
          .from('posts')
          .select('*')
          .eq('user_id', userId)
          .eq('status', 'posted')
          .or('facebook_post_id.not.is.null,instagram_post_id.not.is.null')
          .order('posted_at', { ascending: false })
          .limit(10);

        if (error) throw error;
        return data || [];
      }
    );

    const commentsWithSuggestions = [];

    for (const post of posts) {
      // Fetch Facebook comments
      if (post.facebook_post_id && user.facebook_access_token) {
        const fbComments = await fetchFacebookComments(
          post.facebook_post_id,
          user.facebook_access_token
        );

        for (const comment of fbComments) {
          const analysis = await analyzeComment(comment.message, user.openai_api_key);
          const suggestedReply = await generateReply(
            { text: comment.message },
            analysis,
            {
              company: user.company,
              contactInfo: {
                email: user.email,
                phone: user.phone
              }
            },
            user.openai_api_key
          );

          commentsWithSuggestions.push({
            platform: 'facebook',
            postId: post.id,
            commentId: comment.id,
            commentText: comment.message,
            from: comment.from.name,
            createdAt: comment.created_time,
            analysis,
            suggestedReply,
            autoReplyRecommended: analysis.autoReplyRecommended
          });
        }
      }

      // Fetch Instagram comments
      if (post.instagram_post_id && user.instagram_access_token) {
        const igComments = await fetchInstagramComments(
          post.instagram_post_id,
          user.instagram_access_token
        );

        for (const comment of igComments) {
          const analysis = await analyzeComment(comment.text, user.openai_api_key);
          const suggestedReply = await generateReply(
            { text: comment.text },
            analysis,
            {
              company: user.company,
              contactInfo: {
                email: user.email
              }
            },
            user.openai_api_key
          );

          commentsWithSuggestions.push({
            platform: 'instagram',
            postId: post.id,
            commentId: comment.id,
            commentText: comment.text,
            from: comment.username,
            createdAt: comment.timestamp,
            analysis,
            suggestedReply,
            autoReplyRecommended: analysis.autoReplyRecommended
          });
        }
      }
    }

    return commentsWithSuggestions;
  } catch (error) {
    throw error;
  }
}

module.exports = {
  fetchFacebookComments,
  fetchInstagramComments,
  analyzeComment,
  generateReply,
  postFacebookReply,
  postInstagramReply,
  monitorUserComments
};

/**
 * Google Business Review Management API Routes
 * Manages review monitoring, AI analysis, and response generation
 */

const express = require('express');
const router = express.Router();
const { authenticateSupabase } = require('../middleware/auth');
const { supabase } = require('../database/supabase');
const GoogleBusinessService = require('../services/googleBusiness');
const { processReview } = require('../services/reviewAgents');

/**
 * GET /api/reviews - Fetch and sync Google Business reviews
 */
router.get('/', authenticateSupabase, async (req, res) => {
  try {
    const userId = req.userId;
    const { syncNew = 'false', accountId, client_id } = req.query;

    // Get user's Google Business credentials
    let googleAccountsQuery = supabase
      .from('google_business_accounts')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true);

    // If accountId is specified, filter by it; otherwise get all accounts
    if (accountId) {
      googleAccountsQuery = googleAccountsQuery.eq('id', accountId);
    }

    const { data: googleAccounts } = await googleAccountsQuery;

    if (!googleAccounts || googleAccounts.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No Google Business account connected. Please connect your account first.',
        accounts: []
      });
    }

    // If no specific account requested, use the first one (or process all if syncing)
    const googleAccount = googleAccounts[0];
    const googleService = new GoogleBusinessService(
      googleAccount.access_token,
      googleAccount.account_name,
      googleAccount.location_name
    );

    // Fetch reviews from Google
    if (syncNew === 'true') {
      const reviewsResult = await googleService.listReviews(50);

      if (!reviewsResult.success) {
        return res.status(500).json({
          success: false,
          error: 'Failed to fetch reviews from Google Business',
          details: reviewsResult.error
        });
      }

      // Get user profile for brand info
      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      const brandInfo = {
        company: profile?.company || profile?.name,
        voice: 'professional, warm, and customer-focused',
        contactInfo: {
          email: profile?.email,
          phone: profile?.phone
        }
      };

      // Process each review with AI
      for (const review of reviewsResult.reviews) {
        // Check if review already exists
        const { data: existing } = await supabase
          .from('google_business_reviews')
          .select('id')
          .eq('review_name', review.name)
          .single();

        if (!existing) {
          // New review - analyze with AI
          const aiResult = await processReview({
            reviewText: review.comment || '',
            starRating: review.starRating || 5,
            reviewerName: review.reviewer?.displayName || 'Customer',
            businessName: googleAccount.business_name || profile?.company,
            brandInfo,
            openaiApiKey: process.env.OPENAI_API_KEY
          });

          // Store in database
          await supabase
            .from('google_business_reviews')
            .insert({
              user_id: userId,
              client_id: googleAccount.client_id || null,  // Link review to client
              location_name: googleAccount.location_name,
              review_name: review.name,
              reviewer_name: review.reviewer?.displayName || null,
              reviewer_profile_photo_url: review.reviewer?.profilePhotoUrl || null,
              star_rating: review.starRating || null,
              comment: review.comment || null,
              create_time: review.createTime || null,
              update_time: review.updateTime || null,
              sentiment: aiResult.analysis?.sentiment || 'neutral',
              review_type: aiResult.analysis?.reviewType || 'general',
              priority: aiResult.analysis?.priority || 'medium',
              ai_suggested_reply: aiResult.response?.suggested || null,
              has_replied: !!review.reviewReply,
              reply_comment: review.reviewReply?.comment || null,
              reply_created_time: review.reviewReply?.updateTime || null
            });
        }
      }
    }

    // Fetch stored reviews from database
    let reviewsQuery = supabase
      .from('google_business_reviews')
      .select('*')
      .eq('user_id', userId);

    // Filter by account location if specified
    if (accountId && googleAccount) {
      reviewsQuery = reviewsQuery.eq('location_name', googleAccount.location_name);
    }

    // Filter by client if specified
    if (client_id) {
      reviewsQuery = reviewsQuery.eq('client_id', parseInt(client_id));
    }

    const { data: reviews, error } = await reviewsQuery
      .order('create_time', { ascending: false })
      .limit(100);

    if (error) throw error;

    res.json({
      success: true,
      count: reviews?.length || 0,
      reviews: reviews || [],
      accounts: googleAccounts.map(acc => ({
        id: acc.id,
        business_name: acc.business_name,
        location_name: acc.location_name,
        account_display_name: acc.account_display_name
      })),
      currentAccount: accountId ? googleAccount : googleAccounts[0]
    });

  } catch (error) {
    console.error('Review fetch error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch reviews',
      details: error.message
    });
  }
});

/**
 * POST /api/reviews/analyze - Analyze a review and generate AI reply
 */
router.post('/analyze', authenticateSupabase, async (req, res) => {
  try {
    const { reviewText, starRating, reviewerName } = req.body;
    const userId = req.userId;

    if (!reviewText || !starRating) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: reviewText, starRating'
      });
    }

    // Get user profile for personalized responses
    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    const brandInfo = {
      company: profile?.company || profile?.name,
      voice: 'professional, warm, and customer-focused',
      contactInfo: {
        email: profile?.email,
        phone: profile?.phone
      }
    };

    const aiResult = await processReview({
      reviewText,
      starRating: parseInt(starRating),
      reviewerName: reviewerName || 'Customer',
      businessName: profile?.company,
      brandInfo,
      openaiApiKey: process.env.OPENAI_API_KEY
    });

    res.json({
      success: true,
      ...aiResult
    });

  } catch (error) {
    console.error('Review analysis error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to analyze review',
      details: error.message
    });
  }
});

/**
 * POST /api/reviews/reply - Post a reply to a review
 */
router.post('/reply', authenticateSupabase, async (req, res) => {
  try {
    const { reviewId, replyText, isAutoReply = false } = req.body;
    const userId = req.userId;

    if (!reviewId || !replyText) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: reviewId, replyText'
      });
    }

    // Get review from database
    const { data: review, error: reviewError } = await supabase
      .from('google_business_reviews')
      .select('*')
      .eq('id', reviewId)
      .eq('user_id', userId)
      .single();

    if (reviewError || !review) {
      return res.status(404).json({
        success: false,
        error: 'Review not found'
      });
    }

    // Get user's Google Business credentials
    const { data: googleAccounts } = await supabase
      .from('google_business_accounts')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true)
      .limit(1);

    if (!googleAccounts || googleAccounts.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Google Business account not connected'
      });
    }

    const googleAccount = googleAccounts[0];
    const googleService = new GoogleBusinessService(
      googleAccount.access_token,
      googleAccount.account_name,
      googleAccount.location_name
    );

    // Post reply to Google
    const result = await googleService.replyToReview(review.review_name, replyText);

    if (result.success) {
      // Update database
      await supabase
        .from('google_business_reviews')
        .update({
          has_replied: true,
          reply_comment: replyText,
          reply_created_time: new Date().toISOString(),
          is_auto_reply: isAutoReply
        })
        .eq('id', reviewId);

      res.json({
        success: true,
        message: 'Reply posted successfully'
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error
      });
    }

  } catch (error) {
    console.error('Reply posting error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to post reply',
      details: error.message
    });
  }
});

/**
 * PUT /api/reviews/:id - Update a review's AI suggestions
 */
router.put('/:id', authenticateSupabase, async (req, res) => {
  try {
    const { id } = req.params;
    const { ai_suggested_reply } = req.body;
    const userId = req.userId;

    const { error } = await supabase
      .from('google_business_reviews')
      .update({ ai_suggested_reply })
      .eq('id', id)
      .eq('user_id', userId);

    if (error) throw error;

    res.json({
      success: true,
      message: 'Review updated successfully'
    });

  } catch (error) {
    console.error('Review update error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update review',
      details: error.message
    });
  }
});

/**
 * GET /api/reviews/stats - Get review statistics
 */
router.get('/stats', authenticateSupabase, async (req, res) => {
  try {
    const userId = req.userId;

    // Get all reviews
    const { data: reviews, error } = await supabase
      .from('google_business_reviews')
      .select('*')
      .eq('user_id', userId);

    if (error) throw error;

    const stats = {
      totalReviews: reviews?.length || 0,
      averageRating: 0,
      responseRate: 0,
      byRating: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      bySentiment: { positive: 0, negative: 0, neutral: 0 },
      byPriority: { high: 0, medium: 0, low: 0 },
      needsReply: 0,
      recentReviews: []
    };

    if (reviews && reviews.length > 0) {
      let totalRating = 0;
      let repliedCount = 0;

      reviews.forEach(review => {
        // Rating distribution
        if (review.star_rating) {
          stats.byRating[review.star_rating]++;
          totalRating += review.star_rating;
        }

        // Sentiment distribution
        if (review.sentiment) {
          stats.bySentiment[review.sentiment]++;
        }

        // Priority distribution
        if (review.priority) {
          stats.byPriority[review.priority]++;
        }

        // Response tracking
        if (review.has_replied) {
          repliedCount++;
        } else {
          stats.needsReply++;
        }
      });

      stats.averageRating = (totalRating / reviews.length).toFixed(1);
      stats.responseRate = ((repliedCount / reviews.length) * 100).toFixed(0);
      stats.recentReviews = reviews.slice(0, 10);
    }

    res.json({
      success: true,
      stats
    });

  } catch (error) {
    console.error('Stats fetch error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch statistics',
      details: error.message
    });
  }
});

/**
 * POST /api/reviews/auto-reply/toggle - Enable/disable auto-reply for reviews
 */
router.post('/auto-reply/toggle', authenticateSupabase, async (req, res) => {
  try {
    const { enabled } = req.body;
    const userId = req.userId;

    await supabase
      .from('profiles')
      .update({ review_auto_reply_enabled: enabled })
      .eq('id', userId);

    res.json({
      success: true,
      autoReplyEnabled: enabled
    });

  } catch (error) {
    console.error('Toggle error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to toggle auto-reply',
      details: error.message
    });
  }
});

module.exports = router;

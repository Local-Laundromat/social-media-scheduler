const cron = require('node-cron');
const { supabase, getPostById, updatePost } = require('../database/supabase');
const FacebookService = require('./facebook');
const InstagramService = require('./instagram');
const {
  applyFacebookAccountFilter,
  applyInstagramAccountFilter,
} = require('./socialAccountQuery');
const fs = require('fs');
const path = require('path');

class Scheduler {
  constructor() {
    this.jobs = new Map();
    this.isRunning = false;
  }

  /**
   * Start the main scheduler (runs every hour by default)
   */
  start(cronExpression = '0 * * * *') {
    if (this.isRunning) {
      console.log('Scheduler is already running');
      return;
    }

    console.log(`Starting scheduler with cron: ${cronExpression}`);

    const job = cron.schedule(cronExpression, async () => {
      await this.processPendingPosts();
    });

    this.jobs.set('main', job);
    this.isRunning = true;
    console.log('Scheduler started successfully');
  }

  /**
   * Stop the scheduler
   */
  stop() {
    this.jobs.forEach((job) => job.stop());
    this.jobs.clear();
    this.isRunning = false;
    console.log('Scheduler stopped');
  }

  /**
   * Process all pending posts that are due
   */
  async processPendingPosts() {
    try {
      const now = new Date().toISOString();

      const { data: posts, error } = await supabase
        .from('posts')
        .select('*')
        .in('status', ['pending', 'scheduled'])
        .or(`scheduled_time.is.null,scheduled_time.lte.${now}`)
        .order('scheduled_time', { ascending: true })
        .order('id', { ascending: true })
        .limit(1);

      if (error) throw error;

      if (!posts || posts.length === 0) {
        console.log('No pending posts to process');
        return { processed: 0 };
      }

      console.log(`Processing ${posts.length} post(s)...`);
      let processed = 0;

      for (const post of posts) {
        try {
          await this.processPost(post);
          processed++;
        } catch (error) {
          console.error(`Error processing post ${post.id}:`, error);
        }
      }

      return { processed };
    } catch (error) {
      console.error('Error fetching pending posts:', error);
      throw error;
    }
  }

  /**
   * Get credentials for posting (user-specific or account-based)
   */
  async getCredentials(post) {
    try {
      // If post has a user_id, use user's credentials from social accounts
      if (post.user_id) {
        // Get user profile
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', post.user_id)
          .single();

        if (profileError || !profile) {
          throw new Error('User profile not found');
        }

        // Get Facebook credentials (specific page from post, or team-shared, or user-owned)
        let facebookToken = null;
        let facebookPageId = null;
        let fbQuery = supabase
          .from('facebook_accounts')
          .select('*')
          .eq('is_active', true);

        fbQuery = applyFacebookAccountFilter(fbQuery, post, profile);

        const { data: fbAccounts } = await fbQuery.limit(1);

        if (fbAccounts && fbAccounts.length > 0) {
          facebookToken = fbAccounts[0].access_token;
          facebookPageId = fbAccounts[0].page_id;
        }

        // Get Instagram credentials
        let instagramToken = null;
        let instagramAccountId = null;
        let igQuery = supabase
          .from('instagram_accounts')
          .select('*')
          .eq('is_active', true);

        igQuery = applyInstagramAccountFilter(igQuery, post, profile);

        const { data: igAccounts } = await igQuery.limit(1);

        if (igAccounts && igAccounts.length > 0) {
          instagramToken = igAccounts[0].access_token;
          instagramAccountId = igAccounts[0].account_id;
        }

        return {
          facebookToken,
          facebookPageId,
          instagramToken,
          instagramAccountId,
          source: 'user',
          userName: profile.name,
        };
      }
      // Otherwise, check if post has account_id
      else if (post.account_id) {
        const { data: account, error } = await supabase
          .from('accounts')
          .select('*')
          .eq('id', post.account_id)
          .single();

        if (error || !account) {
          throw new Error('Account not found');
        }

        return {
          facebookToken: account.facebook_page_token,
          facebookPageId: account.facebook_page_id,
          instagramToken: account.instagram_token,
          instagramAccountId: account.instagram_account_id,
          source: 'account',
          accountName: account.name,
        };
      }
      // Fallback to environment variables
      else {
        return {
          facebookToken: process.env.FACEBOOK_PAGE_ACCESS_TOKEN,
          facebookPageId: process.env.FACEBOOK_PAGE_ID,
          instagramToken: process.env.INSTAGRAM_ACCESS_TOKEN,
          instagramAccountId: process.env.INSTAGRAM_ACCOUNT_ID,
          source: 'env',
        };
      }
    } catch (error) {
      throw error;
    }
  }

  /**
   * Process a single post
   */
  async processPost(post) {
    console.log(`Processing post #${post.id}: ${post.filename}`);

    // Update status to posting
    await this.updatePostStatus(post.id, 'posting');

    // Get credentials (user-specific, account-based, or env)
    let credentials;
    try {
      credentials = await this.getCredentials(post);
      console.log(`Using credentials from: ${credentials.source}`);
    } catch (error) {
      console.error(`Failed to get credentials for post ${post.id}:`, error.message);
      await this.updatePostStatus(post.id, 'failed', error.message);
      return { error: error.message };
    }

    // Handle platforms - could be array or JSON string
    const platforms = Array.isArray(post.platforms) ? post.platforms : JSON.parse(post.platforms);
    const results = {
      facebook: null,
      instagram: null,
    };

    // Post to Facebook
    if (platforms.includes('facebook')) {
      if (!credentials.facebookToken || !credentials.facebookPageId) {
        results.facebook = {
          success: false,
          error: 'Facebook credentials not configured. Please connect your Facebook account.',
        };
      } else {
        const fbService = new FacebookService(
          credentials.facebookToken,
          credentials.facebookPageId
        );

        results.facebook = await fbService.post(post.filepath, post.caption || '');

        if (results.facebook.success) {
          await updatePost(post.id, { facebook_post_id: results.facebook.postId });
        }
      }
    }

    // Post to Instagram (requires public URL)
    if (platforms.includes('instagram')) {
      if (!credentials.instagramToken || !credentials.instagramAccountId) {
        results.instagram = {
          success: false,
          error: 'Instagram credentials not configured. Please connect your Instagram account.',
        };
      } else {
        const igService = new InstagramService(
          credentials.instagramToken,
          credentials.instagramAccountId
        );

        // Note: Instagram requires publicly accessible URLs
        // You'll need to implement a file hosting solution or use ngrok for local testing
        const publicUrl = process.env.PUBLIC_FILE_URL + '/' + post.filename;
        const isVideo = post.filetype === 'video';

        results.instagram = await igService.post(publicUrl, post.caption || '', isVideo);

        if (results.instagram.success) {
          await updatePost(post.id, { instagram_post_id: results.instagram.postId });
        }
      }
    }

    // Determine final status
    const allFailed =
      (platforms.includes('facebook') && !results.facebook?.success) &&
      (platforms.includes('instagram') && !results.instagram?.success);

    const someFailed =
      (platforms.includes('facebook') && !results.facebook?.success) ||
      (platforms.includes('instagram') && !results.instagram?.success);

    let finalStatus = 'posted';
    let errorMessage = null;

    if (allFailed) {
      finalStatus = 'failed';
      errorMessage = JSON.stringify({
        facebook: results.facebook?.error,
        instagram: results.instagram?.error,
      });
    } else if (someFailed) {
      finalStatus = 'partial';
      errorMessage = JSON.stringify({
        facebook: results.facebook?.error,
        instagram: results.instagram?.error,
      });
    }

    // Update final status
    await this.updatePostStatus(post.id, finalStatus, errorMessage);

    console.log(`Post #${post.id} processed with status: ${finalStatus}`);

    return results;
  }

  /**
   * Update post status
   */
  async updatePostStatus(postId, status, errorMessage = null) {
    try {
      const updateData = {
        status,
        posted_time: new Date().toISOString()
      };

      if (errorMessage) {
        updateData.error_message = errorMessage;
      }

      await updatePost(postId, updateData);
    } catch (error) {
      throw error;
    }
  }

  /**
   * Manually trigger a specific post
   */
  async postNow(postId) {
    try {
      const post = await getPostById(postId);

      if (!post) {
        throw new Error('Post not found');
      }

      const result = await this.processPost(post);
      return result;
    } catch (error) {
      throw error;
    }
  }
}

const scheduler = new Scheduler();
module.exports = scheduler;
/** Class export for unit tests (credential resolution, etc.). */
module.exports.Scheduler = Scheduler;

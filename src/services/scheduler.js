const cron = require('node-cron');
const { get, getAll, insert, update: updateRow, deleteRows, customQuery, customGet, run, isSupabase } = require('../database/helpers');
const FacebookService = require('./facebook');
const InstagramService = require('./instagram');
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

      const posts = await customQuery(
        `SELECT * FROM posts
         WHERE status = 'pending'
         AND (scheduled_time IS NULL OR scheduled_time <= ?)
         ORDER BY scheduled_time ASC, id ASC
         LIMIT 1`,
        [now],
        async () => {
          const { db } = require('../database/helpers');
          let query = db
            .from('posts')
            .select('*')
            .eq('status', 'pending')
            .or(`scheduled_time.is.null,scheduled_time.lte.${now}`)
            .order('scheduled_time', { ascending: true })
            .order('id', { ascending: true })
            .limit(1);

          const { data, error } = await query;
          if (error) throw error;
          return data || [];
        }
      );

      if (posts.length === 0) {
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
      // If post has a user_id, use user's credentials
      if (post.user_id) {
        const user = await get('users', { id: post.user_id });

        if (!user) {
          throw new Error('User not found');
        }

        return {
          facebookToken: user.facebook_page_token,
          facebookPageId: user.facebook_page_id,
          instagramToken: user.instagram_token,
          instagramAccountId: user.instagram_account_id,
          source: 'user',
          userName: user.name,
        };
      }
      // Otherwise, check if post has account_id
      else if (post.account_id) {
        const account = await get('accounts', { id: post.account_id });

        if (!account) {
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

    const platforms = JSON.parse(post.platforms);
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
          await this.updatePostField(post.id, 'facebook_post_id', results.facebook.postId);
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
          await this.updatePostField(post.id, 'instagram_post_id', results.instagram.postId);
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

      await updateRow('posts', { id: postId }, updateData);
    } catch (error) {
      throw error;
    }
  }

  /**
   * Update specific post field
   */
  async updatePostField(postId, field, value) {
    try {
      const updateData = {};
      updateData[field] = value;
      await updateRow('posts', { id: postId }, updateData);
    } catch (error) {
      throw error;
    }
  }

  /**
   * Manually trigger a specific post
   */
  async postNow(postId) {
    try {
      const post = await get('posts', { id: postId });

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

module.exports = new Scheduler();

const cron = require('node-cron');
const db = require('../database/db');
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
    return new Promise((resolve, reject) => {
      const now = new Date().toISOString();

      db.all(
        `SELECT * FROM posts
         WHERE status = 'pending'
         AND (scheduled_time IS NULL OR scheduled_time <= ?)
         ORDER BY scheduled_time ASC, id ASC
         LIMIT 1`,
        [now],
        async (err, posts) => {
          if (err) {
            console.error('Error fetching pending posts:', err);
            reject(err);
            return;
          }

          if (posts.length === 0) {
            console.log('No pending posts to process');
            resolve({ processed: 0 });
            return;
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

          resolve({ processed });
        }
      );
    });
  }

  /**
   * Get credentials for posting (user-specific or account-based)
   */
  async getCredentials(post) {
    return new Promise((resolve, reject) => {
      // If post has a user_id, use user's credentials
      if (post.user_id) {
        db.get('SELECT * FROM users WHERE id = ?', [post.user_id], (err, user) => {
          if (err) {
            reject(err);
            return;
          }

          if (!user) {
            reject(new Error('User not found'));
            return;
          }

          resolve({
            facebookToken: user.facebook_page_token,
            facebookPageId: user.facebook_page_id,
            instagramToken: user.instagram_token,
            instagramAccountId: user.instagram_account_id,
            source: 'user',
            userName: user.name,
          });
        });
      }
      // Otherwise, check if post has account_id
      else if (post.account_id) {
        db.get('SELECT * FROM accounts WHERE id = ?', [post.account_id], (err, account) => {
          if (err) {
            reject(err);
            return;
          }

          if (!account) {
            reject(new Error('Account not found'));
            return;
          }

          resolve({
            facebookToken: account.facebook_page_token,
            facebookPageId: account.facebook_page_id,
            instagramToken: account.instagram_token,
            instagramAccountId: account.instagram_account_id,
            source: 'account',
            accountName: account.name,
          });
        });
      }
      // Fallback to environment variables
      else {
        resolve({
          facebookToken: process.env.FACEBOOK_PAGE_ACCESS_TOKEN,
          facebookPageId: process.env.FACEBOOK_PAGE_ID,
          instagramToken: process.env.INSTAGRAM_ACCESS_TOKEN,
          instagramAccountId: process.env.INSTAGRAM_ACCOUNT_ID,
          source: 'env',
        });
      }
    });
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
  updatePostStatus(postId, status, errorMessage = null) {
    return new Promise((resolve, reject) => {
      const params = [status, new Date().toISOString(), postId];
      let query = 'UPDATE posts SET status = ?, posted_time = ? WHERE id = ?';

      if (errorMessage) {
        query = 'UPDATE posts SET status = ?, posted_time = ?, error_message = ? WHERE id = ?';
        params.splice(2, 0, errorMessage);
      }

      db.run(query, params, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  /**
   * Update specific post field
   */
  updatePostField(postId, field, value) {
    return new Promise((resolve, reject) => {
      db.run(
        `UPDATE posts SET ${field} = ? WHERE id = ?`,
        [value, postId],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }

  /**
   * Manually trigger a specific post
   */
  async postNow(postId) {
    return new Promise((resolve, reject) => {
      db.get('SELECT * FROM posts WHERE id = ?', [postId], async (err, post) => {
        if (err) {
          reject(err);
          return;
        }

        if (!post) {
          reject(new Error('Post not found'));
          return;
        }

        try {
          const result = await this.processPost(post);
          resolve(result);
        } catch (error) {
          reject(error);
        }
      });
    });
  }
}

module.exports = new Scheduler();

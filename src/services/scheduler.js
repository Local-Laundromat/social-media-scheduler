const cron = require('node-cron');
const { supabase, getPostById, updatePost } = require('../database/supabase');
const FacebookService = require('./facebook');
const InstagramService = require('./instagram');
const {
  applyFacebookAccountFilter,
  applyInstagramAccountFilter,
} = require('./socialAccountQuery');
const { logPostPipeline, stringifyPostingFailure } = require('../utils/postingErrors');

// Instagram requires a public HTTPS URL; uploads may already be on Supabase (filepath).
function resolveInstagramMediaUrl(post) {
  const fp = (post.filepath || '').trim();
  if (/^https?:\/\//i.test(fp)) {
    return fp;
  }
  const base = process.env.PUBLIC_FILE_URL;
  if (!base) {
    return null;
  }
  return `${base.replace(/\/$/, '')}/${post.filename}`;
}

/**
 * Normalize platforms from DB: JS array, JSON string, or Postgres text[] literal "{a,b}".
 */
function parsePlatformsField(post) {
  const raw = post.platforms;
  if (Array.isArray(raw)) {
    return raw.map((p) => String(p).trim().toLowerCase()).filter(Boolean);
  }
  if (typeof raw === 'string') {
    const s = raw.trim();
    try {
      const parsed = JSON.parse(s);
      if (Array.isArray(parsed)) {
        return parsed.map((p) => String(p).trim().toLowerCase()).filter(Boolean);
      }
    } catch (_) {
      /* fall through */
    }
    if (s.startsWith('{') && s.endsWith('}')) {
      return s
        .slice(1, -1)
        .split(',')
        .map((p) => p.replace(/^"|"$/g, '').trim().toLowerCase())
        .filter(Boolean);
    }
  }
  return [];
}

/**
 * Load posts that might be due (pending/scheduled). Uses two queries so we never miss
 * rows with NULL scheduled_time (excluded by .lte) and avoid fragile OR filters.
 */
async function fetchDuePostCandidates() {
  const nowIso = new Date().toISOString();

  const { data: withTime, error: err1 } = await supabase
    .from('posts')
    .select('*')
    .in('status', ['pending', 'scheduled'])
    .lte('scheduled_time', nowIso)
    .order('scheduled_time', { ascending: true })
    .order('id', { ascending: true })
    .limit(500);

  if (err1) throw err1;

  const { data: noTime, error: err2 } = await supabase
    .from('posts')
    .select('*')
    .in('status', ['pending', 'scheduled'])
    .is('scheduled_time', null)
    .order('id', { ascending: true })
    .limit(500);

  if (err2) throw err2;

  const seen = new Set();
  const merged = [];
  for (const p of [...(withTime || []), ...(noTime || [])]) {
    if (!seen.has(p.id)) {
      seen.add(p.id);
      merged.push(p);
    }
  }
  merged.sort((a, b) => {
    const ta = a.scheduled_time ? new Date(a.scheduled_time).getTime() : 0;
    const tb = b.scheduled_time ? new Date(b.scheduled_time).getTime() : 0;
    if (ta !== tb) return ta - tb;
    return (a.id || 0) - (b.id || 0);
  });
  return merged;
}
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
      const nowMs = Date.now();

      const candidates = await fetchDuePostCandidates();

      const due = (candidates || []).filter((p) => {
        if (!p.scheduled_time) return true;
        return new Date(p.scheduled_time).getTime() <= nowMs;
      });

      if (due.length === 0) {
        console.log('No pending posts to process');
        return { processed: 0 };
      }

      const maxPerRun = Math.min(due.length, parseInt(process.env.SCHEDULER_MAX_POSTS_PER_RUN || '10', 10));
      console.log(`Processing ${maxPerRun} due post(s) (${due.length} total due in queue)...`);
      let processed = 0;

      for (let i = 0; i < maxPerRun; i++) {
        try {
          await this.processPost(due[i]);
          processed++;
        } catch (error) {
          console.error(`Error processing post ${due[i].id}:`, error);
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
    const platformsEarly = parsePlatformsField(post);
    logPostPipeline(post.id, 'pipeline.start', {
      filename: post.filename,
      filepathPreview: (post.filepath || '').slice(0, 96),
      platforms: platformsEarly,
      filetype: post.filetype || null,
    });

    // SAFETY CHECK: Skip posts that already have platform post IDs (prevent duplicates)
    if (post.facebook_post_id || post.instagram_post_id || post.tiktok_post_id) {
      console.warn(`Post ${post.id} already has platform post IDs - skipping to prevent duplicates`);
      // Mark as posted if not already
      if (post.status !== 'posted') {
        await this.updatePostStatus(post.id, 'posted', null);
      }
      return { skipped: true, reason: 'already_posted' };
    }

    // Do not use an intermediate "posting" status — many DB schemas only allow
    // pending | scheduled | posted | failed | partial, and a rejected update
    // would leave posts stuck on "scheduled" forever.

    // Get credentials (user-specific, account-based, or env)
    let credentials;
    try {
      credentials = await this.getCredentials(post);
      logPostPipeline(post.id, 'credentials.ok', {
        source: credentials.source,
        hasFacebook: !!(credentials.facebookToken && credentials.facebookPageId),
        hasInstagram: !!(credentials.instagramToken && credentials.instagramAccountId),
      });
    } catch (error) {
      console.error(`Failed to get credentials for post ${post.id}:`, error.message);
      const credErr = stringifyPostingFailure({
        at: new Date().toISOString(),
        postId: post.id,
        stage: 'scheduler_credentials',
        error: error.message,
      });
      await this.updatePostStatus(post.id, 'failed', credErr);
      return { error: error.message, stage: 'scheduler_credentials' };
    }

    const platforms = parsePlatformsField(post);

    if (!platforms || platforms.length === 0) {
      const msg = stringifyPostingFailure({
        at: new Date().toISOString(),
        postId: post.id,
        stage: 'scheduler_platforms',
        error: 'No platforms selected for this post',
      });
      await this.updatePostStatus(post.id, 'failed', msg);
      return { error: 'No platforms selected for this post', stage: 'scheduler_platforms' };
    }

    try {
    const results = {
      facebook: null,
      instagram: null,
    };

    // Post to Facebook (with retry logic)
    if (platforms.includes('facebook')) {
      if (!credentials.facebookToken || !credentials.facebookPageId) {
        results.facebook = {
          success: false,
          error: 'Facebook credentials not configured. Please connect your Facebook account.',
          stage: 'scheduler_missing_facebook_credentials',
        };
        logPostPipeline(post.id, 'facebook.skip', { reason: 'no_token_or_page_id' });
      } else {
        const fbService = new FacebookService(
          credentials.facebookToken,
          credentials.facebookPageId
        );

        // Retry logic: 3 attempts with exponential backoff (1s, 2s, 4s)
        const maxRetries = 3;
        let lastError = null;

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
          results.facebook = await fbService.post(post.filepath, post.caption || '', {
            filetype: post.filetype,
            filename: post.filename,
          });

          if (results.facebook.success) {
            if (attempt > 1) {
              logPostPipeline(post.id, 'facebook.ok', { postId: results.facebook.postId, retriedAttempts: attempt - 1 });
            } else {
              logPostPipeline(post.id, 'facebook.ok', { postId: results.facebook.postId });
            }
            await updatePost(post.id, { facebook_post_id: results.facebook.postId });
            break; // Success, exit retry loop
          } else {
            lastError = results.facebook;
            if (attempt < maxRetries) {
              const delayMs = Math.pow(2, attempt - 1) * 1000; // 1s, 2s, 4s
              logPostPipeline(post.id, 'facebook.retry', {
                attempt,
                delayMs,
                error: results.facebook.error
              });
              await new Promise(resolve => setTimeout(resolve, delayMs));
            }
          }
        }

        // If all retries failed, log the final failure
        if (!results.facebook.success) {
          logPostPipeline(post.id, 'facebook.fail', {
            stage: results.facebook.stage,
            error: results.facebook.error,
            graphCode: results.facebook.graph?.code,
            retriedAttempts: maxRetries - 1
          });
        }
      }
    }

    // Post to Instagram (requires public URL) (with retry logic)
    if (platforms.includes('instagram')) {
      if (!credentials.instagramToken || !credentials.instagramAccountId) {
        results.instagram = {
          success: false,
          error: 'Instagram credentials not configured. Please connect your Instagram account.',
          stage: 'scheduler_missing_instagram_credentials',
        };
        logPostPipeline(post.id, 'instagram.skip', { reason: 'no_token_or_account_id' });
      } else {
        const igService = new InstagramService(
          credentials.instagramToken,
          credentials.instagramAccountId
        );

        const publicUrl = resolveInstagramMediaUrl(post);

        // Determine media type: 'reel', 'video', or 'image'
        let mediaType = 'image';
        if (post.post_type === 'reel') {
          mediaType = 'reel';
        } else if (post.filetype === 'video') {
          mediaType = 'video';
        }

        if (!publicUrl) {
          results.instagram = {
            success: false,
            error:
              'Instagram needs a public image URL. Use Supabase uploads or set PUBLIC_FILE_URL to your app base (e.g. https://yourapp.com/uploads).',
            stage: 'scheduler_instagram_public_url',
          };
          logPostPipeline(post.id, 'instagram.fail', { stage: 'scheduler_instagram_public_url' });
        } else {
          // Retry logic: 3 attempts with exponential backoff (1s, 2s, 4s)
          const maxRetries = 3;
          let lastError = null;

          for (let attempt = 1; attempt <= maxRetries; attempt++) {
            results.instagram = await igService.post(publicUrl, post.caption || '', mediaType);

            if (results.instagram.success) {
              if (attempt > 1) {
                logPostPipeline(post.id, 'instagram.ok', { postId: results.instagram.postId, retriedAttempts: attempt - 1 });
              } else {
                logPostPipeline(post.id, 'instagram.ok', { postId: results.instagram.postId });
              }
              await updatePost(post.id, { instagram_post_id: results.instagram.postId });
              break; // Success, exit retry loop
            } else {
              lastError = results.instagram;
              if (attempt < maxRetries) {
                const delayMs = Math.pow(2, attempt - 1) * 1000; // 1s, 2s, 4s
                logPostPipeline(post.id, 'instagram.retry', {
                  attempt,
                  delayMs,
                  error: results.instagram.error
                });
                await new Promise(resolve => setTimeout(resolve, delayMs));
              }
            }
          }

          // If all retries failed, log the final failure
          if (results.instagram && !results.instagram.success) {
            logPostPipeline(post.id, 'instagram.fail', {
              stage: results.instagram.stage,
              error: results.instagram.error,
              graphCode: results.instagram.graph?.code,
              retriedAttempts: maxRetries - 1
            });
          }
        }
      }
    }

    // Final status: all attempted platforms failed → failed; mix → partial; all ok → posted
    let finalStatus = 'posted';
    let errorMessage = null;

    const attempted = [];
    if (platforms.includes('facebook')) attempted.push('facebook');
    if (platforms.includes('instagram')) attempted.push('instagram');

    let ok = 0;
    let bad = 0;
    if (platforms.includes('facebook')) {
      if (results.facebook?.success) ok++;
      else bad++;
    }
    if (platforms.includes('instagram')) {
      if (results.instagram?.success) ok++;
      else bad++;
    }

    function summarizePlatform(label, raw) {
      if (raw == null) return null;
      return {
        success: !!raw.success,
        error: raw.error || null,
        stage: raw.stage || null,
        graph: raw.graph || null,
        postId: raw.postId || null,
      };
    }

    if (attempted.length > 0 && bad === attempted.length) {
      finalStatus = 'failed';
      errorMessage = stringifyPostingFailure({
        at: new Date().toISOString(),
        postId: post.id,
        outcome: 'failed',
        summary: 'Every selected platform failed',
        platforms: {
          facebook: platforms.includes('facebook')
            ? summarizePlatform('facebook', results.facebook)
            : undefined,
          instagram: platforms.includes('instagram')
            ? summarizePlatform('instagram', results.instagram)
            : undefined,
        },
      });
    } else if (ok > 0 && bad > 0) {
      finalStatus = 'partial';
      errorMessage = stringifyPostingFailure({
        at: new Date().toISOString(),
        postId: post.id,
        outcome: 'partial',
        summary: 'Some platforms failed',
        platforms: {
          facebook: platforms.includes('facebook')
            ? summarizePlatform('facebook', results.facebook)
            : undefined,
          instagram: platforms.includes('instagram')
            ? summarizePlatform('instagram', results.instagram)
            : undefined,
        },
      });
    }

    // Update final status
    try {
      await this.updatePostStatus(post.id, finalStatus, errorMessage);
    } catch (e) {
      console.error(`Failed to save final status for post ${post.id}:`, e);
      throw e;
    }

    console.log(`Post #${post.id} processed with status: ${finalStatus}`);

    return results;
    } catch (error) {
      console.error(`processPost unexpected error for post ${post.id}:`, error);
      try {
        await this.updatePostStatus(
          post.id,
          'failed',
          stringifyPostingFailure({
            at: new Date().toISOString(),
            postId: post.id,
            stage: 'scheduler_unhandled_exception',
            error: error.message || String(error),
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
          })
        );
      } catch (_) {
        /* ignore */
      }
      return { error: error.message, stage: 'scheduler_unhandled_exception' };
    }
  }

  /**
   * Update post status
   */
  async updatePostStatus(postId, status, errorMessage = null) {
    try {
      const updateData = {
        status
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

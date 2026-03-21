const axios = require('axios');
const { get, getAll, insert, update: updateRow, deleteRows, customQuery, customGet, run, isSupabase } = require('../database/helpers');

class WebhookService {
  /**
   * Send webhook notification
   */
  async sendWebhook(webhookUrl, payload) {
    if (!webhookUrl) return { success: true };

    try {
      const response = await axios.post(webhookUrl, payload, {
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'SocialMediaScheduler/1.0',
        },
        timeout: 10000, // 10 second timeout
      });

      // Log webhook
      this.logWebhook(payload.post_id, webhookUrl, payload, response.status, response.data);

      return {
        success: true,
        status: response.status,
        data: response.data,
      };
    } catch (error) {
      console.error('Webhook error:', error.message);

      // Log failed webhook
      this.logWebhook(
        payload.post_id,
        webhookUrl,
        payload,
        error.response?.status || 0,
        error.message
      );

      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Log webhook attempt
   */
  async logWebhook(postId, webhookUrl, payload, statusCode, response) {
    try {
      await insert('webhook_logs', {
        post_id: postId,
        webhook_url: webhookUrl,
        payload: JSON.stringify(payload),
        status_code: statusCode,
        response: typeof response === 'string' ? response : JSON.stringify(response)
      });
    } catch (error) {
      console.error('Error logging webhook:', error);
    }
  }

  /**
   * Notify about post status change
   */
  async notifyPostStatus(post, status, results = {}) {
    if (!post.webhook_url) return;

    const payload = {
      event: 'post.status_changed',
      post_id: post.id,
      status: status,
      filename: post.filename,
      platforms: JSON.parse(post.platforms),
      results: {
        facebook: results.facebook || null,
        instagram: results.instagram || null,
      },
      timestamp: new Date().toISOString(),
    };

    await this.sendWebhook(post.webhook_url, payload);
  }

  /**
   * Notify about successful post
   */
  async notifyPostSuccess(post, results) {
    if (!post.webhook_url) return;

    const payload = {
      event: 'post.success',
      post_id: post.id,
      filename: post.filename,
      platforms: JSON.parse(post.platforms),
      facebook_post_id: results.facebook?.postId || null,
      instagram_post_id: results.instagram?.postId || null,
      posted_at: new Date().toISOString(),
    };

    await this.sendWebhook(post.webhook_url, payload);
  }

  /**
   * Notify about failed post
   */
  async notifyPostFailure(post, error) {
    if (!post.webhook_url) return;

    const payload = {
      event: 'post.failed',
      post_id: post.id,
      filename: post.filename,
      platforms: JSON.parse(post.platforms),
      error: error,
      failed_at: new Date().toISOString(),
    };

    await this.sendWebhook(post.webhook_url, payload);
  }
}

module.exports = new WebhookService();

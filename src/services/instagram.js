const axios = require('axios');
const path = require('path');
const { normalizeAxiosGraphError } = require('../utils/postingErrors');

class InstagramService {
  constructor(accessToken, instagramAccountId) {
    this.accessToken = accessToken;
    this.instagramAccountId = instagramAccountId;
    this.apiVersion = 'v21.0';
    this.baseUrl = `https://graph.facebook.com/${this.apiVersion}`;
  }

  /**
   * Create a media container (step 1 of posting)
   * @param {string} mediaUrl - Publicly accessible URL to the media
   * @param {string} caption - Caption for the post
   * @param {string} mediaType - Type of media: 'image', 'video', or 'reel'
   */
  async createMediaContainer(mediaUrl, caption = '', mediaType = 'image') {
    try {
      const params = {
        access_token: this.accessToken,
        caption: caption,
      };

      // Handle different media types
      if (mediaType === 'reel') {
        params.media_type = 'REELS';
        params.video_url = mediaUrl;
        // Reels require share_to_feed parameter (defaults to true)
        params.share_to_feed = true;
      } else if (mediaType === 'video') {
        params.media_type = 'VIDEO';
        params.video_url = mediaUrl;
      } else {
        // Image (default)
        params.image_url = mediaUrl;
      }

      const response = await axios.post(
        `${this.baseUrl}/${this.instagramAccountId}/media`,
        null,
        { params }
      );

      return {
        success: true,
        containerId: response.data.id,
      };
    } catch (error) {
      const g = normalizeAxiosGraphError(error);
      console.error('[instagram_graph_media_create]', g.message, g.fbtrace_id ? `trace=${g.fbtrace_id}` : '');
      return {
        success: false,
        error: g.message,
        stage: 'instagram_graph_media_create',
        graph: {
          code: g.code,
          error_subcode: g.error_subcode,
          type: g.type,
          fbtrace_id: g.fbtrace_id,
          httpStatus: g.httpStatus,
          isNetwork: g.isNetwork,
        },
      };
    }
  }

  /**
   * Check media container status (for videos)
   */
  async checkContainerStatus(containerId) {
    try {
      const response = await axios.get(
        `${this.baseUrl}/${containerId}`,
        {
          params: {
            fields: 'status_code',
            access_token: this.accessToken,
          },
        }
      );

      return {
        success: true,
        statusCode: response.data.status_code,
      };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.error?.message || error.message,
      };
    }
  }

  /**
   * Publish the media container (step 2 of posting)
   */
  async publishMedia(containerId) {
    try {
      const response = await axios.post(
        `${this.baseUrl}/${this.instagramAccountId}/media_publish`,
        null,
        {
          params: {
            creation_id: containerId,
            access_token: this.accessToken,
          },
        }
      );

      return {
        success: true,
        postId: response.data.id,
      };
    } catch (error) {
      const g = normalizeAxiosGraphError(error);
      console.error('[instagram_graph_media_publish]', g.message, g.fbtrace_id ? `trace=${g.fbtrace_id}` : '');
      return {
        success: false,
        error: g.message,
        stage: 'instagram_graph_media_publish',
        graph: {
          code: g.code,
          error_subcode: g.error_subcode,
          type: g.type,
          fbtrace_id: g.fbtrace_id,
          httpStatus: g.httpStatus,
          isNetwork: g.isNetwork,
        },
      };
    }
  }

  /**
   * Helper to wait for video processing
   */
  async waitForVideoProcessing(containerId, maxAttempts = 30) {
    for (let i = 0; i < maxAttempts; i++) {
      const status = await this.checkContainerStatus(containerId);

      if (!status.success) {
        return status;
      }

      if (status.statusCode === 'FINISHED') {
        return { success: true };
      } else if (status.statusCode === 'ERROR') {
        return {
          success: false,
          error: 'Video processing failed',
          stage: 'instagram_video_container_status',
        };
      }

      // Wait 2 seconds before checking again
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    return {
      success: false,
      error: 'Video processing timeout',
      stage: 'instagram_video_processing_timeout',
    };
  }

  /**
   * Post content to Instagram (requires publicly accessible URL)
   * @param {string} mediaUrl - Publicly accessible URL to the media
   * @param {string} caption - Caption for the post
   * @param {string|boolean} mediaType - Type of media: 'image', 'video', 'reel', or boolean for backward compatibility
   */
  async post(mediaUrl, caption = '', mediaType = 'image') {
    try {
      // Handle backward compatibility with boolean isVideo parameter
      let actualMediaType = mediaType;
      if (typeof mediaType === 'boolean') {
        actualMediaType = mediaType ? 'video' : 'image';
      }

      // Step 1: Create media container
      const container = await this.createMediaContainer(mediaUrl, caption, actualMediaType);

      if (!container.success) {
        return container;
      }

      // Step 2: Wait for video/reel processing if needed
      const needsProcessing = actualMediaType === 'video' || actualMediaType === 'reel';
      if (needsProcessing) {
        const processingResult = await this.waitForVideoProcessing(container.containerId);
        if (!processingResult.success) {
          return {
            ...processingResult,
            stage: processingResult.stage || `instagram_${actualMediaType}_processing`,
          };
        }
      }

      // Step 3: Publish the media
      const published = await this.publishMedia(container.containerId);

      return published;
    } catch (error) {
      const g = normalizeAxiosGraphError(error);
      console.error('[instagram_post_orchestration]', g.message);
      return {
        success: false,
        error: g.message,
        stage: 'instagram_post_orchestration',
        graph: {
          code: g.code,
          error_subcode: g.error_subcode,
          type: g.type,
          fbtrace_id: g.fbtrace_id,
          httpStatus: g.httpStatus,
          isNetwork: g.isNetwork,
        },
      };
    }
  }

  /**
   * Get media insights/analytics
   */
  async getMediaInsights(mediaId) {
    try {
      const response = await axios.get(
        `${this.baseUrl}/${mediaId}/insights`,
        {
          params: {
            metric: 'engagement,impressions,reach,saved',
            access_token: this.accessToken,
          },
        }
      );

      return {
        success: true,
        data: response.data,
      };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.error?.message || error.message,
      };
    }
  }
}

module.exports = InstagramService;

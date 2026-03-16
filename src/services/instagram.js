const axios = require('axios');
const path = require('path');

class InstagramService {
  constructor(accessToken, instagramAccountId) {
    this.accessToken = accessToken;
    this.instagramAccountId = instagramAccountId;
    this.apiVersion = 'v21.0';
    this.baseUrl = `https://graph.facebook.com/${this.apiVersion}`;
  }

  /**
   * Create a media container (step 1 of posting)
   */
  async createMediaContainer(mediaUrl, caption = '', isVideo = false) {
    try {
      const params = {
        access_token: this.accessToken,
        caption: caption,
      };

      if (isVideo) {
        params.media_type = 'VIDEO';
        params.video_url = mediaUrl;
      } else {
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
      console.error('Instagram container error:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data?.error?.message || error.message,
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
      console.error('Instagram publish error:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data?.error?.message || error.message,
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
        return { success: false, error: 'Video processing failed' };
      }

      // Wait 2 seconds before checking again
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    return { success: false, error: 'Video processing timeout' };
  }

  /**
   * Post content to Instagram (requires publicly accessible URL)
   */
  async post(mediaUrl, caption = '', isVideo = false) {
    try {
      // Step 1: Create media container
      const container = await this.createMediaContainer(mediaUrl, caption, isVideo);

      if (!container.success) {
        return container;
      }

      // Step 2: Wait for video processing if needed
      if (isVideo) {
        const processingResult = await this.waitForVideoProcessing(container.containerId);
        if (!processingResult.success) {
          return processingResult;
        }
      }

      // Step 3: Publish the media
      const published = await this.publishMedia(container.containerId);

      return published;
    } catch (error) {
      console.error('Instagram post error:', error.message);
      return {
        success: false,
        error: error.message,
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

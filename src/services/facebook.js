const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');

function isRemoteMediaUrl(filePath) {
  return typeof filePath === 'string' && /^https?:\/\//i.test(filePath.trim());
}

class FacebookService {
  constructor(pageAccessToken, pageId) {
    this.pageAccessToken = pageAccessToken;
    this.pageId = pageId;
    this.apiVersion = 'v21.0';
    this.baseUrl = `https://graph.facebook.com/${this.apiVersion}`;
  }

  /**
   * Post an image to Facebook Page
   */
  async postImage(imagePath, caption = '') {
    try {
      let response;

      if (isRemoteMediaUrl(imagePath)) {
        // Supabase Storage / CDN URLs — Graph API cannot read local fs paths for these
        response = await axios.post(`${this.baseUrl}/${this.pageId}/photos`, null, {
          params: {
            url: imagePath.trim(),
            message: caption,
            access_token: this.pageAccessToken,
          },
        });
      } else {
        const form = new FormData();
        form.append('source', fs.createReadStream(imagePath));
        form.append('message', caption);
        form.append('access_token', this.pageAccessToken);

        response = await axios.post(`${this.baseUrl}/${this.pageId}/photos`, form, {
          headers: form.getHeaders(),
        });
      }

      const postId = response.data.post_id || response.data.id;

      return {
        success: true,
        postId,
        data: response.data,
      };
    } catch (error) {
      console.error('Facebook post error:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data?.error?.message || error.message,
      };
    }
  }

  /**
   * Post a video to Facebook Page
   */
  async postVideo(videoPath, caption = '') {
    try {
      let response;

      if (isRemoteMediaUrl(videoPath)) {
        response = await axios.post(`${this.baseUrl}/${this.pageId}/videos`, null, {
          params: {
            file_url: videoPath.trim(),
            description: caption,
            access_token: this.pageAccessToken,
          },
          maxContentLength: Infinity,
          maxBodyLength: Infinity,
        });
      } else {
        const form = new FormData();
        form.append('source', fs.createReadStream(videoPath));
        form.append('description', caption);
        form.append('access_token', this.pageAccessToken);

        response = await axios.post(`${this.baseUrl}/${this.pageId}/videos`, form, {
          headers: form.getHeaders(),
          maxContentLength: Infinity,
          maxBodyLength: Infinity,
        });
      }

      return {
        success: true,
        postId: response.data.id,
        data: response.data,
      };
    } catch (error) {
      console.error('Facebook video post error:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data?.error?.message || error.message,
      };
    }
  }

  /**
   * Post content based on file type
   */
  async post(filePath, caption = '') {
    const ext = path.extname(filePath).toLowerCase();

    if (['.jpg', '.jpeg', '.png', '.gif'].includes(ext)) {
      return await this.postImage(filePath, caption);
    } else if (['.mp4', '.mov', '.avi'].includes(ext)) {
      return await this.postVideo(filePath, caption);
    } else {
      return {
        success: false,
        error: 'Unsupported file type',
      };
    }
  }

  /**
   * Get page insights/analytics
   */
  async getPageInsights(postId) {
    try {
      const response = await axios.get(
        `${this.baseUrl}/${postId}/insights`,
        {
          params: {
            metric: 'post_impressions,post_engaged_users',
            access_token: this.pageAccessToken,
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

module.exports = FacebookService;
/** Exposed for unit tests (URL vs local file branching). */
module.exports.isRemoteMediaUrl = isRemoteMediaUrl;

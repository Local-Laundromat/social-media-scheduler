const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');

class TikTokService {
  constructor(accessToken) {
    this.accessToken = accessToken;
    this.apiVersion = 'v2';
    this.baseUrl = `https://open.tiktokapis.com/${this.apiVersion}`;
  }

  /**
   * Post a video to TikTok
   * TikTok requires a multi-step process:
   * 1. Initialize upload
   * 2. Upload video chunks
   * 3. Publish post
   */
  async postVideo(videoPath, caption = '', privacyLevel = 'PUBLIC_TO_EVERYONE') {
    try {
      const stats = fs.statSync(videoPath);
      const videoSize = stats.size;

      // Step 1: Initialize video upload
      const initResponse = await axios.post(
        `${this.baseUrl}/post/publish/video/init/`,
        {
          post_info: {
            title: caption.substring(0, 150), // TikTok has title limit
            privacy_level: privacyLevel,
            disable_duet: false,
            disable_comment: false,
            disable_stitch: false,
            video_cover_timestamp_ms: 1000,
          },
          source_info: {
            source: 'FILE_UPLOAD',
            video_size: videoSize,
            chunk_size: videoSize, // Upload entire file at once
            total_chunk_count: 1,
          },
        },
        {
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      const { publish_id, upload_url } = initResponse.data.data;

      // Step 2: Upload video file
      const videoStream = fs.createReadStream(videoPath);
      await axios.put(upload_url, videoStream, {
        headers: {
          'Content-Type': 'video/mp4',
          'Content-Length': videoSize,
        },
      });

      return {
        success: true,
        publishId: publish_id,
        message: 'Video uploaded successfully. Publishing may take a few minutes.',
      };
    } catch (error) {
      console.error('TikTok post error:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data?.error?.message || error.message,
      };
    }
  }

  /**
   * Post an image to TikTok
   * Note: TikTok primarily focuses on video content
   * Images are posted as photo posts (carousel)
   */
  async postImage(imagePath, caption = '') {
    try {
      const stats = fs.statSync(imagePath);
      const imageSize = stats.size;

      // TikTok Photo Post API
      const initResponse = await axios.post(
        `${this.baseUrl}/post/publish/inbox/video/init/`,
        {
          post_info: {
            title: caption.substring(0, 150),
            privacy_level: 'PUBLIC_TO_EVERYONE',
            disable_comment: false,
          },
          source_info: {
            source: 'FILE_UPLOAD',
          },
        },
        {
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      return {
        success: false,
        error: 'TikTok primarily supports video content. Please convert image to video or use video format.',
      };
    } catch (error) {
      console.error('TikTok image post error:', error.response?.data || error.message);
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

    if (['.mp4', '.mov', '.avi'].includes(ext)) {
      return await this.postVideo(filePath, caption);
    } else if (['.jpg', '.jpeg', '.png', '.gif'].includes(ext)) {
      return {
        success: false,
        error: 'TikTok requires video content. Please convert your image to video format.',
        info: 'Tip: You can create a simple slideshow video from images.',
      };
    } else {
      return {
        success: false,
        error: 'Unsupported file type for TikTok',
      };
    }
  }

  /**
   * Get user info
   */
  async getUserInfo() {
    try {
      const response = await axios.get(`${this.baseUrl}/user/info/`, {
        params: {
          fields: 'open_id,union_id,avatar_url,display_name',
        },
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
        },
      });

      return {
        success: true,
        data: response.data.data.user,
      };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.error?.message || error.message,
      };
    }
  }

  /**
   * Check video status
   */
  async getVideoStatus(publishId) {
    try {
      const response = await axios.post(
        `${this.baseUrl}/post/publish/status/fetch/`,
        {
          publish_id: publishId,
        },
        {
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      return {
        success: true,
        status: response.data.data.status,
        data: response.data.data,
      };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.error?.message || error.message,
      };
    }
  }
}

module.exports = TikTokService;

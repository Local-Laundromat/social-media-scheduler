const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');

class YouTubeService {
  constructor(accessToken) {
    this.accessToken = accessToken;
    this.apiUrl = 'https://www.googleapis.com/youtube/v3';
    this.uploadUrl = 'https://www.googleapis.com/upload/youtube/v3/videos';
  }

  /**
   * Upload and publish a video to YouTube
   * @param {string} videoPath - Local path or URL to the video file
   * @param {string} title - Video title (required)
   * @param {string} description - Video description (optional)
   * @param {object} options - Additional options
   * @returns {object} - { success: boolean, videoId?: string, error?: string }
   */
  async post(videoPath, title, description = '', options = {}) {
    try {
      const {
        tags = [],
        categoryId = '22', // Default to "People & Blogs"
        privacyStatus = 'public', // public, unlisted, or private
        publishAt = null, // ISO 8601 timestamp for scheduled publishing
      } = options;

      // Build metadata
      const snippet = {
        title: title || 'Untitled Video',
        description: description || '',
        tags: Array.isArray(tags) ? tags : [],
        categoryId: categoryId,
      };

      const status = {
        privacyStatus: privacyStatus,
        selfDeclaredMadeForKids: false,
      };

      if (publishAt && privacyStatus === 'private') {
        status.publishAt = publishAt;
      }

      const metadata = {
        snippet,
        status,
      };

      // Check if videoPath is a local file or URL
      let videoBuffer;
      let contentLength;

      if (videoPath.startsWith('http://') || videoPath.startsWith('https://')) {
        // Download video from URL
        const response = await axios.get(videoPath, {
          responseType: 'arraybuffer',
          maxContentLength: 500 * 1024 * 1024, // 500MB limit
        });
        videoBuffer = Buffer.from(response.data);
        contentLength = videoBuffer.length;
      } else {
        // Read local file
        if (!fs.existsSync(videoPath)) {
          return {
            success: false,
            error: 'Video file not found',
            stage: 'youtube_file_not_found',
          };
        }
        videoBuffer = fs.readFileSync(videoPath);
        contentLength = videoBuffer.length;
      }

      // Upload video using resumable upload
      const uploadResponse = await axios.post(
        `${this.uploadUrl}?uploadType=resumable&part=snippet,status`,
        metadata,
        {
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json',
            'X-Upload-Content-Length': contentLength,
            'X-Upload-Content-Type': 'video/*',
          },
        }
      );

      const uploadUrl = uploadResponse.headers.location;

      if (!uploadUrl) {
        return {
          success: false,
          error: 'Failed to get upload URL from YouTube',
          stage: 'youtube_upload_init',
        };
      }

      // Upload the video content
      const videoUploadResponse = await axios.put(uploadUrl, videoBuffer, {
        headers: {
          'Content-Type': 'video/*',
          'Content-Length': contentLength,
        },
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
      });

      const videoId = videoUploadResponse.data.id;

      return {
        success: true,
        videoId: videoId,
        url: `https://www.youtube.com/watch?v=${videoId}`,
      };
    } catch (error) {
      console.error('YouTube upload error:', error.response?.data || error.message);

      return {
        success: false,
        error: error.response?.data?.error?.message || error.message,
        stage: 'youtube_upload',
        youtube: {
          code: error.response?.data?.error?.code,
          message: error.response?.data?.error?.message,
        },
      };
    }
  }

  /**
   * Get channel information
   */
  async getChannelInfo() {
    try {
      const response = await axios.get(`${this.apiUrl}/channels`, {
        params: {
          part: 'snippet,statistics',
          mine: true,
        },
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
        },
      });

      if (response.data.items && response.data.items.length > 0) {
        const channel = response.data.items[0];
        return {
          success: true,
          channel: {
            id: channel.id,
            title: channel.snippet.title,
            description: channel.snippet.description,
            subscriberCount: channel.statistics.subscriberCount,
            videoCount: channel.statistics.videoCount,
          },
        };
      }

      return {
        success: false,
        error: 'No channel found',
      };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.error?.message || error.message,
      };
    }
  }
}

module.exports = YouTubeService;

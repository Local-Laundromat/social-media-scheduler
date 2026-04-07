const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');
const { normalizeAxiosGraphError } = require('../utils/postingErrors');

function isRemoteMediaUrl(filePath) {
  return typeof filePath === 'string' && /^https?:\/\//i.test(filePath.trim());
}

/**
 * Resolve file extension for routing to image vs video Graph endpoints.
 * path.extname('https://host/a.jpg?v=1') wrongly returns '.jpg?v=1'; URLs must use pathname only.
 */
function inferMediaExtension(filePath, hint = {}) {
  let ext = '';
  if (filePath && typeof filePath === 'string') {
    let s = filePath.trim();
    if (/^https?:\/\//i.test(s)) {
      try {
        s = new URL(s).pathname;
      } catch (_) {
        /* keep full string */
      }
    }
    ext = path.extname(s).toLowerCase();
    if (ext.includes('?')) ext = ext.split('?')[0];
  }
  if (!ext && hint.filename) {
    ext = path.extname(String(hint.filename)).toLowerCase();
    if (ext.includes('?')) ext = ext.split('?')[0];
  }
  if (!ext && hint.filetype === 'video') return '.mp4';
  if (!ext && hint.filetype === 'image') return '.jpg';
  return ext;
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
    const remote = isRemoteMediaUrl(imagePath);
    const stage = remote ? 'facebook_graph_photos_url' : 'facebook_graph_photos_multipart';

    try {
      let response;

      if (remote) {
        // Supabase Storage / CDN URLs — Graph API cannot read local fs paths for these
        response = await axios.post(`${this.baseUrl}/${this.pageId}/photos`, null, {
          params: {
            url: imagePath.trim(),
            message: caption,
            access_token: this.pageAccessToken,
          },
        });
      } else {
        if (!fs.existsSync(imagePath)) {
          return {
            success: false,
            error: `Local media file not found (server path): ${imagePath}`,
            stage: 'facebook_local_file_missing',
          };
        }
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
      const g = normalizeAxiosGraphError(error);
      console.error(`[${stage}]`, g.message, g.fbtrace_id ? `trace=${g.fbtrace_id}` : '');
      return {
        success: false,
        error: g.message,
        stage,
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
   * Post a video to Facebook Page
   */
  async postVideo(videoPath, caption = '') {
    const remote = isRemoteMediaUrl(videoPath);
    const stage = remote ? 'facebook_graph_videos_url' : 'facebook_graph_videos_multipart';

    try {
      let response;

      if (remote) {
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
        if (!fs.existsSync(videoPath)) {
          return {
            success: false,
            error: `Local media file not found (server path): ${videoPath}`,
            stage: 'facebook_local_file_missing',
          };
        }
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
      const g = normalizeAxiosGraphError(error);
      console.error(`[${stage}]`, g.message, g.fbtrace_id ? `trace=${g.fbtrace_id}` : '');
      return {
        success: false,
        error: g.message,
        stage,
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
   * Post a story to Facebook Page (24-hour ephemeral content)
   * @param {string} mediaPath - Local path or public https URL
   * @param {string} postType - 'story' to post as story
   */
  async postStory(mediaPath, postType = 'story') {
    const remote = isRemoteMediaUrl(mediaPath);
    const ext = inferMediaExtension(mediaPath, {});
    const isImage = ['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext);
    const isVideo = ['.mp4', '.mov', '.avi'].includes(ext);

    if (!isImage && !isVideo) {
      return {
        success: false,
        error: `Unsupported file type for story (${ext || 'unknown'}). Use jpg/png/gif/webp or mp4/mov/avi.`,
        stage: 'facebook_story_media_type',
      };
    }

    const endpoint = isImage ? 'photo_stories' : 'video_stories';
    const stage = remote ? `facebook_${endpoint}_url` : `facebook_${endpoint}_multipart`;

    try {
      let response;

      if (remote) {
        const params = {
          access_token: this.pageAccessToken,
        };

        if (isImage) {
          params.url = mediaPath.trim();
        } else {
          params.file_url = mediaPath.trim();
        }

        response = await axios.post(`${this.baseUrl}/${this.pageId}/${endpoint}`, null, {
          params,
          maxContentLength: Infinity,
          maxBodyLength: Infinity,
        });
      } else {
        if (!fs.existsSync(mediaPath)) {
          return {
            success: false,
            error: `Local media file not found (server path): ${mediaPath}`,
            stage: 'facebook_local_file_missing',
          };
        }

        const form = new FormData();
        form.append('source', fs.createReadStream(mediaPath));
        form.append('access_token', this.pageAccessToken);

        response = await axios.post(`${this.baseUrl}/${this.pageId}/${endpoint}`, form, {
          headers: form.getHeaders(),
          maxContentLength: Infinity,
          maxBodyLength: Infinity,
        });
      }

      return {
        success: true,
        postId: response.data.id || response.data.post_id,
        data: response.data,
      };
    } catch (error) {
      const g = normalizeAxiosGraphError(error);
      console.error(`[${stage}]`, g.message, g.fbtrace_id ? `trace=${g.fbtrace_id}` : '');
      return {
        success: false,
        error: g.message,
        stage,
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
   * Post content based on file type
   * @param {string} filePath - Local path or public https URL
   * @param {string} caption
   * @param {{ filetype?: string, filename?: string, postType?: string }} hint - DB fields when URL has no clear extension
   */
  async post(filePath, caption = '', hint = {}) {
    // If post_type is 'story', use story endpoint
    if (hint.postType === 'story') {
      return await this.postStory(filePath, 'story');
    }

    const ext = inferMediaExtension(filePath, hint);

    if (['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext)) {
      return await this.postImage(filePath, caption);
    }
    if (['.mp4', '.mov', '.avi'].includes(ext)) {
      return await this.postVideo(filePath, caption);
    }
    return {
      success: false,
      error: `Unsupported file type (${ext || 'unknown'}). Use jpg/png/gif/webp or mp4/mov/avi.`,
      stage: 'facebook_media_type_routing',
      inferredExtension: ext || null,
    };
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
module.exports.inferMediaExtension = inferMediaExtension;

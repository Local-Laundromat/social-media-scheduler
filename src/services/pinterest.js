const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');

class PinterestService {
  constructor(accessToken) {
    this.accessToken = accessToken;
    this.baseUrl = 'https://api.pinterest.com/v5';
  }

  /**
   * Create a pin (post) on Pinterest
   * @param {string} imagePath - Path to the image file
   * @param {string} title - Pin title (required)
   * @param {string} description - Pin description/caption
   * @param {string} boardId - Board ID where the pin will be posted
   * @param {string} link - Optional destination link for the pin
   */
  async createPin(imagePath, title, description = '', boardId, link = null) {
    try {
      // Pinterest API requires the image to be publicly accessible
      // The image URL should be from PUBLIC_FILE_URL or uploaded to Supabase storage

      const pinData = {
        board_id: boardId,
        title: title.substring(0, 100), // Pinterest title limit is 100 characters
        description: description.substring(0, 500), // Description limit is 500 characters
        media_source: {
          source_type: 'image_url',
          url: imagePath, // Must be a publicly accessible URL
        }
      };

      // Add optional link if provided
      if (link) {
        pinData.link = link;
      }

      const response = await axios.post(
        `${this.baseUrl}/pins`,
        pinData,
        {
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      return {
        success: true,
        pinId: response.data.id,
        pinUrl: `https://www.pinterest.com/pin/${response.data.id}/`,
        message: 'Pin created successfully',
        data: response.data,
      };
    } catch (error) {
      console.error('Pinterest create pin error:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data?.message || error.message,
        details: error.response?.data,
      };
    }
  }

  /**
   * Upload image directly to Pinterest (alternative method)
   * Uses multipart form data to upload image file
   */
  async createPinWithUpload(imagePath, title, description = '', boardId, link = null) {
    try {
      const form = new FormData();
      form.append('board_id', boardId);
      form.append('title', title.substring(0, 100));
      form.append('description', description.substring(0, 500));

      // Append the image file
      const imageStream = fs.createReadStream(imagePath);
      form.append('media_source', imageStream, {
        filename: path.basename(imagePath),
        contentType: this.getContentType(imagePath),
      });

      if (link) {
        form.append('link', link);
      }

      const response = await axios.post(
        `${this.baseUrl}/pins`,
        form,
        {
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
            ...form.getHeaders(),
          },
        }
      );

      return {
        success: true,
        pinId: response.data.id,
        pinUrl: `https://www.pinterest.com/pin/${response.data.id}/`,
        message: 'Pin created successfully with direct upload',
        data: response.data,
      };
    } catch (error) {
      console.error('Pinterest upload pin error:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data?.message || error.message,
        details: error.response?.data,
      };
    }
  }

  /**
   * Get user's boards
   */
  async getBoards() {
    try {
      const response = await axios.get(`${this.baseUrl}/boards`, {
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
        },
      });

      return {
        success: true,
        boards: response.data.items || [],
        data: response.data,
      };
    } catch (error) {
      console.error('Pinterest get boards error:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data?.message || error.message,
      };
    }
  }

  /**
   * Get user account info
   */
  async getUserInfo() {
    try {
      const response = await axios.get(`${this.baseUrl}/user_account`, {
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
        },
      });

      return {
        success: true,
        data: response.data,
      };
    } catch (error) {
      console.error('Pinterest get user info error:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data?.message || error.message,
      };
    }
  }

  /**
   * Get a specific pin's details
   */
  async getPin(pinId) {
    try {
      const response = await axios.get(`${this.baseUrl}/pins/${pinId}`, {
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
        },
      });

      return {
        success: true,
        data: response.data,
      };
    } catch (error) {
      console.error('Pinterest get pin error:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data?.message || error.message,
      };
    }
  }

  /**
   * Delete a pin
   */
  async deletePin(pinId) {
    try {
      await axios.delete(`${this.baseUrl}/pins/${pinId}`, {
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
        },
      });

      return {
        success: true,
        message: 'Pin deleted successfully',
      };
    } catch (error) {
      console.error('Pinterest delete pin error:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data?.message || error.message,
      };
    }
  }

  /**
   * Post content based on file type
   * Pinterest only supports images
   */
  async post(filePath, caption, boardId, link = null) {
    const ext = path.extname(filePath).toLowerCase();

    // Extract title from caption (first line or first 100 chars)
    const title = caption.split('\n')[0].substring(0, 100) || 'Untitled Pin';
    const description = caption;

    if (['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext)) {
      // Try URL-based upload first (faster), fallback to direct upload
      return await this.createPin(filePath, title, description, boardId, link);
    } else if (['.mp4', '.mov', '.avi'].includes(ext)) {
      return {
        success: false,
        error: 'Pinterest does not support video uploads through the API',
        info: 'Only image files (JPG, PNG, GIF, WebP) are supported',
      };
    } else {
      return {
        success: false,
        error: 'Unsupported file type for Pinterest',
        info: 'Supported formats: JPG, PNG, GIF, WebP',
      };
    }
  }

  /**
   * Get content type based on file extension
   */
  getContentType(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    const contentTypes = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
    };
    return contentTypes[ext] || 'application/octet-stream';
  }
}

module.exports = PinterestService;

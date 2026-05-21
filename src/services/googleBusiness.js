const axios = require('axios');

class GoogleBusinessService {
  constructor(accessToken, accountName, locationName) {
    this.accessToken = accessToken;
    this.accountName = accountName;
    this.locationName = locationName;
    this.apiUrl = 'https://mybusiness.googleapis.com/v4';
  }

  /**
   * Create a local post on Google Business Profile
   * @param {string} summary - Post text content
   * @param {object} options - Additional options
   * @returns {object} - { success: boolean, postName?: string, error?: string }
   */
  async post(summary, options = {}) {
    try {
      const {
        mediaUrl = null,
        mediaFormat = 'PHOTO', // PHOTO or VIDEO
        callToAction = null, // { actionType: 'LEARN_MORE', url: 'https://...' }
        topicType = 'STANDARD', // STANDARD, EVENT, OFFER, ALERT
        eventTitle = null,
        eventSchedule = null, // { startDate: {...}, endDate: {...} }
        offerCouponCode = null,
        offerRedeemOnlineUrl = null,
        offerTermsConditions = null,
      } = options;

      // Build the post object
      const localPost = {
        languageCode: 'en',
        summary: summary || 'New post from Quu Social',
        topicType: topicType,
      };

      // Add call to action if provided
      if (callToAction) {
        localPost.callToAction = callToAction;
      }

      // Add media if provided
      if (mediaUrl) {
        localPost.media = [{
          mediaFormat: mediaFormat,
          sourceUrl: mediaUrl,
        }];
      }

      // Add event details if it's an event post
      if (topicType === 'EVENT' && eventTitle) {
        localPost.event = {
          title: eventTitle,
        };
        if (eventSchedule) {
          localPost.event.schedule = eventSchedule;
        }
      }

      // Add offer details if it's an offer post
      if (topicType === 'OFFER') {
        localPost.offer = {};
        if (offerCouponCode) {
          localPost.offer.couponCode = offerCouponCode;
        }
        if (offerRedeemOnlineUrl) {
          localPost.offer.redeemOnlineUrl = offerRedeemOnlineUrl;
        }
        if (offerTermsConditions) {
          localPost.offer.termsConditions = offerTermsConditions;
        }
      }

      // Create the post
      const response = await axios.post(
        `${this.apiUrl}/${this.accountName}/${this.locationName}/localPosts`,
        localPost,
        {
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      return {
        success: true,
        postName: response.data.name,
        viewUrl: `https://business.google.com/posts/l/${this.locationName.split('/').pop()}`,
      };
    } catch (error) {
      console.error('Google Business post error:', error.response?.data || error.message);

      return {
        success: false,
        error: error.response?.data?.error?.message || error.message,
        stage: 'google_business_post',
        google: {
          code: error.response?.data?.error?.code,
          message: error.response?.data?.error?.message,
          status: error.response?.data?.error?.status,
        },
      };
    }
  }

  /**
   * Get location information
   */
  async getLocationInfo() {
    try {
      const response = await axios.get(
        `${this.apiUrl}/${this.accountName}/${this.locationName}`,
        {
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
          },
          params: {
            readMask: 'name,title,storefrontAddress,websiteUrl,phoneNumbers,categories',
          },
        }
      );

      return {
        success: true,
        location: {
          name: response.data.name,
          title: response.data.title,
          address: response.data.storefrontAddress,
          websiteUrl: response.data.websiteUrl,
          phoneNumbers: response.data.phoneNumbers,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.error?.message || error.message,
      };
    }
  }

  /**
   * List all local posts
   */
  async listPosts(pageSize = 20) {
    try {
      const response = await axios.get(
        `${this.apiUrl}/${this.accountName}/${this.locationName}/localPosts`,
        {
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
          },
          params: {
            pageSize: pageSize,
          },
        }
      );

      return {
        success: true,
        posts: response.data.localPosts || [],
      };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.error?.message || error.message,
      };
    }
  }

  /**
   * Delete a local post
   */
  async deletePost(postName) {
    try {
      await axios.delete(
        `${this.apiUrl}/${postName}`,
        {
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
          },
        }
      );

      return {
        success: true,
      };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.error?.message || error.message,
      };
    }
  }
}

module.exports = GoogleBusinessService;

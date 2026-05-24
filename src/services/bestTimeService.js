/**
 * Best Time to Post Analytics Service
 * Analyzes historical post performance to recommend optimal posting times
 */

const { supabase } = require('../config/supabase');

class BestTimeService {
  /**
   * Analyze historical post performance to find best times to post
   * @param {string} userId - User ID
   * @param {string} platform - Optional platform filter (instagram, facebook, twitter, etc.)
   * @param {number} daysBack - Number of days to analyze (default: 90)
   * @returns {Promise<object>} - Analysis results with best times
   */
  async analyzeBestTimes(userId, platform = null, daysBack = 90) {
    try {
      // Build query to get published posts with engagement data
      let query = supabase
        .from('posts')
        .select('scheduled_time, platform, engagement_rate, likes_count, comments_count, shares_count, status')
        .eq('user_id', userId)
        .eq('status', 'published')
        .gte('scheduled_time', new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000).toISOString())
        .order('scheduled_time', { ascending: false });

      // Filter by platform if specified
      if (platform) {
        query = query.eq('platform', platform);
      }

      const { data: posts, error } = await query;

      if (error) {
        console.error('Error fetching posts for analysis:', error);
        return {
          success: false,
          error: error.message,
          bestTimes: [],
          heatmapData: [],
          insights: []
        };
      }

      if (!posts || posts.length < 5) {
        return {
          success: true,
          bestTimes: [],
          heatmapData: [],
          insights: ['Not enough published posts to analyze. Need at least 5 posts with engagement data.'],
          totalPosts: posts?.length || 0
        };
      }

      // Group posts by day of week and hour
      const timeSlots = {};
      const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

      posts.forEach(post => {
        const date = new Date(post.scheduled_time);
        const dayOfWeek = date.getDay(); // 0-6 (Sunday-Saturday)
        const hour = date.getHours(); // 0-23
        const key = `${dayOfWeek}-${hour}`;

        if (!timeSlots[key]) {
          timeSlots[key] = {
            dayOfWeek,
            dayName: dayNames[dayOfWeek],
            hour,
            posts: [],
            totalEngagement: 0,
            avgEngagement: 0,
            avgLikes: 0,
            avgComments: 0,
            avgShares: 0,
            postCount: 0
          };
        }

        timeSlots[key].posts.push(post);
        timeSlots[key].postCount++;
        timeSlots[key].totalEngagement += post.engagement_rate || 0;
        timeSlots[key].avgLikes += post.likes_count || 0;
        timeSlots[key].avgComments += post.comments_count || 0;
        timeSlots[key].avgShares += post.shares_count || 0;
      });

      // Calculate averages for each time slot
      const timeSlotArray = Object.values(timeSlots).map(slot => {
        slot.avgEngagement = slot.totalEngagement / slot.postCount;
        slot.avgLikes = slot.avgLikes / slot.postCount;
        slot.avgComments = slot.avgComments / slot.postCount;
        slot.avgShares = slot.avgShares / slot.postCount;
        return slot;
      });

      // Sort by average engagement (descending)
      const bestTimes = timeSlotArray
        .filter(slot => slot.postCount >= 2) // Only include slots with at least 2 posts
        .sort((a, b) => b.avgEngagement - a.avgEngagement)
        .slice(0, 20); // Top 20 best times

      // Create heatmap data (7 days x 24 hours)
      const heatmapData = [];
      for (let day = 0; day < 7; day++) {
        for (let hour = 0; hour < 24; hour++) {
          const key = `${day}-${hour}`;
          const slot = timeSlots[key];
          heatmapData.push({
            day,
            dayName: dayNames[day],
            hour,
            engagement: slot ? slot.avgEngagement : 0,
            postCount: slot ? slot.postCount : 0,
            hasData: !!slot && slot.postCount >= 2
          });
        }
      }

      // Generate insights
      const insights = this.generateInsights(bestTimes, timeSlotArray, posts.length);

      return {
        success: true,
        bestTimes,
        heatmapData,
        insights,
        totalPosts: posts.length,
        platform: platform || 'all',
        daysAnalyzed: daysBack
      };

    } catch (error) {
      console.error('Error analyzing best times:', error);
      return {
        success: false,
        error: error.message,
        bestTimes: [],
        heatmapData: [],
        insights: []
      };
    }
  }

  /**
   * Generate actionable insights from the analysis
   * @param {Array} bestTimes - Top performing time slots
   * @param {Array} allTimeSlots - All time slots
   * @param {number} totalPosts - Total posts analyzed
   * @returns {Array<string>} - Array of insight strings
   */
  generateInsights(bestTimes, allTimeSlots, totalPosts) {
    const insights = [];

    if (bestTimes.length === 0) {
      insights.push('Not enough data to generate insights. Keep posting and check back soon!');
      return insights;
    }

    // Best overall time
    const topTime = bestTimes[0];
    insights.push(
      `Your best time to post is ${topTime.dayName}s at ${this.formatHour(topTime.hour)} ` +
      `(avg ${topTime.avgEngagement.toFixed(1)}% engagement from ${topTime.postCount} posts)`
    );

    // Best day of week
    const dayPerformance = {};
    allTimeSlots.forEach(slot => {
      if (!dayPerformance[slot.dayName]) {
        dayPerformance[slot.dayName] = {
          totalEngagement: 0,
          postCount: 0
        };
      }
      dayPerformance[slot.dayName].totalEngagement += slot.totalEngagement;
      dayPerformance[slot.dayName].postCount += slot.postCount;
    });

    const dayAverages = Object.entries(dayPerformance)
      .map(([day, data]) => ({
        day,
        avgEngagement: data.totalEngagement / data.postCount
      }))
      .sort((a, b) => b.avgEngagement - a.avgEngagement);

    if (dayAverages.length > 0) {
      insights.push(
        `${dayAverages[0].day} is your best day overall ` +
        `(${dayAverages[0].avgEngagement.toFixed(1)}% avg engagement)`
      );

      if (dayAverages.length > 1) {
        insights.push(
          `Avoid posting on ${dayAverages[dayAverages.length - 1].day} ` +
          `(${dayAverages[dayAverages.length - 1].avgEngagement.toFixed(1)}% avg engagement)`
        );
      }
    }

    // Best time of day
    const hourPerformance = {};
    allTimeSlots.forEach(slot => {
      const timeOfDay = this.getTimeOfDay(slot.hour);
      if (!hourPerformance[timeOfDay]) {
        hourPerformance[timeOfDay] = {
          totalEngagement: 0,
          postCount: 0
        };
      }
      hourPerformance[timeOfDay].totalEngagement += slot.totalEngagement;
      hourPerformance[timeOfDay].postCount += slot.postCount;
    });

    const timeOfDayAverages = Object.entries(hourPerformance)
      .map(([time, data]) => ({
        time,
        avgEngagement: data.totalEngagement / data.postCount
      }))
      .sort((a, b) => b.avgEngagement - a.avgEngagement);

    if (timeOfDayAverages.length > 0) {
      insights.push(
        `${timeOfDayAverages[0].time} posts perform best ` +
        `(${timeOfDayAverages[0].avgEngagement.toFixed(1)}% avg engagement)`
      );
    }

    // Top 3 specific times
    if (bestTimes.length >= 3) {
      const top3 = bestTimes.slice(0, 3);
      insights.push(
        `Top 3 times: ${top3.map(t =>
          `${t.dayName} ${this.formatHour(t.hour)}`
        ).join(', ')}`
      );
    }

    return insights;
  }

  /**
   * Get recommended posting times for scheduling
   * @param {string} userId - User ID
   * @param {string} platform - Platform
   * @param {number} count - Number of recommendations
   * @returns {Promise<Array>} - Array of recommended time objects
   */
  async getRecommendedTimes(userId, platform = null, count = 5) {
    const analysis = await this.analyzeBestTimes(userId, platform, 90);

    if (!analysis.success || analysis.bestTimes.length === 0) {
      // Return default recommended times if no data
      return this.getDefaultRecommendedTimes(platform, count);
    }

    return analysis.bestTimes.slice(0, count).map(time => ({
      dayOfWeek: time.dayOfWeek,
      dayName: time.dayName,
      hour: time.hour,
      hourFormatted: this.formatHour(time.hour),
      avgEngagement: time.avgEngagement,
      confidence: this.calculateConfidence(time.postCount)
    }));
  }

  /**
   * Get default recommended times when no historical data exists
   * @param {string} platform - Platform
   * @param {number} count - Number of recommendations
   * @returns {Array} - Default recommended times
   */
  getDefaultRecommendedTimes(platform, count) {
    // Industry standard best times based on platform
    const defaults = {
      instagram: [
        { dayOfWeek: 3, dayName: 'Wednesday', hour: 11 },
        { dayOfWeek: 5, dayName: 'Friday', hour: 10 },
        { dayOfWeek: 1, dayName: 'Monday', hour: 11 },
        { dayOfWeek: 2, dayName: 'Tuesday', hour: 14 },
        { dayOfWeek: 4, dayName: 'Thursday', hour: 13 }
      ],
      facebook: [
        { dayOfWeek: 2, dayName: 'Tuesday', hour: 9 },
        { dayOfWeek: 4, dayName: 'Thursday', hour: 12 },
        { dayOfWeek: 3, dayName: 'Wednesday', hour: 13 },
        { dayOfWeek: 1, dayName: 'Monday', hour: 15 },
        { dayOfWeek: 5, dayName: 'Friday', hour: 9 }
      ],
      twitter: [
        { dayOfWeek: 3, dayName: 'Wednesday', hour: 9 },
        { dayOfWeek: 2, dayName: 'Tuesday', hour: 11 },
        { dayOfWeek: 4, dayName: 'Thursday', hour: 10 },
        { dayOfWeek: 1, dayName: 'Monday', hour: 12 },
        { dayOfWeek: 5, dayName: 'Friday', hour: 9 }
      ],
      linkedin: [
        { dayOfWeek: 2, dayName: 'Tuesday', hour: 10 },
        { dayOfWeek: 3, dayName: 'Wednesday', hour: 9 },
        { dayOfWeek: 4, dayName: 'Thursday', hour: 12 },
        { dayOfWeek: 1, dayName: 'Monday', hour: 8 },
        { dayOfWeek: 2, dayName: 'Tuesday', hour: 17 }
      ]
    };

    const platformDefaults = defaults[platform] || defaults.instagram;
    return platformDefaults.slice(0, count).map(time => ({
      ...time,
      hourFormatted: this.formatHour(time.hour),
      avgEngagement: 0,
      confidence: 'low',
      isDefault: true
    }));
  }

  /**
   * Calculate confidence level based on sample size
   * @param {number} postCount - Number of posts in time slot
   * @returns {string} - Confidence level (low/medium/high)
   */
  calculateConfidence(postCount) {
    if (postCount >= 10) return 'high';
    if (postCount >= 5) return 'medium';
    return 'low';
  }

  /**
   * Format hour in 12-hour format
   * @param {number} hour - Hour (0-23)
   * @returns {string} - Formatted hour (e.g., "9am", "2pm")
   */
  formatHour(hour) {
    if (hour === 0) return '12am';
    if (hour === 12) return '12pm';
    if (hour < 12) return `${hour}am`;
    return `${hour - 12}pm`;
  }

  /**
   * Get time of day category
   * @param {number} hour - Hour (0-23)
   * @returns {string} - Time of day (Morning/Afternoon/Evening/Night)
   */
  getTimeOfDay(hour) {
    if (hour >= 5 && hour < 12) return 'Morning';
    if (hour >= 12 && hour < 17) return 'Afternoon';
    if (hour >= 17 && hour < 21) return 'Evening';
    return 'Night';
  }
}

// Export singleton instance
module.exports = new BestTimeService();

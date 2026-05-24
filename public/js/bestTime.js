/**
 * Best Time to Post Analytics Feature
 * Analyzes historical post performance to recommend optimal posting times
 */

// Initialize when Analytics tab is loaded
document.addEventListener('DOMContentLoaded', function() {
  // Check if we're on the analytics page
  const analyticsSection = document.getElementById('analytics-section');
  if (analyticsSection) {
    initBestTimeAnalytics();
  }
});

async function initBestTimeAnalytics() {
  const userId = await getCurrentUserId();
  if (!userId) {
    console.warn('No user ID found for best time analytics');
    return;
  }

  // Load analytics data
  await loadBestTimeAnalytics(userId);
}

async function getCurrentUserId() {
  try {
    const token = localStorage.getItem('sb-access-token');
    if (!token) return null;

    // Decode JWT to get user ID
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.sub;
  } catch (error) {
    console.error('Error getting user ID:', error);
    return null;
  }
}

async function loadBestTimeAnalytics(userId, platform = null) {
  try {
    const token = localStorage.getItem('sb-access-token');
    const platformParam = platform ? `&platform=${platform}` : '';

    const response = await fetch(`/api/analytics/best-times?user_id=${userId}${platformParam}&days=90`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (!response.ok) {
      throw new Error('Failed to load analytics');
    }

    const data = await response.json();
    displayBestTimeAnalytics(data);

  } catch (error) {
    console.error('Error loading best time analytics:', error);
    showBestTimeError('Failed to load analytics. Make sure you have published posts with engagement data.');
  }
}

function displayBestTimeAnalytics(data) {
  const container = document.getElementById('best-time-container');
  if (!container) return;

  if (!data.success || data.totalPosts === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 40px; color: #6b7280;">
        <svg style="width: 64px; height: 64px; margin: 0 auto 16px; opacity: 0.5;" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
        <h3 style="margin: 0 0 8px 0; font-size: 18px; font-weight: 600;">No Data Available</h3>
        <p style="margin: 0; font-size: 14px;">
          ${data.insights && data.insights.length > 0 ? data.insights[0] : 'Publish more posts with engagement data to see analytics.'}
        </p>
      </div>
    `;
    return;
  }

  let html = `
    <div style="margin-bottom: 32px;">
      <!-- Platform Filter -->
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px;">
        <h3 style="margin: 0; font-size: 20px; font-weight: 600;">Best Times to Post</h3>
        <select id="platform-filter" class="form-select" style="width: 200px;" onchange="filterByPlatform(this.value)">
          <option value="">All Platforms</option>
          <option value="instagram">Instagram</option>
          <option value="facebook">Facebook</option>
          <option value="twitter">Twitter</option>
          <option value="linkedin">LinkedIn</option>
          <option value="tiktok">TikTok</option>
        </select>
      </div>

      <!-- Insights -->
      <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 24px; border-radius: 12px; color: white; margin-bottom: 24px;">
        <h4 style="margin: 0 0 16px 0; font-size: 16px; font-weight: 600; display: flex; align-items: center;">
          <svg style="width: 20px; height: 20px; margin-right: 8px;" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
          </svg>
          Key Insights
        </h4>
        <ul style="margin: 0; padding-left: 20px; line-height: 1.8;">
          ${data.insights.map(insight => `<li>${insight}</li>`).join('')}
        </ul>
        <p style="margin: 16px 0 0 0; font-size: 13px; opacity: 0.9;">
          Based on ${data.totalPosts} posts over the last ${data.daysAnalyzed} days
        </p>
      </div>

      <!-- Top 5 Best Times -->
      <div style="margin-bottom: 32px;">
        <h4 style="margin: 0 0 16px 0; font-size: 16px; font-weight: 600;">Top Performing Times</h4>
        <div style="display: grid; gap: 12px;">
          ${data.bestTimes.slice(0, 5).map((time, index) => {
            const medalEmoji = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : '📍';
            return `
              <div style="display: flex; align-items: center; padding: 16px; background: ${index === 0 ? '#fef3c7' : index === 1 ? '#f3f4f6' : '#f9fafb'}; border: 1px solid ${index === 0 ? '#fbbf24' : '#e5e7eb'}; border-radius: 8px;">
                <span style="font-size: 24px; margin-right: 16px;">${medalEmoji}</span>
                <div style="flex: 1;">
                  <div style="font-weight: 600; font-size: 15px; margin-bottom: 4px;">
                    ${time.dayName}s at ${formatHour(time.hour)}
                  </div>
                  <div style="font-size: 13px; color: #6b7280;">
                    ${time.avgEngagement.toFixed(1)}% avg engagement from ${time.postCount} posts
                  </div>
                </div>
                <div style="text-align: right;">
                  <div style="font-size: 24px; font-weight: 700; color: #10b981;">
                    ${time.avgEngagement.toFixed(1)}%
                  </div>
                  <div style="font-size: 11px; color: #6b7280; text-transform: uppercase;">
                    Engagement
                  </div>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>

      <!-- Heatmap -->
      <div style="margin-bottom: 32px;">
        <h4 style="margin: 0 0 16px 0; font-size: 16px; font-weight: 600;">Posting Heatmap</h4>
        <div id="heatmap-container"></div>
      </div>
    </div>
  `;

  container.innerHTML = html;

  // Render heatmap
  renderHeatmap(data.heatmapData);
}

function renderHeatmap(heatmapData) {
  const container = document.getElementById('heatmap-container');
  if (!container) return;

  // Group by day
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const hours = Array.from({ length: 24 }, (_, i) => i);

  // Find max engagement for color scaling
  const maxEngagement = Math.max(...heatmapData.map(d => d.engagement));

  // Build heatmap HTML
  let html = `
    <div style="overflow-x: auto;">
      <table style="border-collapse: separate; border-spacing: 2px; font-size: 11px;">
        <thead>
          <tr>
            <th style="padding: 8px; text-align: left; font-weight: 600; color: #6b7280;"></th>
            ${hours.map(hour => `
              <th style="padding: 4px; text-align: center; font-weight: 500; color: #6b7280; font-size: 10px;">
                ${formatHour(hour)}
              </th>
            `).join('')}
          </tr>
        </thead>
        <tbody>
          ${dayNames.map((dayName, day) => `
            <tr>
              <td style="padding: 8px; font-weight: 600; color: #374151; text-align: right; white-space: nowrap;">
                ${dayName}
              </td>
              ${hours.map(hour => {
                const dataPoint = heatmapData.find(d => d.day === day && d.hour === hour);
                const engagement = dataPoint ? dataPoint.engagement : 0;
                const hasData = dataPoint && dataPoint.hasData;
                const opacity = maxEngagement > 0 ? (engagement / maxEngagement) : 0;

                // Color scale: gray for no data, green for data
                const bgColor = hasData
                  ? `rgba(16, 185, 129, ${Math.max(0.1, opacity)})`
                  : '#f3f4f6';

                const title = hasData
                  ? `${dayName} ${formatHour(hour)}: ${engagement.toFixed(1)}% avg engagement (${dataPoint.postCount} posts)`
                  : `${dayName} ${formatHour(hour)}: No data`;

                return `
                  <td
                    style="
                      width: 32px;
                      height: 32px;
                      background: ${bgColor};
                      border-radius: 4px;
                      cursor: ${hasData ? 'pointer' : 'default'};
                      transition: transform 0.2s;
                    "
                    title="${title}"
                    onmouseover="this.style.transform='scale(1.1)'"
                    onmouseout="this.style.transform='scale(1)'"
                  ></td>
                `;
              }).join('')}
            </tr>
          `).join('')}
        </tbody>
      </table>
      <div style="margin-top: 16px; display: flex; align-items: center; justify-content: center; gap: 8px; font-size: 12px; color: #6b7280;">
        <span style="width: 16px; height: 16px; background: #f3f4f6; border-radius: 3px;"></span>
        <span>No data</span>
        <span style="width: 16px; height: 16px; background: rgba(16, 185, 129, 0.3); border-radius: 3px; margin-left: 16px;"></span>
        <span>Low</span>
        <span style="width: 16px; height: 16px; background: rgba(16, 185, 129, 0.6); border-radius: 3px;"></span>
        <span>Medium</span>
        <span style="width: 16px; height: 16px; background: rgba(16, 185, 129, 1); border-radius: 3px;"></span>
        <span>High</span>
      </div>
    </div>
  `;

  container.innerHTML = html;
}

function formatHour(hour) {
  if (hour === 0) return '12am';
  if (hour === 12) return '12pm';
  if (hour < 12) return `${hour}am`;
  return `${hour - 12}pm`;
}

function showBestTimeError(message) {
  const container = document.getElementById('best-time-container');
  if (!container) return;

  container.innerHTML = `
    <div style="text-align: center; padding: 40px; color: #ef4444;">
      <svg style="width: 64px; height: 64px; margin: 0 auto 16px;" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <h3 style="margin: 0 0 8px 0; font-size: 18px; font-weight: 600;">Error Loading Analytics</h3>
      <p style="margin: 0; font-size: 14px; color: #6b7280;">${message}</p>
    </div>
  `;
}

async function filterByPlatform(platform) {
  const userId = await getCurrentUserId();
  if (!userId) return;

  await loadBestTimeAnalytics(userId, platform || null);
}

// Export functions for global access
window.loadBestTimeAnalytics = loadBestTimeAnalytics;
window.filterByPlatform = filterByPlatform;
window.formatHour = formatHour;

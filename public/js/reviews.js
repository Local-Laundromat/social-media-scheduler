// ===== GOOGLE BUSINESS REVIEW MANAGEMENT =====

let allReviews = [];
let currentReviewFilter = 'all';
let reviewStats = null;
let googleBusinessAccounts = [];
let currentAccountId = null;

// Load reviews when tab is switched
async function loadReviews(syncNew = false) {
  const token = localStorage.getItem('auth_token');
  const reviewsList = document.getElementById('reviewsList');

  try {
    reviewsList.innerHTML = '<div class="loading"><div class="spinner"></div>Loading reviews...</div>';

    let url = syncNew ? '/api/reviews?syncNew=true' : '/api/reviews';

    // Use global account switcher if available and it's a Google Business account
    if (typeof currentGlobalAccount !== 'undefined' && currentGlobalAccount && currentGlobalAccount.platform === 'google_business') {
      url += (syncNew ? '&' : '?') + `accountId=${currentGlobalAccount.accountId}`;
    }

    const response = await fetch(url, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Failed to load reviews');
    }

    allReviews = data.reviews || [];
    googleBusinessAccounts = data.accounts || [];

    // Populate account selector if multiple accounts exist
    if (googleBusinessAccounts.length > 1) {
      populateAccountSelector();
    } else if (googleBusinessAccounts.length === 1) {
      // Hide selector if only one account
      document.getElementById('reviewAccountSelectorContainer').style.display = 'none';
    }

    // Load review auto-reply toggle state
    if (currentUser && currentUser.review_auto_reply_enabled !== undefined) {
      document.getElementById('reviewAutoReplyToggle').checked = currentUser.review_auto_reply_enabled === 1;
    }

    // Load stats
    await loadReviewStats();

    // Render reviews
    renderReviews(allReviews);

    if (syncNew) {
      notify('Reviews synced successfully!', 'success');
    }

  } catch (error) {
    console.error('Failed to load reviews:', error);
    reviewsList.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">❌</div>
        <p>Failed to load reviews</p>
        <p style="font-size: 13px; color: #6b7280;">${error.message}</p>
      </div>
    `;
  }
}

// Load review statistics
async function loadReviewStats() {
  const token = localStorage.getItem('auth_token');

  try {
    const response = await fetch('/api/reviews/stats', {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    const data = await response.json();

    if (data.success) {
      reviewStats = data.stats;
      renderReviewStats();
    }
  } catch (error) {
    console.error('Failed to load review stats:', error);
  }
}

// Render review statistics
function renderReviewStats() {
  const statsContainer = document.getElementById('reviewStatsContainer');
  if (!statsContainer || !reviewStats) return;

  statsContainer.innerHTML = `
    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin-bottom: 24px;">
      <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 16px; border-radius: 10px; color: white;">
        <div style="font-size: 28px; font-weight: 700; margin-bottom: 4px;">${reviewStats.averageRating || '0.0'} ⭐</div>
        <div style="font-size: 13px; opacity: 0.9;">${reviewStats.totalReviews} Total Reviews</div>
      </div>

      <div style="background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); padding: 16px; border-radius: 10px; color: white;">
        <div style="font-size: 28px; font-weight: 700; margin-bottom: 4px;">${reviewStats.responseRate}%</div>
        <div style="font-size: 13px; opacity: 0.9;">Response Rate</div>
      </div>

      <div style="background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%); padding: 16px; border-radius: 10px; color: white;">
        <div style="font-size: 28px; font-weight: 700; margin-bottom: 4px;">${reviewStats.needsReply}</div>
        <div style="font-size: 13px; opacity: 0.9;">Needs Reply</div>
      </div>

      <div style="background: linear-gradient(135deg, #43e97b 0%, #38f9d7 100%); padding: 16px; border-radius: 10px; color: white;">
        <div style="font-size: 28px; font-weight: 700; margin-bottom: 4px;">${reviewStats.byRating[5] || 0}</div>
        <div style="font-size: 13px; opacity: 0.9;">5-Star Reviews</div>
      </div>
    </div>
  `;
}

// Sync new reviews from Google
function syncReviews() {
  loadReviews(true);
}

// Filter reviews
function filterReviews() {
  const filter = document.getElementById('reviewFilter').value;
  currentReviewFilter = filter;

  let filteredReviews = allReviews;

  if (filter === 'needs-reply') {
    filteredReviews = allReviews.filter(r => !r.has_replied);
  } else if (filter === '5-star') {
    filteredReviews = allReviews.filter(r => r.star_rating === 5);
  } else if (filter === '4-star') {
    filteredReviews = allReviews.filter(r => r.star_rating === 4);
  } else if (filter === '3-star') {
    filteredReviews = allReviews.filter(r => r.star_rating === 3);
  } else if (filter === '1-2-star') {
    filteredReviews = allReviews.filter(r => r.star_rating <= 2);
  } else if (filter === 'positive') {
    filteredReviews = allReviews.filter(r => r.sentiment === 'positive');
  } else if (filter === 'negative') {
    filteredReviews = allReviews.filter(r => r.sentiment === 'negative');
  }

  renderReviews(filteredReviews);
}

// Render reviews list
function renderReviews(reviews) {
  const reviewsList = document.getElementById('reviewsList');

  if (reviews.length === 0) {
    reviewsList.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">⭐</div>
        <p>No reviews found</p>
        <p style="font-size: 13px; color: #6b7280;">Your Google Business reviews will appear here</p>
        <button onclick="syncReviews()" class="btn btn-primary" style="margin-top: 16px; width: auto;">
          🔄 Sync Reviews from Google
        </button>
      </div>
    `;
    return;
  }

  reviewsList.innerHTML = reviews.map(review => {
    const stars = '⭐'.repeat(review.star_rating || 0);

    const sentimentColor = {
      'positive': '#10b981',
      'negative': '#ef4444',
      'neutral': '#6b7280'
    }[review.sentiment] || '#6b7280';

    const priorityBadge = review.priority === 'high'
      ? '<span style="background: #fee2e2; color: #991b1b; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; margin-left: 8px;">HIGH PRIORITY</span>'
      : '';

    const repliedBadge = review.has_replied
      ? '<span style="background: #d1fae5; color: #065f46; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; margin-left: 8px;">✓ REPLIED</span>'
      : '<span style="background: #fef3c7; color: #92400e; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; margin-left: 8px;">NEEDS REPLY</span>';

    return `
      <div style="border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; margin-bottom: 16px; ${!review.has_replied ? 'border-left: 4px solid #f59e0b;' : ''}">
        <!-- Review Header -->
        <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 12px; flex-wrap: wrap; gap: 12px;">
          <div style="flex: 1; min-width: 200px;">
            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px; flex-wrap: wrap;">
              <span style="font-size: 18px;">${stars}</span>
              <span style="font-weight: 600;">${review.reviewer_name || 'Anonymous'}</span>
              ${priorityBadge}
              ${repliedBadge}
            </div>
            <div style="font-size: 12px; color: #6b7280;">
              <span style="display: inline-flex; align-items: center; gap: 4px; flex-wrap: wrap;">
                🏢 Google Business • ${new Date(review.create_time).toLocaleDateString()} ${new Date(review.create_time).toLocaleTimeString()}
              </span>
            </div>
          </div>
          <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
            <span style="padding: 4px 8px; border-radius: 4px; background: ${sentimentColor}20; color: ${sentimentColor}; font-size: 12px; font-weight: 600; white-space: nowrap;">
              ${review.sentiment}
            </span>
            ${review.review_type ? `
              <span style="padding: 4px 8px; border-radius: 4px; background: #f3f4f6; color: #374151; font-size: 12px; white-space: nowrap;">
                ${review.review_type}
              </span>
            ` : ''}
          </div>
        </div>

        <!-- Review Text -->
        ${review.comment ? `
          <div style="background: #f9fafb; padding: 12px; border-radius: 6px; margin-bottom: 12px; border-left: 3px solid ${sentimentColor};">
            <div style="font-size: 14px; color: #1f2937; line-height: 1.6;">
              "${review.comment}"
            </div>
          </div>
        ` : '<div style="color: #9ca3af; font-style: italic; margin-bottom: 12px;">No review text provided</div>'}

        ${review.has_replied && review.reply_comment ? `
          <!-- Existing Reply -->
          <div style="background: #d1fae5; padding: 12px; border-radius: 6px; margin-bottom: 12px; border-left: 3px solid #10b981;">
            <div style="font-size: 12px; color: #065f46; font-weight: 600; margin-bottom: 6px;">
              ✓ Your Reply ${review.is_auto_reply ? '(Auto-replied)' : ''}
            </div>
            <div style="font-size: 13px; color: #065f46; line-height: 1.5;">
              ${review.reply_comment}
            </div>
            <div style="font-size: 11px; color: #059669; margin-top: 6px;">
              Posted: ${new Date(review.reply_created_time).toLocaleString()}
            </div>
          </div>
        ` : `
          <!-- AI Suggested Reply -->
          <div style="margin-bottom: 12px;">
            <div style="font-size: 13px; font-weight: 600; color: #374151; margin-bottom: 8px;">
              ✨ AI Suggested Reply:
            </div>
            <textarea
              id="reply-${review.id}"
              style="width: 100%; padding: 10px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 13px; min-height: 100px; font-family: inherit;"
            >${review.ai_suggested_reply || 'Generating...'}</textarea>
            <div style="display: flex; gap: 8px; margin-top: 8px;">
              <button
                onclick="regenerateReply(${review.id}, ${review.star_rating}, '${review.reviewer_name || 'Customer'}', ${JSON.stringify((review.comment || '').replace(/"/g, '&quot;').replace(/'/g, '\\\''))})"
                class="btn btn-secondary"
                style="width: auto; padding: 6px 12px; font-size: 12px;"
              >
                🔄 Regenerate
              </button>
            </div>
          </div>

          <!-- Actions -->
          <div style="display: flex; gap: 8px; justify-content: flex-end; flex-wrap: wrap;">
            <button
              onclick="postReviewReply(${review.id}, false)"
              class="btn btn-primary"
              style="width: auto; padding: 8px 16px; font-size: 13px; flex: 1; min-width: 120px;"
            >
              📤 Post Reply
            </button>
            <button
              onclick="dismissReview(${review.id})"
              style="background: #f3f4f6; color: #6b7280; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-size: 13px; flex: 1; min-width: 80px;"
            >
              Skip
            </button>
          </div>
        `}
      </div>
    `;
  }).join('');
}

// Regenerate AI reply
async function regenerateReply(reviewId, starRating, reviewerName, reviewText) {
  const token = localStorage.getItem('auth_token');
  const textarea = document.getElementById(`reply-${reviewId}`);

  try {
    textarea.value = 'Generating new reply...';

    const response = await fetch('/api/reviews/analyze', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        reviewText,
        starRating,
        reviewerName
      })
    });

    const data = await response.json();

    if (data.success && data.response?.suggested) {
      textarea.value = data.response.suggested;

      // Update in database
      await fetch(`/api/reviews/${reviewId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          ai_suggested_reply: data.response.suggested
        })
      });

      notify('New reply generated!', 'success');
    } else {
      throw new Error(data.error || 'Failed to generate reply');
    }
  } catch (error) {
    console.error('Failed to regenerate reply:', error);
    textarea.value = 'Error generating reply. Please try again.';
    notify('Failed to regenerate reply', 'error');
  }
}

// Post reply to review
async function postReviewReply(reviewId, isAutoReply = false) {
  const replyTextarea = document.getElementById(`reply-${reviewId}`);
  const replyText = replyTextarea.value.trim();

  if (!replyText || replyText === 'Generating...') {
    notify('Please wait for reply to be generated or enter a custom reply', 'warning');
    return;
  }

  if (!confirm('Post this reply to Google Business?')) {
    return;
  }

  const token = localStorage.getItem('auth_token');

  try {
    const response = await fetch('/api/reviews/reply', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        reviewId,
        replyText,
        isAutoReply
      })
    });

    const data = await response.json();

    if (data.success) {
      notify('Reply posted to Google Business successfully!', 'success');
      // Reload reviews to show updated status
      await loadReviews();
    } else {
      notify('Failed to post reply: ' + data.error, 'error');
    }
  } catch (error) {
    console.error('Failed to post reply:', error);
    notify('Failed to post reply. Please try again.', 'error');
  }
}

// Dismiss review
function dismissReview(reviewId) {
  allReviews = allReviews.filter(r => r.id !== reviewId);
  filterReviews();
}

// Toggle review auto-reply globally
async function toggleReviewAutoReply() {
  const enabled = document.getElementById('reviewAutoReplyToggle').checked;
  const token = localStorage.getItem('auth_token');

  try {
    const response = await fetch('/api/reviews/auto-reply/toggle', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ enabled })
    });

    const data = await response.json();

    if (data.success) {
      notify(
        enabled ? 'Review auto-reply enabled! AI will automatically respond to safe reviews.' : 'Review auto-reply disabled.',
        enabled ? 'success' : 'info'
      );
      reloadUserData();
    } else {
      notify('Failed to toggle review auto-reply', 'error');
      // Revert checkbox
      document.getElementById('reviewAutoReplyToggle').checked = !enabled;
    }
  } catch (error) {
    console.error('Failed to toggle review auto-reply:', error);
    notify('Failed to toggle review auto-reply', 'error');
    // Revert checkbox
    document.getElementById('reviewAutoReplyToggle').checked = !enabled;
  }
}

// Populate account selector dropdown
function populateAccountSelector() {
  const container = document.getElementById('reviewAccountSelectorContainer');
  const selector = document.getElementById('reviewAccountSelector');

  if (googleBusinessAccounts.length <= 1) {
    container.style.display = 'none';
    return;
  }

  container.style.display = 'block';
  selector.innerHTML = '<option value="">All Businesses</option>' +
    googleBusinessAccounts.map(account =>
      `<option value="${account.id}" ${account.id === currentAccountId ? 'selected' : ''}>
        ${account.business_name || account.account_display_name || account.location_name}
      </option>`
    ).join('');
}

// Switch to a different Google Business account
function switchReviewAccount() {
  const selector = document.getElementById('reviewAccountSelector');
  currentAccountId = selector.value || null;
  loadReviews();
}

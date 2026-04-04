// ===== AI COMMENT RESPONDER =====

let allComments = [];
let currentFilter = 'all';

// Load comments when tab is switched
async function loadComments() {
  const token = localStorage.getItem('auth_token');
  const commentsList = document.getElementById('commentsList');

  try {
    commentsList.innerHTML = '<div class="loading"><div class="spinner"></div>Loading comments...</div>';

    const response = await fetch('/api/comments/monitor', {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Failed to load comments');
    }

    allComments = data.comments || [];

    // Load auto-reply toggle state
    if (currentUser && currentUser.auto_reply_enabled !== undefined) {
      document.getElementById('autoReplyToggle').checked = currentUser.auto_reply_enabled === 1;
    }

    // Render comments
    renderComments(allComments);

  } catch (error) {
    console.error('Failed to load comments:', error);
    commentsList.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">❌</div>
        <p>Failed to load comments</p>
        <p style="font-size: 13px; color: #6b7280;">${error.message}</p>
      </div>
    `;
  }
}

// Refresh comments
function refreshComments() {
  loadComments();
}

// Filter comments
function filterComments() {
  const filter = document.getElementById('commentFilter').value;
  currentFilter = filter;

  let filteredComments = allComments;

  if (filter === 'needs-review') {
    filteredComments = allComments.filter(c => c.needsReview);
  } else if (filter === 'questions') {
    filteredComments = allComments.filter(c => c.analysis.type === 'question');
  } else if (filter === 'inquiries') {
    filteredComments = allComments.filter(c => c.analysis.type === 'inquiry');
  } else if (filter === 'praise') {
    filteredComments = allComments.filter(c => c.analysis.type === 'praise');
  } else if (filter === 'complaints') {
    filteredComments = allComments.filter(c => c.analysis.type === 'complaint');
  }

  renderComments(filteredComments);
}

// Render comments list
function renderComments(comments) {
  const commentsList = document.getElementById('commentsList');

  if (comments.length === 0) {
    commentsList.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">💬</div>
        <p>No comments found</p>
        <p style="font-size: 13px; color: #6b7280;">Comments from your recent posts will appear here</p>
      </div>
    `;
    return;
  }

  commentsList.innerHTML = comments.map(comment => {
    const sentimentColor = {
      'positive': '#10b981',
      'negative': '#ef4444',
      'neutral': '#6b7280'
    }[comment.analysis.sentiment] || '#6b7280';

    const typeEmoji = {
      'question': '❓',
      'inquiry': '📩',
      'praise': '❤️',
      'complaint': '⚠️',
      'spam': '🚫',
      'general': '💬'
    }[comment.analysis.type] || '💬';

    const priorityBadge = comment.analysis.priority === 'high'
      ? '<span style="background: #fee2e2; color: #991b1b; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; margin-left: 8px;">HIGH PRIORITY</span>'
      : '';

    return `
      <div style="border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; margin-bottom: 16px; ${comment.needsReview ? 'border-left: 4px solid #f59e0b;' : ''}">
        <!-- Comment Header -->
        <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 12px;">
          <div>
            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
              <span style="font-size: 20px;">${typeEmoji}</span>
              <span style="font-weight: 600;">${comment.from}</span>
              ${priorityBadge}
            </div>
            <div style="font-size: 12px; color: #6b7280;">
              <span style="display: inline-flex; align-items: center; gap: 4px;">
                ${comment.platform === 'facebook' ? '📘 Facebook' : '📷 Instagram'}
                • ${new Date(comment.createdAt).toLocaleDateString()} ${new Date(comment.createdAt).toLocaleTimeString()}
              </span>
            </div>
          </div>
          <div style="display: flex; gap: 8px; align-items: center;">
            <span style="padding: 4px 8px; border-radius: 4px; background: ${sentimentColor}20; color: ${sentimentColor}; font-size: 12px; font-weight: 600;">
              ${comment.analysis.sentiment}
            </span>
            <span style="padding: 4px 8px; border-radius: 4px; background: #f3f4f6; color: #374151; font-size: 12px;">
              ${comment.analysis.type}
            </span>
          </div>
        </div>

        <!-- Comment Text -->
        <div style="background: #f9fafb; padding: 12px; border-radius: 6px; margin-bottom: 12px; border-left: 3px solid ${sentimentColor};">
          <div style="font-size: 14px; color: #1f2937; line-height: 1.5;">
            "${comment.commentText}"
          </div>
        </div>

        <!-- AI Analysis -->
        ${comment.analysis.intent ? `
          <div style="background: #eff6ff; padding: 10px 12px; border-radius: 6px; margin-bottom: 12px;">
            <div style="font-size: 12px; color: #1e40af; font-weight: 600; margin-bottom: 4px;">AI Analysis:</div>
            <div style="font-size: 13px; color: #1e40af;">${comment.analysis.intent}</div>
          </div>
        ` : ''}

        <!-- Suggested Reply -->
        <div style="margin-bottom: 12px;">
          <div style="font-size: 13px; font-weight: 600; color: #374151; margin-bottom: 8px;">
            ✨ AI Suggested Reply:
          </div>
          <textarea id="reply-${comment.commentId}" style="width: 100%; padding: 10px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 13px; min-height: 80px; font-family: inherit;">${comment.suggestedReply}</textarea>
        </div>

        <!-- Actions -->
        <div style="display: flex; gap: 8px; justify-content: flex-end;">
          ${comment.autoReplyRecommended ? `
            <button onclick="autoReplyComment('${comment.commentId}', '${comment.platform}')" class="btn btn-secondary" style="width: auto; padding: 8px 16px; font-size: 13px;">
              🤖 Auto-Reply
            </button>
          ` : ''}
          <button onclick="postReply('${comment.commentId}', '${comment.platform}')" class="btn btn-primary" style="width: auto; padding: 8px 16px; font-size: 13px;">
            📤 Post Reply
          </button>
          <button onclick="dismissComment('${comment.commentId}')" style="background: #f3f4f6; color: #6b7280; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-size: 13px;">
            Skip
          </button>
        </div>
      </div>
    `;
  }).join('');
}

// Post reply to comment
async function postReply(commentId, platform) {
  const replyTextarea = document.getElementById(`reply-${commentId}`);
  const replyText = replyTextarea.value.trim();

  if (!replyText) {
    notify('Please enter a reply', 'warning');
    return;
  }

  if (!confirm('Post this reply?')) {
    return;
  }

  const token = localStorage.getItem('auth_token');

  try {
    const response = await fetch('/api/comments/reply', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        platform,
        commentId,
        replyText
      })
    });

    const data = await response.json();

    if (data.success) {
      notify('Reply posted successfully!', 'success');
      // Remove comment from list
      allComments = allComments.filter(c => c.commentId !== commentId);
      filterComments();
    } else {
      notify('Failed to post reply: ' + data.error, 'error');
    }
  } catch (error) {
    console.error('Failed to post reply:', error);
    notify('Failed to post reply. Please try again.', 'error');
  }
}

// Auto-reply to comment (uses suggested reply as-is)
async function autoReplyComment(commentId, platform) {
  const replyTextarea = document.getElementById(`reply-${commentId}`);
  const replyText = replyTextarea.value.trim();

  if (!replyText) {
    notify('No suggested reply available', 'warning');
    return;
  }

  const token = localStorage.getItem('auth_token');

  try {
    const response = await fetch('/api/comments/reply', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        platform,
        commentId,
        replyText
      })
    });

    const data = await response.json();

    if (data.success) {
      notify('Auto-reply posted successfully!', 'success');
      // Remove comment from list
      allComments = allComments.filter(c => c.commentId !== commentId);
      filterComments();
    } else {
      notify('Failed to auto-reply: ' + data.error, 'error');
    }
  } catch (error) {
    console.error('Failed to auto-reply:', error);
    notify('Failed to auto-reply. Please try again.', 'error');
  }
}

// Dismiss comment
function dismissComment(commentId) {
  allComments = allComments.filter(c => c.commentId !== commentId);
  filterComments();
}

// Toggle auto-reply globally
async function toggleAutoReply() {
  const enabled = document.getElementById('autoReplyToggle').checked;
  const token = localStorage.getItem('auth_token');

  try {
    const response = await fetch('/api/comments/auto-reply/toggle', {
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
        enabled ? 'Auto-reply enabled! AI will automatically respond to safe comments.' : 'Auto-reply disabled.',
        enabled ? 'success' : 'info'
      );
      reloadUserData();
    } else {
      notify('Failed to toggle auto-reply', 'error');
      // Revert checkbox
      document.getElementById('autoReplyToggle').checked = !enabled;
    }
  } catch (error) {
    console.error('Failed to toggle auto-reply:', error);
    notify('Failed to toggle auto-reply', 'error');
    // Revert checkbox
    document.getElementById('autoReplyToggle').checked = !enabled;
  }
}

// Show reply history
async function showReplyHistory() {
  const token = localStorage.getItem('auth_token');

  try {
    const response = await fetch('/api/comments/history?limit=50', {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    const data = await response.json();

    if (!data.success) {
      throw new Error(data.error || 'Failed to load history');
    }

    const replies = data.replies || [];

    if (replies.length === 0) {
      notify('No reply history yet!', 'info');
      return;
    }

    // Create modal content
    const historyHTML = `
      <div style="position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); z-index: 1000; display: flex; align-items: center; justify-content: center;" id="historyModal" onclick="closeHistoryModal(event)">
        <div style="background: white; padding: 24px; border-radius: 12px; max-width: 700px; width: 90%; max-height: 80vh; overflow-y: auto;" onclick="event.stopPropagation()">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
            <h3 style="margin: 0;">Reply History</h3>
            <button onclick="closeHistoryModal()" style="background: none; border: none; font-size: 24px; cursor: pointer; color: #6b7280;">×</button>
          </div>

          <div style="display: grid; gap: 16px;">
            ${replies.map(reply => `
              <div style="border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px;">
                <div style="display: flex; justify-content: between; align-items: center; margin-bottom: 12px;">
                  <div style="font-size: 14px; font-weight: 600; color: #374151;">
                    ${reply.platform === 'facebook' ? '📘 Facebook' : '📷 Instagram'}
                    ${reply.was_auto_reply ? '<span style="background: #8b5cf6; color: white; padding: 2px 6px; border-radius: 3px; font-size: 11px; margin-left: 8px;">AUTO</span>' : ''}
                  </div>
                  <div style="font-size: 12px; color: #6b7280;">
                    ${new Date(reply.created_at).toLocaleString()}
                  </div>
                </div>
                ${reply.comment_text ? `
                  <div style="background: #f9fafb; padding: 10px; border-radius: 6px; margin-bottom: 10px; border-left: 3px solid #d1d5db;">
                    <div style="font-size: 12px; color: #6b7280; margin-bottom: 4px;">Original Comment:</div>
                    <div style="font-size: 13px; color: #1f2937;">${reply.comment_text}</div>
                  </div>
                ` : ''}
                <div style="background: #eff6ff; padding: 10px; border-radius: 6px; border-left: 3px solid #3b82f6;">
                  <div style="font-size: 12px; color: #1e40af; margin-bottom: 4px;">Your Reply:</div>
                  <div style="font-size: 13px; color: #1e40af;">${reply.reply_text}</div>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    `;

    // Insert modal into page
    document.body.insertAdjacentHTML('beforeend', historyHTML);

  } catch (error) {
    console.error('Failed to load history:', error);
    notify('Failed to load reply history: ' + error.message, 'error');
  }
}

// Close history modal
function closeHistoryModal(event) {
  if (event && event.target.id !== 'historyModal') {
    return;
  }
  const modal = document.getElementById('historyModal');
  if (modal) {
    modal.remove();
  }
}

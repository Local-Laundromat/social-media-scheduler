// Dashboard JavaScript - Makes all buttons work!

let currentUser = null;
let uploadedFile = null;
let socialAccounts = { facebook: [], instagram: [], tiktok: [] };

/** Ensure social_accounts from API always has array fields (avoids .forEach on undefined). */
function normalizeSocialAccounts(sa) {
  const d = sa && typeof sa === 'object' ? sa : {};
  return {
    facebook: Array.isArray(d.facebook) ? d.facebook : [],
    instagram: Array.isArray(d.instagram) ? d.instagram : [],
    tiktok: Array.isArray(d.tiktok) ? d.tiktok : []
  };
}

// Helper function to safely get platforms array
function getPlatformsArray(platforms) {
  if (Array.isArray(platforms)) {
    return platforms;
  }
  if (typeof platforms === 'string') {
    try {
      return JSON.parse(platforms);
    } catch(e) {
      return [];
    }
  }
  return [];
}

// Check authentication on load
window.addEventListener('DOMContentLoaded', async () => {
  const token = localStorage.getItem('auth_token');

  if (!token) {
    window.location.href = '/login';
    return;
  }

  // Verify token and load user data
  try {
    const response = await fetch('/api/auth/me', {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!response.ok) {
      localStorage.removeItem('auth_token');
      window.location.href = '/login';
      return;
    }

    const data = await response.json();
    currentUser = data.user;
    socialAccounts = normalizeSocialAccounts(data.social_accounts);

    // Update UI
    initializeDashboard();
  } catch (error) {
    console.error('Auth error:', error);
    localStorage.removeItem('auth_token');
    window.location.href = '/login';
  }
});

// Initialize dashboard with user data
function initializeDashboard() {
  // Update welcome message
  document.getElementById('userName').textContent = currentUser.name || currentUser.email;
  document.getElementById('welcomeName').textContent = currentUser.name || 'there';

  // Update connection status
  updateConnectionStatus('facebook', currentUser.facebook_connected, currentUser.facebook_page_name);
  updateConnectionStatus('instagram', currentUser.instagram_connected, currentUser.instagram_username);
  updateConnectionStatus('tiktok', currentUser.tiktok_connected, currentUser.tiktok_username);

  // Load stats and posts
  loadStats();
  loadPosts();

  // Load settings
  loadSettings();

  // Populate account selectors
  populateAccountSelectors();
}

// Update connection status UI
function updateConnectionStatus(platform, connected, accountName) {
  const card = document.getElementById(`${platform}Connection`);
  const status = document.getElementById(`${platform}Status`);
  const details = document.getElementById(`${platform}Details`);
  const btn = document.getElementById(`${platform}Btn`);

  if (connected) {
    card.classList.add('connected');
    status.className = 'status-badge connected';
    status.textContent = 'Connected';
    details.textContent = accountName ? `Connected as ${accountName}` : 'Successfully connected';
    btn.className = 'btn btn-danger';
    btn.textContent = 'Disconnect';
    btn.onclick = () => disconnect(platform);
  } else {
    card.classList.remove('connected');
    status.className = 'status-badge disconnected';
    status.textContent = 'Not Connected';

    let detailsText = '';
    let btnText = '';
    let connectFunc = null;

    if (platform === 'facebook') {
      detailsText = 'Connect your Facebook Business Page';
      btnText = 'Connect Facebook';
      connectFunc = connectFacebook;
    } else if (platform === 'instagram') {
      detailsText = 'Connect your Instagram Business Account';
      btnText = 'Connect Instagram';
      connectFunc = connectInstagram;
    } else if (platform === 'tiktok') {
      detailsText = 'Connect your TikTok Business Account';
      btnText = 'Connect TikTok';
      connectFunc = connectTikTok;
    }

    details.textContent = detailsText;
    btn.className = 'btn btn-primary';
    btn.textContent = btnText;
    btn.onclick = connectFunc;
  }
}

// Connect Facebook
function connectFacebook() {
  const width = 600;
  const height = 700;
  const left = (screen.width - width) / 2;
  const top = (screen.height - height) / 2;

  const popup = window.open(
    `/auth/facebook?user_id=${currentUser.id}&app=direct&name=${encodeURIComponent(currentUser.name || '')}`,
    'Facebook Login',
    `width=${width},height=${height},left=${left},top=${top}`
  );

  const checkPopup = setInterval(() => {
    if (popup.closed) {
      clearInterval(checkPopup);
      reloadUserData();
    }
  }, 500);
}

// Connect Instagram
function connectInstagram() {
  const width = 600;
  const height = 700;
  const left = (screen.width - width) / 2;
  const top = (screen.height - height) / 2;

  const popup = window.open(
    `/auth/instagram?user_id=${currentUser.id}&app=direct&name=${encodeURIComponent(currentUser.name || '')}`,
    'Instagram Login',
    `width=${width},height=${height},left=${left},top=${top}`
  );

  const checkPopup = setInterval(() => {
    if (popup.closed) {
      clearInterval(checkPopup);
      reloadUserData();
    }
  }, 500);
}

// Connect TikTok
function connectTikTok() {
  const width = 600;
  const height = 700;
  const left = (screen.width - width) / 2;
  const top = (screen.height - height) / 2;

  const popup = window.open(
    `/auth/tiktok?user_id=${currentUser.id}&app=direct&name=${encodeURIComponent(currentUser.name || '')}`,
    'TikTok Login',
    `width=${width},height=${height},left=${left},top=${top}`
  );

  const checkPopup = setInterval(() => {
    if (popup.closed) {
      clearInterval(checkPopup);
      reloadUserData();
    }
  }, 500);
}

// Disconnect platform
async function disconnect(platform) {
  if (!confirm(`Are you sure you want to disconnect ${platform}?`)) {
    return;
  }

  const token = localStorage.getItem('auth_token');

  try {
    await fetch(`/api/users/${currentUser.id}/disconnect/${platform}`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` }
    });

    reloadUserData();
  } catch (error) {
    notify('Failed to disconnect. Please try again.', 'error');
  }
}

// Reload user data
async function reloadUserData() {
  const token = localStorage.getItem('auth_token');

  try {
    const response = await fetch('/api/auth/me', {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    const data = await response.json();
    currentUser = data.user;
    socialAccounts = normalizeSocialAccounts(data.social_accounts);

    updateConnectionStatus('facebook', currentUser.facebook_connected, currentUser.facebook_page_name);
    updateConnectionStatus('instagram', currentUser.instagram_connected, currentUser.instagram_username);
    updateConnectionStatus('tiktok', currentUser.tiktok_connected, currentUser.tiktok_username);

    // Repopulate account selectors
    populateAccountSelectors();
  } catch (error) {
    console.error('Failed to reload user data:', error);
  }
}

// Populate account selector dropdowns
function populateAccountSelectors() {
  // Populate Facebook selector
  const fbSelect = document.getElementById('facebookAccountSelect');
  if (fbSelect) {
    fbSelect.innerHTML = '<option value="">Select a Facebook Page...</option>';
    socialAccounts.facebook.forEach(account => {
      const option = document.createElement('option');
      option.value = account.id;
      option.textContent = account.page_name;
      fbSelect.appendChild(option);
    });
    // Auto-select if only one account
    if (socialAccounts.facebook.length === 1) {
      fbSelect.value = socialAccounts.facebook[0].id;
    }
  }

  // Populate Instagram selector
  const igSelect = document.getElementById('instagramAccountSelect');
  if (igSelect) {
    igSelect.innerHTML = '<option value="">Select an Instagram Account...</option>';
    socialAccounts.instagram.forEach(account => {
      const option = document.createElement('option');
      option.value = account.id;
      option.textContent = account.username;
      igSelect.appendChild(option);
    });
    // Auto-select if only one account
    if (socialAccounts.instagram.length === 1) {
      igSelect.value = socialAccounts.instagram[0].id;
    }
  }

  // Populate TikTok selector
  const ttSelect = document.getElementById('tiktokAccountSelect');
  if (ttSelect) {
    ttSelect.innerHTML = '<option value="">Select a TikTok Account...</option>';
    socialAccounts.tiktok.forEach(account => {
      const option = document.createElement('option');
      option.value = account.id;
      option.textContent = account.display_name || 'TikTok Account';
      ttSelect.appendChild(option);
    });
    // Auto-select if only one account
    if (socialAccounts.tiktok.length === 1) {
      ttSelect.value = socialAccounts.tiktok[0].id;
    }
  }

  // Show/hide selectors based on checkbox state
  toggleAccountSelector('facebook');
  toggleAccountSelector('instagram');
  toggleAccountSelector('tiktok');
}

// Toggle account selector visibility based on platform checkbox
function toggleAccountSelector(platform) {
  const checkbox = document.querySelector(`input[name="platform"][value="${platform}"]`);
  const selector = document.getElementById(`${platform}AccountSelector`);

  if (!checkbox || !selector) return;

  const isChecked = checkbox.checked;
  const hasMultipleAccounts = socialAccounts[platform]?.length > 1;

  // Show selector if platform is checked AND user has multiple accounts
  if (isChecked && hasMultipleAccounts) {
    selector.style.display = 'block';
  } else {
    selector.style.display = 'none';
  }
}

// Load stats
async function loadStats() {
  const token = localStorage.getItem('auth_token');

  try {
    const response = await fetch(`/api/users/${currentUser.id}/posts`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    const data = await response.json();
    const posts = data.posts || [];

    const stats = {
      total: posts.length,
      // "pending" or "scheduled" = waiting to be posted
      pending: posts.filter(p => p.status === 'pending' || p.status === 'scheduled').length,
      posted: posts.filter(p => p.status === 'posted').length,
      failed: posts.filter(p => p.status === 'failed' || p.status === 'partial').length
    };

    document.getElementById('statTotal').textContent = stats.total;
    document.getElementById('statPending').textContent = stats.pending;
    document.getElementById('statPosted').textContent = stats.posted;
    document.getElementById('statFailed').textContent = stats.failed;
  } catch (error) {
    console.error('Failed to load stats:', error);
  }
}

// Load posts
// Track selected posts for bulk delete
let selectedPostIds = new Set();

async function loadPosts() {
  const token = localStorage.getItem('auth_token');
  const postsList = document.getElementById('postsList');

  try {
    const response = await fetch(`/api/users/${currentUser.id}/posts`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    const data = await response.json();
    const posts = data.posts || [];

    if (posts.length === 0) {
      postsList.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">📭</div>
          <p>No posts yet. Create your first post!</p>
        </div>
      `;
      return;
    }

    // Clear selections when reloading
    selectedPostIds.clear();

    // Add bulk actions header
    const bulkActionsHeader = `
      <div id="bulkActionsHeader" style="display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; background: #f9fafb; border-radius: 8px; margin-bottom: 16px;">
        <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; font-weight: 500;">
          <input type="checkbox" id="selectAllPosts" onchange="toggleSelectAll()" style="cursor: pointer; width: 16px; height: 16px;">
          <span>Select All (<span id="selectedCount">0</span>/<span id="totalCount">${posts.length}</span>)</span>
        </label>
        <button id="bulkDeleteBtn" onclick="bulkDeletePosts()" class="btn btn-danger" style="width: auto; padding: 8px 16px; display: none;">
          Delete Selected
        </button>
      </div>
    `;

    const postsHTML = posts.map(post => {
      // Handle platforms - could be array or JSON string
      let platforms = post.platforms;
      if (typeof platforms === 'string') {
        platforms = JSON.parse(platforms);
      }
      const platformsStr = Array.isArray(platforms) ? platforms.join(', ') : '';
      const date = new Date(post.created_at).toLocaleDateString();

      return `
        <div class="post-item" style="cursor: pointer;" onclick="togglePostSelection(${post.id}, event)">
          <input type="checkbox" class="post-checkbox" data-post-id="${post.id}" onchange="handlePostCheckbox(${post.id})" onclick="event.stopPropagation()" style="cursor: pointer; width: 18px; height: 18px; margin-right: 12px;">
          <div class="post-image"></div>
          <div class="post-info">
            <div class="post-caption">${post.caption || post.filename}</div>
            <div class="post-meta">
              ${platformsStr} • ${date}
              ${post.scheduled_time ? `• Scheduled: ${new Date(post.scheduled_time).toLocaleString()}` : ''}
            </div>
          </div>
          <div class="post-status ${post.status}">${post.status}</div>
        </div>
      `;
    }).join('');

    postsList.innerHTML = bulkActionsHeader + '<div class="post-list">' + postsHTML + '</div>';
  } catch (error) {
    console.error('Failed to load posts:', error);
    postsList.innerHTML = '<div class="empty-state"><p>Failed to load posts</p></div>';
  }
}

// Toggle select all posts
function toggleSelectAll() {
  const selectAllCheckbox = document.getElementById('selectAllPosts');
  const postCheckboxes = document.querySelectorAll('.post-checkbox');

  postCheckboxes.forEach(checkbox => {
    checkbox.checked = selectAllCheckbox.checked;
    const postId = parseInt(checkbox.dataset.postId);

    if (selectAllCheckbox.checked) {
      selectedPostIds.add(postId);
    } else {
      selectedPostIds.delete(postId);
    }
  });

  updateBulkDeleteButton();
}

// Toggle individual post selection
function togglePostSelection(postId, event) {
  // Don't toggle if clicking on checkbox itself
  if (event.target.type === 'checkbox') return;

  const checkbox = document.querySelector(`.post-checkbox[data-post-id="${postId}"]`);
  checkbox.checked = !checkbox.checked;
  handlePostCheckbox(postId);
}

// Handle individual checkbox change
function handlePostCheckbox(postId) {
  const checkbox = document.querySelector(`.post-checkbox[data-post-id="${postId}"]`);

  if (checkbox.checked) {
    selectedPostIds.add(postId);
  } else {
    selectedPostIds.delete(postId);
  }

  updateSelectAllCheckbox();
  updateBulkDeleteButton();
}

// Update select all checkbox state
function updateSelectAllCheckbox() {
  const selectAllCheckbox = document.getElementById('selectAllPosts');
  const postCheckboxes = document.querySelectorAll('.post-checkbox');
  const totalPosts = postCheckboxes.length;
  const selectedCount = selectedPostIds.size;

  if (selectedCount === 0) {
    selectAllCheckbox.checked = false;
    selectAllCheckbox.indeterminate = false;
  } else if (selectedCount === totalPosts) {
    selectAllCheckbox.checked = true;
    selectAllCheckbox.indeterminate = false;
  } else {
    selectAllCheckbox.checked = false;
    selectAllCheckbox.indeterminate = true;
  }

  document.getElementById('selectedCount').textContent = selectedCount;
}

// Update bulk delete button visibility
function updateBulkDeleteButton() {
  const bulkDeleteBtn = document.getElementById('bulkDeleteBtn');
  const selectedCount = document.getElementById('selectedCount');

  selectedCount.textContent = selectedPostIds.size;

  if (selectedPostIds.size > 0) {
    bulkDeleteBtn.style.display = 'block';
    bulkDeleteBtn.textContent = `Delete ${selectedPostIds.size} Selected`;
  } else {
    bulkDeleteBtn.style.display = 'none';
  }
}

// Bulk delete selected posts
async function bulkDeletePosts() {
  if (selectedPostIds.size === 0) {
    notify('No posts selected', 'warning');
    return;
  }

  const count = selectedPostIds.size;
  if (!confirm(`Are you sure you want to delete ${count} post${count > 1 ? 's' : ''}? This will also attempt to delete them from Facebook, Instagram, and TikTok.`)) {
    return;
  }

  const token = localStorage.getItem('auth_token');
  const postIdsArray = Array.from(selectedPostIds);

  try {
    notify(`Deleting ${count} post${count > 1 ? 's' : ''}...`, 'info');

    const response = await fetch('/api/posts/bulk-delete', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ post_ids: postIdsArray })
    });

    const result = await response.json();

    if (response.ok) {
      notify(`Successfully deleted ${result.results.deleted} post${result.results.deleted > 1 ? 's' : ''}${result.results.failed > 0 ? ` (${result.results.failed} failed)` : ''}`, 'success');
      selectedPostIds.clear();
      loadPosts();
      loadStats();
      renderCalendar(currentCalendarDate);
    } else {
      notify('Failed to delete posts: ' + (result.error || 'Unknown error'), 'error');
    }
  } catch (error) {
    notify('Failed to delete posts: ' + error.message, 'error');
  }
}

// Tab switching
function switchTab(tabName) {
  // Update tabs
  document.querySelectorAll('.tab').forEach(tab => tab.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));

  // Find the tab with matching onclick attribute and make it active
  const tabs = document.querySelectorAll('.tab');
  tabs.forEach(tab => {
    if (tab.getAttribute('onclick') && tab.getAttribute('onclick').includes(`'${tabName}'`)) {
      tab.classList.add('active');
    }
  });

  document.getElementById(`${tabName}Tab`).classList.add('active');

  // Reload data when switching to specific tabs
  if (tabName === 'posts') {
    loadPosts();
    loadStats();
  } else if (tabName === 'calendar') {
    loadCalendar();
  } else if (tabName === 'analytics') {
    loadAnalytics();
  } else if (tabName === 'comments') {
    loadComments();
  }
}

// Handle file upload
function handleFileSelect(event) {
  const file = event.target.files[0];
  if (!file) return;

  uploadedFile = file;

  // Show preview
  const placeholder = document.getElementById('uploadPlaceholder');
  const preview = document.getElementById('uploadPreview');
  const previewImage = document.getElementById('previewImage');

  if (file.type.startsWith('image/')) {
    const reader = new FileReader();
    reader.onload = (e) => {
      previewImage.src = e.target.result;
      placeholder.style.display = 'none';
      preview.style.display = 'block';
    };
    reader.readAsDataURL(file);
  } else {
    placeholder.innerHTML = `
      <div style="font-size: 48px; margin-bottom: 12px;">🎥</div>
      <div style="font-size: 16px; font-weight: 600;">${file.name}</div>
      <div style="font-size: 13px; color: #6b7280;">Video selected</div>
    `;
    preview.style.display = 'none';
  }
}

// Drag and drop
const uploadZone = document.getElementById('uploadZone');

uploadZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  uploadZone.classList.add('dragover');
});

uploadZone.addEventListener('dragleave', () => {
  uploadZone.classList.remove('dragover');
});

uploadZone.addEventListener('drop', (e) => {
  e.preventDefault();
  uploadZone.classList.remove('dragover');

  const file = e.dataTransfer.files[0];
  if (file) {
    document.getElementById('fileInput').files = e.dataTransfer.files;
    handleFileSelect({ target: { files: [file] } });
  }
});

// Toggle schedule time
function toggleScheduleTime() {
  const scheduleType = document.getElementById('scheduleType').value;
  const scheduleTimeGroup = document.getElementById('scheduleTimeGroup');

  if (scheduleType === 'later') {
    scheduleTimeGroup.style.display = 'block';
  } else {
    scheduleTimeGroup.style.display = 'none';
  }
}

function handlePostTypeChange() {
  const postType = document.getElementById('postType').value;
  const hint = document.getElementById('postTypeHint');
  const instagramCheckbox = document.querySelector('input[name="platform"][value="instagram"]');
  const facebookCheckbox = document.querySelector('input[name="platform"][value="facebook"]');
  const tiktokCheckbox = document.querySelector('input[name="platform"][value="tiktok"]');

  if (postType === 'reel') {
    hint.textContent = 'Reels must be vertical videos and can only be posted to Instagram';
    hint.style.color = '#ca8a04';

    // Auto-select Instagram and deselect others for Reels
    if (instagramCheckbox) instagramCheckbox.checked = true;
    if (facebookCheckbox) facebookCheckbox.checked = false;
    if (tiktokCheckbox) tiktokCheckbox.checked = false;
  } else {
    hint.textContent = 'Choose "Instagram Reel" for vertical videos posted to Instagram';
    hint.style.color = '#6b7280';
  }
}

// Generate AI Caption
async function generateAICaption() {
  if (!uploadedFile) {
    notify('Please upload an image first', 'warning');
    return;
  }

  const captionField = document.getElementById('caption');
  const originalText = captionField.value;
  captionField.value = '✨ Generating AI caption...';
  captionField.disabled = true;

  const token = localStorage.getItem('auth_token');

  try {
    // Upload file first
    const formData = new FormData();
    formData.append('file', uploadedFile);

    const uploadResponse = await fetch('/api/upload', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: formData
    });

    const uploadData = await uploadResponse.json();

    // Generate caption
    const captionResponse = await fetch('/api/generate-caption', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        image_url: uploadData.url,
        company: currentUser.company || ''
      })
    });

    const captionData = await captionResponse.json();

    if (captionData.success) {
      captionField.value = captionData.caption;
    } else {
      captionField.value = originalText;
      notify('Failed to generate caption. Please try again.', 'error');
    }
  } catch (error) {
    console.error('AI caption error:', error);
    captionField.value = originalText;
    notify('Failed to generate caption. Please try again.', 'error');
  } finally {
    captionField.disabled = false;
  }
}

// Create post
async function createPost(event) {
  event.preventDefault();

  if (!uploadedFile) {
    notify('Please select a file to upload', 'warning');
    return;
  }

  const caption = document.getElementById('caption').value;
  const postType = document.getElementById('postType').value;
  const platforms = Array.from(document.querySelectorAll('input[name="platform"]:checked'))
    .map(cb => cb.value);
  const scheduleType = document.getElementById('scheduleType').value;
  const scheduledTime = scheduleType === 'later' ? document.getElementById('scheduledTime').value : null;

  if (platforms.length === 0) {
    notify('Please select at least one platform', 'warning');
    return;
  }

  // Validate Reels: must be video and only for Instagram
  if (postType === 'reel') {
    if (uploadedFile && !uploadedFile.type.startsWith('video/')) {
      notify('Instagram Reels must be a video file', 'error');
      return;
    }
    if (platforms.length > 1 || !platforms.includes('instagram')) {
      notify('Instagram Reels can only be posted to Instagram. Please select only Instagram as the platform.', 'warning');
      return;
    }
  }

  // Get selected account IDs
  const selectedAccounts = {};
  if (platforms.includes('facebook')) {
    const fbAccountId = document.getElementById('facebookAccountSelect')?.value;
    if (fbAccountId) selectedAccounts.facebook_account_id = fbAccountId;
    else if (socialAccounts.facebook.length === 1) {
      // Auto-use the only account
      selectedAccounts.facebook_account_id = socialAccounts.facebook[0].id;
    }
  }
  if (platforms.includes('instagram')) {
    const igAccountId = document.getElementById('instagramAccountSelect')?.value;
    if (igAccountId) selectedAccounts.instagram_account_id = igAccountId;
    else if (socialAccounts.instagram.length === 1) {
      selectedAccounts.instagram_account_id = socialAccounts.instagram[0].id;
    }
  }
  if (platforms.includes('tiktok')) {
    const ttAccountId = document.getElementById('tiktokAccountSelect')?.value;
    if (ttAccountId) selectedAccounts.tiktok_account_id = ttAccountId;
    else if (socialAccounts.tiktok.length === 1) {
      selectedAccounts.tiktok_account_id = socialAccounts.tiktok[0].id;
    }
  }

  const token = localStorage.getItem('auth_token');

  try {
    // Upload file
    const formData = new FormData();
    formData.append('file', uploadedFile);

    const uploadResponse = await fetch('/api/upload', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: formData
    });

    const uploadData = await uploadResponse.json();

    // Create post
    const postResponse = await fetch('/api/posts', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        user_id: currentUser.id,
        filename: uploadData.filename,
        filepath: uploadData.path,
        filetype: uploadData.mimetype.startsWith('image/') ? 'image' : 'video',
        caption,
        platforms,
        scheduled_time: scheduledTime,
        post_type: postType,
        ...selectedAccounts  // Include selected account IDs
      })
    });

    const postData = await postResponse.json();

    if (postData.success) {
      notify('Post created successfully!', 'success');

      // Reset form
      document.getElementById('createPostForm').reset();
      uploadedFile = null;
      document.getElementById('uploadPlaceholder').style.display = 'block';
      document.getElementById('uploadPreview').style.display = 'none';

      // Hide account selectors
      document.getElementById('facebookAccountSelector').style.display = 'none';
      document.getElementById('instagramAccountSelector').style.display = 'none';
      document.getElementById('tiktokAccountSelector').style.display = 'none';

      // Reload stats and posts
      loadStats();
      loadPosts();
    } else {
      notify('Failed to create post: ' + (postData.error || 'Unknown error'), 'error');
    }
  } catch (error) {
    console.error('Create post error:', error);
    notify('Failed to create post. Please try again.', 'error');
  }
}

// Load settings
function loadSettings() {
  document.getElementById('apiKeyDisplay').textContent = currentUser.api_key || 'Not available';
  document.getElementById('webhookUrl').value = currentUser.webhook_url || '';
  document.getElementById('settingsEmail').value = currentUser.email;
  document.getElementById('settingsName').value = currentUser.name || '';
  document.getElementById('settingsCompany').value = currentUser.company || '';
  document.getElementById('openaiApiKey').value = currentUser.openai_api_key || '';

  // Load team information
  loadTeamInfo();
}

// Load team information from localStorage
function loadTeamInfo() {
  const team = JSON.parse(localStorage.getItem('team') || 'null');
  const user = JSON.parse(localStorage.getItem('user') || 'null');

  if (team && user) {
    if (user.role === 'owner') {
      // Show team invite section for owners
      document.getElementById('teamInviteSection').style.display = 'block';
      document.getElementById('teamName').textContent = team.name;
      document.getElementById('teamInviteCode').textContent = team.invite_code;
      document.getElementById('teamInfoSection').style.display = 'none';
    } else {
      // Show team info for members
      document.getElementById('teamInfoSection').style.display = 'block';
      document.getElementById('teamInfoName').textContent = team.name;
      document.getElementById('userRole').textContent = user.role.charAt(0).toUpperCase() + user.role.slice(1);
      document.getElementById('teamInviteSection').style.display = 'none';
    }
  }
}

// Copy invite code to clipboard
function copyInviteCode() {
  const team = JSON.parse(localStorage.getItem('team') || 'null');
  if (team && team.invite_code) {
    navigator.clipboard.writeText(team.invite_code).then(() => {
      notify('Invite code copied to clipboard!', 'success');
    });
  }
}

// Copy API key
function copyApiKey() {
  const apiKey = currentUser.api_key;
  navigator.clipboard.writeText(apiKey).then(() => {
    notify('API key copied to clipboard!', 'success');
  });
}

// Save webhook
async function saveWebhook() {
  const webhookUrl = document.getElementById('webhookUrl').value;
  const token = localStorage.getItem('auth_token');

  try {
    await fetch(`/api/users/${currentUser.id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ webhook_url: webhookUrl })
    });

    notify('Webhook URL saved!', 'success');
    reloadUserData();
  } catch (error) {
    notify('Failed to save webhook URL', 'error');
  }
}

// Save profile
async function saveProfile() {
  const name = document.getElementById('settingsName').value;
  const company = document.getElementById('settingsCompany').value;
  const token = localStorage.getItem('auth_token');

  try {
    await fetch(`/api/users/${currentUser.id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ name, company })
    });

    notify('Profile updated!', 'success');
    reloadUserData();
  } catch (error) {
    notify('Failed to update profile', 'error');
  }
}

// Toggle OpenAI key visibility
function toggleOpenAIKeyVisibility() {
  const input = document.getElementById('openaiApiKey');
  input.type = input.type === 'password' ? 'text' : 'password';
}

// Save OpenAI API key
async function saveOpenAIKey() {
  const openaiApiKey = document.getElementById('openaiApiKey').value.trim();
  const token = localStorage.getItem('auth_token');

  try {
    await fetch(`/api/users/${currentUser.id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ openai_api_key: openaiApiKey })
    });

    notify('OpenAI API key saved! AI features are now enabled.', 'success');
    reloadUserData();
  } catch (error) {
    notify('Failed to save OpenAI API key', 'error');
  }
}

// Logout
function logout() {
  localStorage.removeItem('auth_token');
  localStorage.removeItem('user');
  localStorage.removeItem('team');
  window.location.href = '/login';
}

// ===== BULK UPLOAD FUNCTIONALITY =====

let bulkFiles = [];

// Handle bulk file selection
function handleBulkFileSelect(event) {
  const files = Array.from(event.target.files);

  if (files.length === 0) return;

  bulkFiles = files;

  // Update UI
  const placeholder = document.getElementById('bulkUploadPlaceholder');
  const preview = document.getElementById('bulkFilesPreview');
  const countText = document.getElementById('bulkFileCount');

  countText.textContent = `${files.length} file${files.length !== 1 ? 's' : ''} selected`;
  placeholder.style.display = 'none';
  preview.style.display = 'block';
}

// Setup bulk upload drag and drop
window.addEventListener('DOMContentLoaded', () => {
  const bulkUploadZone = document.getElementById('bulkUploadZone');
  if (!bulkUploadZone) return;

  bulkUploadZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    bulkUploadZone.classList.add('dragover');
  });

  bulkUploadZone.addEventListener('dragleave', () => {
    bulkUploadZone.classList.remove('dragover');
  });

  bulkUploadZone.addEventListener('drop', (e) => {
    e.preventDefault();
    bulkUploadZone.classList.remove('dragover');

    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      bulkFiles = files;
      document.getElementById('bulkFileInput').files = e.dataTransfer.files;
      handleBulkFileSelect({ target: { files: files } });
    }
  });
});

// Toggle schedule pattern UI
function toggleSchedulePattern() {
  const pattern = document.getElementById('schedulePattern').value;

  document.getElementById('patternDaily').style.display = 'none';
  document.getElementById('patternWeekly').style.display = 'none';
  document.getElementById('patternSpacing').style.display = 'none';

  if (pattern === 'auto-daily') {
    document.getElementById('patternDaily').style.display = 'block';
  } else if (pattern === 'auto-weekly') {
    document.getElementById('patternWeekly').style.display = 'block';
  } else if (pattern === 'auto-spacing') {
    document.getElementById('patternSpacing').style.display = 'block';
    // Set default start time to tomorrow at 9am
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(9, 0, 0, 0);
    document.getElementById('spacingStartTime').value = tomorrow.toISOString().slice(0, 16);
  }
}

// Calculate schedule times based on pattern
function calculateScheduleTimes(fileCount, pattern) {
  const times = [];
  const now = new Date();

  if (pattern === 'auto-daily') {
    const time = document.getElementById('dailyTime').value.split(':');
    for (let i = 0; i < fileCount; i++) {
      const scheduleDate = new Date();
      scheduleDate.setDate(now.getDate() + i + 1); // Start tomorrow
      scheduleDate.setHours(parseInt(time[0]), parseInt(time[1]), 0, 0);
      times.push(scheduleDate.toISOString());
    }
  } else if (pattern === 'auto-weekly') {
    const selectedDays = Array.from(document.querySelectorAll('input[name="weekday"]:checked'))
      .map(cb => parseInt(cb.value));
    const time = document.getElementById('weeklyTime').value.split(':');

    let currentDate = new Date();
    currentDate.setDate(currentDate.getDate() + 1); // Start tomorrow

    for (let i = 0; i < fileCount; i++) {
      // Find next valid day
      while (!selectedDays.includes(currentDate.getDay())) {
        currentDate.setDate(currentDate.getDate() + 1);
      }

      const scheduleDate = new Date(currentDate);
      scheduleDate.setHours(parseInt(time[0]), parseInt(time[1]), 0, 0);
      times.push(scheduleDate.toISOString());

      currentDate.setDate(currentDate.getDate() + 1); // Move to next day
    }
  } else if (pattern === 'auto-spacing') {
    const startTimeStr = document.getElementById('spacingStartTime').value;
    const startTime = new Date(startTimeStr);
    const spacingValue = parseInt(document.getElementById('spacingValue').value);
    const spacingUnit = document.getElementById('spacingUnit').value;

    const millisPerUnit = spacingUnit === 'hours' ? 3600000 : 86400000; // 1 hour or 1 day in ms

    for (let i = 0; i < fileCount; i++) {
      const scheduleTime = new Date(startTime.getTime() + (i * spacingValue * millisPerUnit));
      times.push(scheduleTime.toISOString());
    }
  }

  return times;
}

// Process bulk upload
async function processBulkUpload() {
  if (bulkFiles.length === 0) {
    notify('Please select files to upload', 'warning');
    return;
  }

  const pattern = document.getElementById('schedulePattern').value;
  const platforms = Array.from(document.querySelectorAll('input[name="bulkPlatform"]:checked'))
    .map(cb => cb.value);
  const defaultCaption = document.getElementById('bulkCaption').value;

  if (platforms.length === 0) {
    notify('Please select at least one platform', 'warning');
    return;
  }

  const token = localStorage.getItem('auth_token');

  // Show loading
  notify(`Uploading ${bulkFiles.length} files... This may take a moment.`, { type: 'info', duration: 6000 });

  try {
    let scheduleTimes = [];

    if (pattern !== 'manual') {
      scheduleTimes = calculateScheduleTimes(bulkFiles.length, pattern);
    }

    // Upload all files
    const uploadedFiles = [];
    for (let i = 0; i < bulkFiles.length; i++) {
      const formData = new FormData();
      formData.append('file', bulkFiles[i]);

      const uploadResponse = await fetch('/api/upload', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData
      });

      const uploadData = await uploadResponse.json();
      uploadedFiles.push(uploadData);
    }

    // Create posts
    const createdPosts = [];
    for (let i = 0; i < uploadedFiles.length; i++) {
      const uploadData = uploadedFiles[i];
      const scheduledTime = scheduleTimes[i] || null;

      const postResponse = await fetch('/api/posts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          user_id: currentUser.id,
          filename: uploadData.filename,
          filepath: uploadData.path,
          filetype: uploadData.mimetype.startsWith('image/') ? 'image' : 'video',
          caption: defaultCaption,
          platforms,
          scheduled_time: scheduledTime
        })
      });

      const postData = await postResponse.json();
      createdPosts.push(postData);
    }

    notify(`Successfully created ${createdPosts.length} posts!`, 'success');

    // Reset form
    bulkFiles = [];
    document.getElementById('bulkFileInput').value = '';
    document.getElementById('bulkUploadPlaceholder').style.display = 'block';
    document.getElementById('bulkFilesPreview').style.display = 'none';
    document.getElementById('bulkCaption').value = '';

    // Switch to posts tab
    switchTab('posts');
    loadStats();
    loadPosts();

  } catch (error) {
    console.error('Bulk upload error:', error);
    notify('Failed to process bulk upload. Please try again.', 'error');
  }
}

// ===== CSV IMPORT FUNCTIONALITY =====

let csvFile = null;

// Toggle upload method (files vs CSV)
function toggleUploadMethod() {
  const method = document.getElementById('uploadMethod').value;
  const csvSection = document.getElementById('csvImportSection');
  const filesSection = document.getElementById('filesUploadSection');

  if (method === 'csv') {
    csvSection.style.display = 'block';
    filesSection.style.display = 'none';
  } else {
    csvSection.style.display = 'none';
    filesSection.style.display = 'block';
  }
}

// Handle CSV file selection
function handleCSVSelect(event) {
  const file = event.target.files[0];
  if (!file) return;

  csvFile = file;

  // Update UI
  const placeholder = document.getElementById('csvUploadPlaceholder');
  const preview = document.getElementById('csvFilePreview');
  const fileName = document.getElementById('csvFileName');

  fileName.textContent = file.name;
  placeholder.style.display = 'none';
  preview.style.display = 'block';
}

// Process CSV import
async function processCSVImport() {
  if (!csvFile) {
    notify('Please select a CSV file', 'warning');
    return;
  }

  const token = localStorage.getItem('auth_token');
  const resultsDiv = document.getElementById('csvImportResults');

  try {
    resultsDiv.innerHTML = '<div class="loading"><div class="spinner"></div>Parsing CSV file...</div>';
    resultsDiv.style.display = 'block';

    // Upload and parse CSV
    const formData = new FormData();
    formData.append('csv', csvFile);

    const response = await fetch('/api/csv/upload', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: formData
    });

    const data = await response.json();

    if (!response.ok) {
      // Show validation errors
      if (data.errors && data.errors.length > 0) {
        resultsDiv.innerHTML = `
          <div style="background: #fee2e2; padding: 16px; border-radius: 8px;">
            <h4 style="color: #991b1b; margin-bottom: 12px;">⚠️ CSV Validation Errors</h4>
            <ul style="margin-left: 20px; color: #991b1b;">
              ${data.errors.map(err => `<li>${err}</li>`).join('')}
            </ul>
            ${data.validPosts > 0 ? `<p style="margin-top: 12px; color: #78350f;">${data.validPosts} valid posts found.</p>` : ''}
          </div>
        `;
        return;
      }
      throw new Error(data.error || 'Failed to parse CSV');
    }

    const posts = data.posts;

    // Show success and posts preview
    resultsDiv.innerHTML = `
      <div style="background: #d1fae5; padding: 16px; border-radius: 8px; margin-bottom: 20px;">
        <h4 style="color: #065f46; margin-bottom: 8px;">✅ Successfully parsed ${posts.length} posts</h4>
        <p style="font-size: 13px; color: #065f46;">Review the posts below and click "Create All Posts" to schedule them.</p>
      </div>

      <div style="max-height: 400px; overflow-y: auto; margin-bottom: 20px;">
        ${posts.map((post, index) => `
          <div style="border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px; margin-bottom: 12px;">
            <div style="font-weight: 600; margin-bottom: 4px;">${index + 1}. ${post.filename}</div>
            <div style="font-size: 13px; color: #6b7280; margin-bottom: 4px;">
              <strong>Caption:</strong> ${post.caption || '(none)'}
            </div>
            <div style="font-size: 13px; color: #6b7280; margin-bottom: 4px;">
              <strong>Platforms:</strong> ${post.platforms}
            </div>
            <div style="font-size: 13px; color: #6b7280;">
              <strong>Scheduled:</strong> ${post.scheduledTime ? new Date(post.scheduledTime).toLocaleString() : 'Not scheduled'}
            </div>
          </div>
        `).join('')}
      </div>

      <button onclick="createPostsFromCSV(${JSON.stringify(posts).replace(/"/g, '&quot;')})" class="btn btn-primary" style="max-width: 250px;">
        Create All ${posts.length} Posts
      </button>
    `;

  } catch (error) {
    console.error('CSV import error:', error);
    resultsDiv.innerHTML = `
      <div style="background: #fee2e2; padding: 16px; border-radius: 8px;">
        <h4 style="color: #991b1b;">❌ Import Failed</h4>
        <p style="color: #991b1b;">${error.message}</p>
      </div>
    `;
  }
}

// Create posts from CSV data
async function createPostsFromCSV(posts) {
  const token = localStorage.getItem('auth_token');
  const resultsDiv = document.getElementById('csvImportResults');

  try {
    resultsDiv.innerHTML = '<div class="loading"><div class="spinner"></div>Creating posts... This may take a moment.</div>';

    const createdPosts = [];
    const errors = [];

    for (let i = 0; i < posts.length; i++) {
      const post = posts[i];

      try {
        // Note: This assumes files are already in the media folder
        const response = await fetch('/api/posts', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            user_id: currentUser.id,
            filename: post.filename,
            filepath: post.filename, // Files should be in media folder
            filetype: post.filename.match(/\.(jpg|jpeg|png|gif)$/i) ? 'image' : 'video',
            caption: post.caption,
            platforms: post.platforms.split(','),
            scheduled_time: post.scheduledTime
          })
        });

        const data = await response.json();
        if (data.success) {
          createdPosts.push(data);
        } else {
          errors.push(`${post.filename}: ${data.error}`);
        }
      } catch (error) {
        errors.push(`${post.filename}: ${error.message}`);
      }
    }

    // Show results
    resultsDiv.innerHTML = `
      <div style="background: #d1fae5; padding: 16px; border-radius: 8px; margin-bottom: 16px;">
        <h4 style="color: #065f46;">✅ Successfully created ${createdPosts.length} posts!</h4>
      </div>

      ${errors.length > 0 ? `
        <div style="background: #fee2e2; padding: 16px; border-radius: 8px;">
          <h4 style="color: #991b1b; margin-bottom: 8px;">⚠️ ${errors.length} posts failed</h4>
          <ul style="margin-left: 20px; color: #991b1b; font-size: 13px;">
            ${errors.map(err => `<li>${err}</li>`).join('')}
          </ul>
        </div>
      ` : ''}
    `;

    // Reset CSV upload
    csvFile = null;
    document.getElementById('csvFileInput').value = '';
    document.getElementById('csvUploadPlaceholder').style.display = 'block';
    document.getElementById('csvFilePreview').style.display = 'none';

    // Refresh data
    loadStats();
    loadPosts();

    // Show success message
    setTimeout(() => {
      if (confirm('Posts created! Would you like to view them?')) {
        switchTab('posts');
      }
    }, 2000);

  } catch (error) {
    console.error('Create posts error:', error);
    resultsDiv.innerHTML = `
      <div style="background: #fee2e2; padding: 16px; border-radius: 8px;">
        <h4 style="color: #991b1b;">❌ Failed to create posts</h4>
        <p style="color: #991b1b;">${error.message}</p>
      </div>
    `;
  }
}

// ===== ENHANCED AI FEATURES =====

// Generate hashtags for caption
async function generateHashtags() {
  const captionField = document.getElementById("caption");
  const caption = captionField.value;

  if (!caption || caption.trim().length === 0) {
    notify('Please write a caption first', 'warning');
    return;
  }

  const token = localStorage.getItem("auth_token");
  const platforms = Array.from(document.querySelectorAll("input[name=\"platform\"]:checked"))
    .map(cb => cb.value);

  try {
    const response = await fetch("/api/generate-hashtags", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify({
        caption,
        industry: currentUser.company || "",
        platforms
      })
    });

    const data = await response.json();

    if (data.success && data.hashtags) {
      const currentCaption = captionField.value.trim();
      const hashtagsStr = "\n\n" + data.hashtags.slice(0, 15).join(" ");
      captionField.value = currentCaption + hashtagsStr;
      notify(`Added ${data.hashtags.length} relevant hashtags!`, 'success');
    } else {
      notify(data.note || 'Failed to generate hashtags', 'error');
    }
  } catch (error) {
    console.error("Hashtag generation error:", error);
    notify('Failed to generate hashtags. Please try again.', 'error');
  }
}

// Translate caption
async function translateCaption() {
  const captionField = document.getElementById("caption");
  const caption = captionField.value;

  if (!caption || caption.trim().length === 0) {
    notify('Please write a caption first', 'warning');
    return;
  }

  const targetLanguage = prompt("Translate to which language?\n(e.g., Spanish, French, German, Japanese)");
  if (!targetLanguage) return;

  const token = localStorage.getItem("auth_token");

  try {
    const response = await fetch("/api/translate-caption", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify({
        caption,
        targetLanguage
      })
    });

    const data = await response.json();

    if (data.success) {
      captionField.value = data.translatedCaption;
      notify(`Caption translated to ${targetLanguage}!`, 'success');
    } else {
      notify(data.error || 'Translation failed', 'error');
    }
  } catch (error) {
    console.error("Translation error:", error);
    notify('Failed to translate caption. Please try again.', 'error');
  }
}

// Optimize caption for platform
async function optimizeCaption() {
  const captionField = document.getElementById("caption");
  const caption = captionField.value;

  if (!caption || caption.trim().length === 0) {
    notify('Please write a caption first', 'warning');
    return;
  }

  const platforms = Array.from(document.querySelectorAll("input[name=\"platform\"]:checked"))
    .map(cb => cb.value);

  if (platforms.length === 0) {
    notify('Please select at least one platform to optimize for', 'warning');
    return;
  }

  let targetPlatform = platforms[0];
  if (platforms.length > 1) {
    targetPlatform = prompt(`Optimize for which platform?\nOptions: ${platforms.join(", ")}`, platforms[0]);
    if (!targetPlatform) return;
  }

  const token = localStorage.getItem("auth_token");

  try {
    const response = await fetch("/api/optimize-caption", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify({
        caption,
        platform: targetPlatform,
        goal: "engagement"
      })
    });

    const data = await response.json();

    if (data.success) {
      if (confirm(`Optimized for ${targetPlatform}!\n\n"${data.optimizedCaption}"\n\nReplace your caption with this?`)) {
        captionField.value = data.optimizedCaption;
      }
    } else {
      notify(data.error || 'Optimization failed', 'error');
    }
  } catch (error) {
    console.error("Optimization error:", error);
    notify('Failed to optimize caption. Please try again.', 'error');
  }
}


// ===== CONTENT CALENDAR =====

let currentCalendarDate = new Date();
let allPosts = [];

// Load calendar when tab is switched
function loadCalendar() {
  renderCalendar(currentCalendarDate);
}

// Render calendar for given month
async function renderCalendar(date) {
  const token = localStorage.getItem('auth_token');

  try {
    // Fetch all posts
    const response = await fetch(`/api/users/${currentUser.id}/posts`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    const data = await response.json();
    allPosts = data.posts || [];

    // Render calendar grid
    const calendar = document.getElementById('calendar');
    const monthYear = document.getElementById('calendarMonthYear');

    const year = date.getFullYear();
    const month = date.getMonth();

    monthYear.textContent = date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

    // Get first and last day of month
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();

    // Clear calendar
    calendar.innerHTML = '';

    // Add day headers
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    dayNames.forEach(day => {
      const header = document.createElement('div');
      header.style.cssText = 'background: #f3f4f6; padding: 12px; font-weight: 600; text-align: center; font-size: 14px;';
      header.textContent = day;
      calendar.appendChild(header);
    });

    // Add empty cells for days before month starts
    for (let i = 0; i < startingDayOfWeek; i++) {
      const emptyCell = document.createElement('div');
      emptyCell.style.cssText = 'background: #fafafa; min-height: 100px;';
      calendar.appendChild(emptyCell);
    }

    // Add day cells
    for (let day = 1; day <= daysInMonth; day++) {
      const dayCell = document.createElement('div');
      dayCell.style.cssText = 'background: white; padding: 8px; min-height: 100px; position: relative; cursor: pointer; transition: background 0.2s;';
      
      // Highlight today
      const today = new Date();
      if (year === today.getFullYear() && month === today.getMonth() && day === today.getDate()) {
        dayCell.style.background = '#fef3c7';
      }

      dayCell.onmouseenter = () => { dayCell.style.background = '#f9fafb'; };
      dayCell.onmouseleave = () => {
        if (year === today.getFullYear() && month === today.getMonth() && day === today.getDate()) {
          dayCell.style.background = '#fef3c7';
        } else {
          dayCell.style.background = 'white';
        }
      };

      // Day number
      const dayNumber = document.createElement('div');
      dayNumber.style.cssText = 'font-weight: 600; margin-bottom: 8px; font-size: 14px;';
      dayNumber.textContent = day;
      dayCell.appendChild(dayNumber);

      // Find posts for this day
      const currentDate = new Date(year, month, day);
      const postsForDay = allPosts.filter(post => {
        if (!post.scheduled_time) return false;
        const postDate = new Date(post.scheduled_time);
        return postDate.toDateString() === currentDate.toDateString();
      });

      // Add post indicators
      const postsContainer = document.createElement('div');
      postsContainer.style.cssText = 'display: flex; flex-direction: column; gap: 4px;';
      
      postsForDay.slice(0, 3).forEach(post => {
        const postIndicator = document.createElement('div');
        const platforms = getPlatformsArray(post.platforms);
        
        // Determine color based on platform
        let color = '#6b7280';
        if (platforms.includes('facebook')) color = '#3b82f6';
        else if (platforms.includes('instagram')) color = '#ec4899';
        else if (platforms.includes('tiktok')) color = '#000000';
        
        // Status color overlay
        if (post.status === 'posted') color = '#10b981';
        else if (post.status === 'pending') color = '#fbbf24';

        postIndicator.style.cssText = `
          background: ${color};
          color: white;
          padding: 4px 6px;
          border-radius: 4px;
          font-size: 11px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          cursor: pointer;
        `;
        postIndicator.textContent = post.caption ? post.caption.substring(0, 20) + '...' : post.filename;
        postIndicator.onclick = (e) => {
          e.stopPropagation();
          showPostDetails(post);
        };
        postsContainer.appendChild(postIndicator);
      });

      if (postsForDay.length > 3) {
        const moreIndicator = document.createElement('div');
        moreIndicator.style.cssText = 'font-size: 11px; color: #6b7280; font-weight: 600; padding: 4px;';
        moreIndicator.textContent = `+${postsForDay.length - 3} more`;
        postsContainer.appendChild(moreIndicator);
      }

      dayCell.appendChild(postsContainer);
      calendar.appendChild(dayCell);
    }

  } catch (error) {
    console.error('Failed to load calendar:', error);
    const calendar = document.getElementById('calendar');
    calendar.innerHTML = '<div style="grid-column: span 7; padding: 40px; text-align: center; color: #6b7280;">Failed to load calendar</div>';
  }
}

// Navigate to previous month
function previousMonth() {
  currentCalendarDate.setMonth(currentCalendarDate.getMonth() - 1);
  renderCalendar(currentCalendarDate);
}

// Navigate to next month
function nextMonth() {
  currentCalendarDate.setMonth(currentCalendarDate.getMonth() + 1);
  renderCalendar(currentCalendarDate);
}

/** Pretty-print structured posting errors (JSON) or plain text; safe for innerHTML. */
function formatPostErrorForDisplay(raw) {
  if (raw == null || raw === '') return '';
  const s = String(raw).trim();
  if (s.startsWith('{')) {
    try {
      const o = JSON.parse(s);
      return JSON.stringify(o, null, 2)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
    } catch (_) {
      /* fall through */
    }
  }
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Show post details in modal
function showPostDetails(post) {
  const modal = document.getElementById('postDetailsModal');
  const content = document.getElementById('modalPostContent');

  const platforms = getPlatformsArray(post.platforms);
  const scheduledTime = post.scheduled_time ? new Date(post.scheduled_time).toLocaleString() : 'Not scheduled';
  const errHtml = formatPostErrorForDisplay(post.error_message);
  
  content.innerHTML = `
    <div style="margin-bottom: 16px;">
      <strong>Filename:</strong> ${post.filename}
    </div>
    <div style="margin-bottom: 16px;">
      <strong>Caption:</strong><br>
      <div style="background: #f3f4f6; padding: 12px; border-radius: 6px; margin-top: 8px;">
        ${post.caption || '(No caption)'}
      </div>
    </div>
    <div style="margin-bottom: 16px;">
      <strong>Platforms:</strong> ${platforms.join(', ')}
    </div>
    <div style="margin-bottom: 16px;">
      <strong>Scheduled:</strong> ${scheduledTime}
    </div>
    <div style="margin-bottom: 16px;">
      <strong>Status:</strong> <span style="padding: 4px 8px; border-radius: 4px; background: ${post.status === 'posted' ? '#d1fae5' : post.status === 'pending' ? '#fef3c7' : '#fee2e2'}; color: ${post.status === 'posted' ? '#065f46' : post.status === 'pending' ? '#92400e' : '#991b1b'};">${post.status}</span>
    </div>
    ${post.error_message ? `
    <div style="margin-bottom: 16px;">
      <strong>Error details:</strong> <span style="color:#6b7280;font-size:12px;">(stage codes help locate the failure)</span><br>
      <pre style="background: #fee2e2; padding: 12px; border-radius: 6px; margin-top: 8px; color: #991b1b; white-space: pre-wrap; font-size: 12px; font-family: ui-monospace, monospace; max-height: 280px; overflow: auto;">${errHtml}</pre>
    </div>
    ` : ''}
    <div style="display: flex; gap: 12px; margin-top: 24px;">
      ${post.status !== 'posted' ? `<button onclick="postNow(${post.id})" class="btn btn-success" style="flex: 1;">Post Now</button>` : ''}
      <button onclick="editPost(${post.id})" class="btn btn-primary" style="flex: 1;">Edit Post</button>
      <button onclick="deletePost(${post.id})" class="btn btn-danger" style="flex: 1;">Delete</button>
    </div>
  `;
  
  modal.style.display = 'flex';
}

// Close post modal
function closePostModal() {
  document.getElementById('postDetailsModal').style.display = 'none';
}

// Edit post (placeholder - would need edit UI)
function editPost(postId) {
  notify('Edit functionality coming soon! Post ID: ' + postId, 'info');
  closePostModal();
}

// Delete post
async function deletePost(postId) {
  if (!confirm('Are you sure you want to delete this post?')) return;

  const token = localStorage.getItem('auth_token');

  try {
    await fetch(`/api/posts/${postId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    });

    notify('Post deleted successfully!', 'success');
    closePostModal();
    renderCalendar(currentCalendarDate);
    loadStats();
  } catch (error) {
    notify('Failed to delete post', 'error');
  }
}

// Post now (manual posting)
async function postNow(postId) {
  if (!confirm('Are you sure you want to post this now to Facebook and Instagram?')) return;

  const token = localStorage.getItem('auth_token');

  try {
    const response = await fetch(`/api/posts/${postId}/post-now`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` }
    });

    const result = await response.json();

    if (response.ok) {
      notify('Post is being published! Check the status in a few moments.', 'success');
      closePostModal();
      renderCalendar(currentCalendarDate);
      loadStats();
    } else {
      notify('Failed to post: ' + (result.error || 'Unknown error'), 'error');
    }
  } catch (error) {
    notify('Failed to post: ' + error.message, 'error');
  }
}

// ===== ANALYTICS DASHBOARD =====

/** Explains "stuck" queue + where to read errors (shown on Analytics tab). */
function setAnalyticsPublishingHint({
  queueCount,
  health,
  pendingDue,
  scheduledOnly,
  failedOnly,
  partialOnly
}) {
  const el = document.getElementById('analyticsPublishingHint');
  if (!el) return;

  const show = queueCount > 0 || failedOnly > 0 || partialOnly > 0;
  if (!show) {
    el.style.display = 'none';
    el.innerHTML = '';
    return;
  }

  el.style.display = 'block';
  const pub = health?.publishing || {};
  const parts = [];

  if (queueCount > 0) {
    parts.push(
      `<strong>In queue (${queueCount})</strong> — not published to social networks yet. ` +
        `Breakdown: <strong>${pendingDue} due now</strong> (status "pending") · <strong>${scheduledOnly}</strong> scheduled for a future time.`
    );
  }

  if (pendingDue > 0) {
    parts.push(
      `Posts <strong>due now</strong> need the server to publish them: either <code style="background:#fff7ed;padding:2px 6px;border-radius:4px;">AUTO_START_SCHEDULER=true</code> with a restart (hourly cron), or open a post in the calendar and use <strong>Post Now</strong>. New posts usually publish within seconds if immediate publish is on (default).`
    );
  }

  if (!pub.immediatePostOnCreate && pendingDue > 0) {
    parts.push(
      `<strong>Immediate publish is off</strong> (<code>IMMEDIATE_POST_ON_CREATE=false</code>). New posts stay pending until the scheduler runs or you click Post Now.`
    );
  }

  if (!health?.scheduler && !pub.autoStartScheduler && queueCount > 0) {
    parts.push(
      `<strong>Scheduler is not running.</strong> Set <code>AUTO_START_SCHEDULER=true</code> in the server environment and restart the Node process.`
    );
  }

  if (failedOnly > 0 || partialOnly > 0) {
    parts.push(
      `<strong>Where errors appear:</strong> Calendar → click a post → <strong>Details</strong> → "Error details" (JSON with <code>stage</code> and Meta <code>fbtrace_id</code> when available). Check the server terminal for <code>[post:ID]</code> or <code>Facebook post error</code>.`
    );
  }

  el.innerHTML = `<div style="max-width: 920px;">${parts.join(' ')}</div>`;
}

// Load analytics when tab is switched
async function loadAnalytics() {
  const token = localStorage.getItem('auth_token');
  const timeRange = document.getElementById('analyticsTimeRange').value;

  try {
    const [postsRes, healthRes] = await Promise.all([
      fetch(`/api/users/${currentUser.id}/posts`, {
        headers: { 'Authorization': `Bearer ${token}` }
      }),
      fetch('/health')
    ]);

    let health = { scheduler: false, publishing: {} };
    try {
      if (healthRes.ok) health = await healthRes.json();
    } catch (_) {
      /* ignore */
    }

    const data = await postsRes.json();
    let posts = data.posts || [];

    // Filter by time range
    if (timeRange !== 'all') {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - parseInt(timeRange));
      posts = posts.filter(post => new Date(post.created_at) >= cutoffDate);
    }

    // Calculate metrics
    const totalPosts = posts.length;
    const successfulPosts = posts.filter(p => p.status === 'posted').length;
    const pendingDue = posts.filter(p => p.status === 'pending').length;
    const scheduledOnly = posts.filter(p => p.status === 'scheduled').length;
    const queueCount = pendingDue + scheduledOnly;
    const failedOnly = posts.filter(p => p.status === 'failed').length;
    const partialOnly = posts.filter(p => p.status === 'partial').length;
    const failedForChart = failedOnly + partialOnly;

    const successRate = totalPosts > 0 ? Math.round((successfulPosts / totalPosts) * 100) : 0;

    setAnalyticsPublishingHint({
      queueCount,
      health,
      pendingDue,
      scheduledOnly,
      failedOnly,
      partialOnly
    });

    const subPending = document.getElementById('analyticsPendingSubline');
    if (subPending) {
      subPending.textContent =
        pendingDue || scheduledOnly
          ? `Breakdown: ${pendingDue} due now · ${scheduledOnly} scheduled for later`
          : '';
    }
    const subFailed = document.getElementById('analyticsFailedSubline');
    if (subFailed) {
      if (failedOnly > 0 || partialOnly > 0) {
        subFailed.textContent = `Breakdown: ${failedOnly} failed · ${partialOnly} partial`;
      } else {
        subFailed.textContent = '';
      }
    }

    // Platform breakdown
    const platformCounts = { facebook: 0, instagram: 0, tiktok: 0 };
    posts.forEach(post => {
      const platforms = getPlatformsArray(post.platforms);
      platforms.forEach(platform => {
        if (platformCounts[platform] !== undefined) {
          platformCounts[platform]++;
        }
      });
    });

    const totalPlatformPosts = Object.values(platformCounts).reduce((a, b) => a + b, 0);
    const mostActivePlatform = Object.entries(platformCounts)
      .sort((a, b) => b[1] - a[1])[0];

    // Update key metrics
    document.getElementById('analyticsTotal').textContent = totalPosts;
    document.getElementById('analyticsSuccessful').textContent = successfulPosts;
    document.getElementById('analyticsSuccessRate').textContent = `${successRate}%`;
    document.getElementById('analyticsMostActive').textContent = 
      mostActivePlatform ? mostActivePlatform[0].charAt(0).toUpperCase() + mostActivePlatform[0].slice(1) : '-';

    // Update platform breakdown
    document.getElementById('analyticsFacebook').textContent = platformCounts.facebook;
    document.getElementById('analyticsInstagram').textContent = platformCounts.instagram;
    document.getElementById('analyticsTikTok').textContent = platformCounts.tiktok;

    if (totalPlatformPosts > 0) {
      document.getElementById('analyticsFacebookRate').textContent = 
        `${Math.round((platformCounts.facebook / totalPlatformPosts) * 100)}% of total posts`;
      document.getElementById('analyticsInstagramRate').textContent = 
        `${Math.round((platformCounts.instagram / totalPlatformPosts) * 100)}% of total posts`;
      document.getElementById('analyticsTikTokRate').textContent = 
        `${Math.round((platformCounts.tiktok / totalPlatformPosts) * 100)}% of total posts`;
    }

    // Update status counts (chart: posted | in queue | failed+partial)
    document.getElementById('analyticsPostedCount').textContent = successfulPosts;
    document.getElementById('analyticsPendingCount').textContent = queueCount;
    document.getElementById('analyticsFailedCount').textContent = failedForChart;

    // Posting patterns
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const dayCounts = [0, 0, 0, 0, 0, 0, 0];
    const hourCounts = new Array(24).fill(0);

    posts.forEach(post => {
      if (post.scheduled_time) {
        const date = new Date(post.scheduled_time);
        dayCounts[date.getDay()]++;
        hourCounts[date.getHours()]++;
      }
    });

    const mostActiveDay = dayCounts.indexOf(Math.max(...dayCounts));
    const mostActiveHour = hourCounts.indexOf(Math.max(...hourCounts));
    
    document.getElementById('analyticsMostActiveDay').textContent = 
      dayCounts[mostActiveDay] > 0 ? dayNames[mostActiveDay] : '-';
    document.getElementById('analyticsMostActiveHour').textContent = 
      hourCounts[mostActiveHour] > 0 ? `${mostActiveHour}:00` : '-';

    // Calculate average posts per day
    const daysInRange = timeRange === 'all' ? 30 : parseInt(timeRange);
    const avgPerDay = (totalPosts / daysInRange).toFixed(1);
    document.getElementById('analyticsAvgPerDay').textContent = avgPerDay;

    // Render charts
    renderStatusChart(successfulPosts, queueCount, failedForChart);
    renderActivityChart(posts, parseInt(timeRange === 'all' ? 30 : timeRange));

  } catch (error) {
    console.error('Failed to load analytics:', error);
  }
}

// Render status distribution chart (simple bar chart)
function renderStatusChart(posted, pending, failed) {
  const canvas = document.getElementById('statusChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  
  const total = posted + pending + failed;
  if (total === 0) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.font = '14px Inter';
    ctx.fillStyle = '#6b7280';
    ctx.textAlign = 'center';
    ctx.fillText('No data to display', canvas.width / 2, canvas.height / 2);
    return;
  }

  const postedPercent = (posted / total) * 100;
  const pendingPercent = (pending / total) * 100;
  const failedPercent = (failed / total) * 100;

  // Set canvas size
  canvas.width = canvas.offsetWidth;
  canvas.height = 200;

  const barHeight = 40;
  const y = (canvas.height - barHeight) / 2;

  // Posted (green)
  ctx.fillStyle = '#10b981';
  ctx.fillRect(0, y, (postedPercent / 100) * canvas.width, barHeight);

  // Pending (yellow)
  ctx.fillStyle = '#fbbf24';
  const pendingX = (postedPercent / 100) * canvas.width;
  ctx.fillRect(pendingX, y, (pendingPercent / 100) * canvas.width, barHeight);

  // Failed (red)
  ctx.fillStyle = '#ef4444';
  const failedX = pendingX + (pendingPercent / 100) * canvas.width;
  ctx.fillRect(failedX, y, (failedPercent / 100) * canvas.width, barHeight);

  // Add labels
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 14px Inter';
  ctx.textAlign = 'center';
  
  if (postedPercent > 10) {
    ctx.fillText(`${Math.round(postedPercent)}%`, (postedPercent / 200) * canvas.width, y + 25);
  }
  if (pendingPercent > 10) {
    ctx.fillText(`${Math.round(pendingPercent)}%`, pendingX + (pendingPercent / 200) * canvas.width, y + 25);
  }
  if (failedPercent > 10) {
    ctx.fillText(`${Math.round(failedPercent)}%`, failedX + (failedPercent / 200) * canvas.width, y + 25);
  }
}

// Render activity chart (line chart)
function renderActivityChart(posts, days) {
  const canvas = document.getElementById('activityChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  // Set canvas size
  canvas.width = canvas.offsetWidth;
  canvas.height = 250;

  const padding = 40;
  const chartWidth = canvas.width - padding * 2;
  const chartHeight = canvas.height - padding * 2;

  // Group posts by day
  const dayCounts = new Array(days).fill(0);
  const today = new Date();
  
  posts.forEach(post => {
    const postDate = new Date(post.created_at);
    const daysAgo = Math.floor((today - postDate) / (1000 * 60 * 60 * 24));
    if (daysAgo >= 0 && daysAgo < days) {
      dayCounts[days - 1 - daysAgo]++;
    }
  });

  const maxCount = Math.max(...dayCounts, 1);

  // Clear canvas
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Draw grid lines
  ctx.strokeStyle = '#e5e7eb';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 5; i++) {
    const y = padding + (i * chartHeight / 5);
    ctx.beginPath();
    ctx.moveTo(padding, y);
    ctx.lineTo(canvas.width - padding, y);
    ctx.stroke();
  }

  // Draw Y-axis labels
  ctx.fillStyle = '#6b7280';
  ctx.font = '12px Inter';
  ctx.textAlign = 'right';
  for (let i = 0; i <= 5; i++) {
    const value = Math.round(maxCount - (i * maxCount / 5));
    const y = padding + (i * chartHeight / 5);
    ctx.fillText(value.toString(), padding - 10, y + 4);
  }

  // Draw line chart
  ctx.strokeStyle = '#facc15';
  ctx.lineWidth = 3;
  ctx.beginPath();

  dayCounts.forEach((count, index) => {
    const x = padding + (index * chartWidth / (days - 1));
    const y = padding + chartHeight - (count / maxCount * chartHeight);
    
    if (index === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  });

  ctx.stroke();

  // Draw points
  ctx.fillStyle = '#ca8a04';
  dayCounts.forEach((count, index) => {
    const x = padding + (index * chartWidth / (days - 1));
    const y = padding + chartHeight - (count / maxCount * chartHeight);
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fill();
  });

  // Draw X-axis labels (show every few days)
  ctx.fillStyle = '#6b7280';
  ctx.font = '11px Inter';
  ctx.textAlign = 'center';
  const labelInterval = Math.ceil(days / 7);
  for (let i = 0; i < days; i += labelInterval) {
    const date = new Date(today);
    date.setDate(date.getDate() - (days - 1 - i));
    const x = padding + (i * chartWidth / (days - 1));
    ctx.fillText(date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), x, canvas.height - 15);
  }
}

// ===== CALENDAR VIEW TOGGLE =====

let currentCalendarView = 'grid'; // 'grid' or 'list'

// Switch between grid and list view
function switchCalendarView(view) {
  currentCalendarView = view;

  // Update button styles
  const gridBtn = document.getElementById('gridViewBtn');
  const listBtn = document.getElementById('listViewBtn');

  if (view === 'grid') {
    gridBtn.style.background = 'white';
    gridBtn.style.color = '#1f2937';
    listBtn.style.background = 'transparent';
    listBtn.style.color = '#6b7280';

    document.getElementById('calendarGridView').style.display = 'block';
    document.getElementById('calendarListView').style.display = 'none';
  } else {
    listBtn.style.background = 'white';
    listBtn.style.color = '#1f2937';
    gridBtn.style.background = 'transparent';
    gridBtn.style.color = '#6b7280';

    document.getElementById('calendarGridView').style.display = 'none';
    document.getElementById('calendarListView').style.display = 'block';

    // Render list view
    renderCalendarList();
  }
}

// Render calendar list view
function renderCalendarList() {
  const calendarList = document.getElementById('calendarList');

  if (!allPosts || allPosts.length === 0) {
    calendarList.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">📅</div>
        <p>No scheduled posts yet. Create some posts to see them here!</p>
      </div>
    `;
    return;
  }

  // Group posts by date
  const postsByDate = {};
  allPosts.forEach(post => {
    if (post.scheduled_time) {
      const postDate = new Date(post.scheduled_time);
      const dateKey = postDate.toDateString();

      if (!postsByDate[dateKey]) {
        postsByDate[dateKey] = [];
      }
      postsByDate[dateKey].push(post);
    }
  });

  // Sort dates
  const sortedDates = Object.keys(postsByDate).sort((a, b) => new Date(a) - new Date(b));

  if (sortedDates.length === 0) {
    calendarList.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">📅</div>
        <p>No scheduled posts. All your posts are unscheduled.</p>
      </div>
    `;
    return;
  }

  // Render posts grouped by date
  calendarList.innerHTML = sortedDates.map(dateKey => {
    const posts = postsByDate[dateKey];
    const date = new Date(dateKey);
    const isToday = date.toDateString() === new Date().toDateString();
    const isPast = date < new Date() && !isToday;

    return `
      <div style="margin-bottom: 32px;">
        <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 16px; padding-bottom: 8px; border-bottom: 2px solid ${isToday ? '#facc15' : '#e5e7eb'};">
          <div style="font-size: 20px; font-weight: 700; color: ${isToday ? '#ca8a04' : isPast ? '#6b7280' : '#1f2937'};">
            ${date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
          </div>
          ${isToday ? '<span style="background: #fef3c7; color: #92400e; padding: 4px 12px; border-radius: 6px; font-size: 13px; font-weight: 600;">Today</span>' : ''}
          ${isPast ? '<span style="background: #f3f4f6; color: #6b7280; padding: 4px 12px; border-radius: 6px; font-size: 13px; font-weight: 600;">Past</span>' : ''}
          <span style="background: #f3f4f6; color: #6b7280; padding: 4px 12px; border-radius: 6px; font-size: 13px; font-weight: 600;">${posts.length} post${posts.length !== 1 ? 's' : ''}</span>
        </div>

        <div style="display: grid; gap: 12px;">
          ${posts.map(post => {
            const platforms = getPlatformsArray(post.platforms);
            const scheduledTime = new Date(post.scheduled_time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

            let statusColor = '#fbbf24';
            let statusBg = '#fef3c7';
            let statusText = post.status || 'scheduled';

            if (post.status === 'posted') {
              statusColor = '#10b981';
              statusBg = '#d1fae5';
              statusText = 'posted';
            } else if (post.status === 'failed') {
              statusColor = '#ef4444';
              statusBg = '#fee2e2';
              statusText = 'failed';
            } else if (post.status === 'partial') {
              statusColor = '#d97706';
              statusBg = '#ffedd5';
              statusText = 'partial';
            } else if (post.status === 'pending') {
              statusColor = '#ca8a04';
              statusBg = '#fef9c3';
              statusText = 'queued';
            } else if (post.status === 'scheduled') {
              statusText = 'scheduled';
            }

            const platformIcons = platforms.map(p => {
              if (p === 'facebook') return '📘';
              if (p === 'instagram') return '📷';
              if (p === 'tiktok') return '🎵';
              return '📱';
            }).join(' ');

            return `
              <div onclick="showPostDetails(${JSON.stringify(post).replace(/"/g, '&quot;')})" style="background: white; border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; cursor: pointer; transition: all 0.2s; display: flex; gap: 16px; align-items: center;" onmouseenter="this.style.boxShadow='0 4px 12px rgba(0,0,0,0.1)'" onmouseleave="this.style.boxShadow='none'">
                <div style="flex-shrink: 0; width: 48px; height: 48px; background: #f3f4f6; border-radius: 6px; display: flex; align-items: center; justify-content: center; font-size: 24px;">
                  ${platformIcons}
                </div>

                <div style="flex: 1; min-width: 0;">
                  <div style="font-weight: 600; color: #1f2937; margin-bottom: 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                    ${post.caption ? post.caption.substring(0, 60) + (post.caption.length > 60 ? '...' : '') : post.filename}
                  </div>
                  <div style="font-size: 13px; color: #6b7280;">
                    ${platforms.map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(', ')} • ${scheduledTime}
                  </div>
                </div>

                <div style="flex-shrink: 0; padding: 6px 12px; border-radius: 6px; background: ${statusBg}; color: ${statusColor}; font-size: 12px; font-weight: 600; text-transform: capitalize;">
                  ${statusText}
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  }).join('');
}

// ===== NEW BULK UPLOAD WORKFLOW =====

// State for new bulk upload workflow
let bulkFilesNew = [];
let bulkPostsConfig = [];
let currentBulkPostIndex = 0;
let bulkConfigMethod = null; // 'bulk' or 'individual'

// Handle new bulk file selection with thumbnail preview
function handleBulkFileSelectNew(event) {
  const files = Array.from(event.target.files);

  if (files.length === 0) return;

  bulkFilesNew = files;

  // Show thumbnail grid
  const placeholder = document.getElementById('bulkUploadPlaceholder');
  const thumbnailGrid = document.getElementById('bulkThumbnailGrid');
  const thumbnailsContainer = document.getElementById('bulkThumbnails');
  const fileCountText = document.getElementById('bulkFileCountText');

  fileCountText.textContent = `${files.length} file${files.length !== 1 ? 's' : ''} selected`;

  // Clear existing thumbnails
  thumbnailsContainer.innerHTML = '';

  // Create thumbnails for each file
  files.forEach((file, index) => {
    const thumbnailDiv = document.createElement('div');
    thumbnailDiv.style.cssText = 'position: relative; aspect-ratio: 1; border-radius: 8px; overflow: hidden; border: 2px solid #e5e7eb;';

    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (e) => {
        thumbnailDiv.style.backgroundImage = `url(${e.target.result})`;
        thumbnailDiv.style.backgroundSize = 'cover';
        thumbnailDiv.style.backgroundPosition = 'center';
      };
      reader.readAsDataURL(file);
    } else {
      // Video thumbnail
      thumbnailDiv.style.cssText += 'background: #1f2937; display: flex; align-items: center; justify-content: center; color: white; font-size: 24px;';
      thumbnailDiv.textContent = '🎥';
    }

    // Add file number badge
    const badge = document.createElement('div');
    badge.style.cssText = 'position: absolute; top: 4px; right: 4px; background: rgba(0,0,0,0.7); color: white; padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: 600;';
    badge.textContent = index + 1;
    thumbnailDiv.appendChild(badge);

    thumbnailsContainer.appendChild(thumbnailDiv);
  });

  placeholder.style.display = 'none';
  thumbnailGrid.style.display = 'block';

  // Show continue button
  document.getElementById('continueToConfigBtn').style.display = 'block';
}

// Show bulk config step
function showBulkConfigStep() {
  document.getElementById('bulkUploadStep').style.display = 'none';
  document.getElementById('bulkConfigStep').style.display = 'block';
  document.getElementById('bulkReviewStep').style.display = 'none';
}

// Show bulk upload step
function showBulkUploadStep() {
  document.getElementById('bulkUploadStep').style.display = 'block';
  document.getElementById('bulkConfigStep').style.display = 'none';
  document.getElementById('bulkReviewStep').style.display = 'none';
}

// Select configuration method
function selectConfigMethod(method) {
  bulkConfigMethod = method;

  // Update card styles
  const bulkCard = document.getElementById('bulkMethodCard');
  const individualCard = document.getElementById('individualMethodCard');

  if (method === 'bulk') {
    bulkCard.style.border = '2px solid #facc15';
    bulkCard.style.background = '#fef3c7';
    individualCard.style.border = '1px solid #e5e7eb';
    individualCard.style.background = 'white';

    document.getElementById('bulkConfigForm').style.display = 'block';
    document.getElementById('individualConfigForm').style.display = 'none';
  } else {
    individualCard.style.border = '2px solid #facc15';
    individualCard.style.background = '#fef3c7';
    bulkCard.style.border = '1px solid #e5e7eb';
    bulkCard.style.background = 'white';

    document.getElementById('bulkConfigForm').style.display = 'none';
    document.getElementById('individualConfigForm').style.display = 'block';

    // Initialize individual config
    currentBulkPostIndex = 0;
    initializeIndividualConfig();
  }
}

// Initialize individual post configuration
function initializeIndividualConfig() {
  const file = bulkFilesNew[currentBulkPostIndex];

  // Update post counter
  document.getElementById('currentPostNum').textContent = currentBulkPostIndex + 1;
  document.getElementById('totalPostsNum').textContent = bulkFilesNew.length;

  // Show preview
  const preview = document.getElementById('currentPostPreview');
  if (file.type.startsWith('image/')) {
    const reader = new FileReader();
    reader.onload = (e) => {
      preview.src = e.target.result;
    };
    reader.readAsDataURL(file);
  } else {
    preview.src = ''; // Could add a video icon placeholder
    preview.alt = 'Video file';
  }

  // Load existing config if available
  if (bulkPostsConfig[currentBulkPostIndex]) {
    const config = bulkPostsConfig[currentBulkPostIndex];
    document.getElementById('individualCaption').value = config.caption || '';
    document.getElementById('individualScheduleTime').value = config.scheduledTime || '';

    // Set platforms
    ['facebook', 'instagram', 'tiktok'].forEach(platform => {
      const checkbox = document.querySelector(`.individual-platform[value="${platform}"]`);
      if (checkbox) {
        checkbox.checked = config.platforms.includes(platform);
      }
    });
  } else {
    // Clear form
    document.getElementById('individualCaption').value = '';
    document.getElementById('individualScheduleTime').value = '';
    document.querySelectorAll('.individual-platform').forEach(cb => cb.checked = false);
  }

  // Update button states
  document.getElementById('prevPostBtn').disabled = currentBulkPostIndex === 0;
  const nextBtn = document.getElementById('nextPostBtn');
  if (currentBulkPostIndex === bulkFilesNew.length - 1) {
    nextBtn.textContent = 'Review All →';
  } else {
    nextBtn.textContent = 'Next →';
  }
}

// Save current post config and move to previous
function previousPost() {
  saveCurrentPostConfig();

  if (currentBulkPostIndex > 0) {
    currentBulkPostIndex--;
    initializeIndividualConfig();
  }
}

// Save current post config and move to next
function nextPost() {
  saveCurrentPostConfig();

  if (currentBulkPostIndex < bulkFilesNew.length - 1) {
    currentBulkPostIndex++;
    initializeIndividualConfig();
  } else {
    // Last post - go to review
    showBulkReviewStep();
  }
}

// Save current individual post configuration
function saveCurrentPostConfig() {
  const caption = document.getElementById('individualCaption').value;
  const scheduledTime = document.getElementById('individualScheduleTime').value;
  const platforms = Array.from(document.querySelectorAll('.individual-platform:checked'))
    .map(cb => cb.value);

  bulkPostsConfig[currentBulkPostIndex] = {
    file: bulkFilesNew[currentBulkPostIndex],
    caption,
    scheduledTime,
    platforms
  };
}

// Generate AI caption for current bulk post
async function generateAIBulkCaption() {
  const file = bulkFilesNew[currentBulkPostIndex];
  if (!file) {
    notify('No file selected', 'warning');
    return;
  }

  const captionField = document.getElementById('individualCaption');
  const originalText = captionField.value;
  captionField.value = '✨ Generating AI caption...';
  captionField.disabled = true;

  const token = localStorage.getItem('auth_token');

  try {
    // Upload file first
    const formData = new FormData();
    formData.append('file', file);

    const uploadResponse = await fetch('/api/upload', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: formData
    });

    const uploadData = await uploadResponse.json();

    // Generate caption
    const captionResponse = await fetch('/api/generate-caption', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        image_url: uploadData.url,
        company: currentUser.company || ''
      })
    });

    const captionData = await captionResponse.json();

    if (captionData.success) {
      captionField.value = captionData.caption;
    } else {
      captionField.value = originalText;
      notify('Failed to generate caption. Please try again.', 'error');
    }
  } catch (error) {
    console.error('AI caption error:', error);
    captionField.value = originalText;
    notify('Failed to generate caption. Please try again.', 'error');
  } finally {
    captionField.disabled = false;
  }
}

// Update schedule preset details
function updateSchedulePresetDetails() {
  const preset = document.getElementById('schedulePreset').value;
  const customOptions = document.getElementById('customScheduleOptions');

  if (preset === 'custom') {
    customOptions.style.display = 'block';
  } else {
    customOptions.style.display = 'none';
  }
}

// Apply bulk settings and move to review
function applyBulkSettings() {
  const caption = document.getElementById('bulkDefaultCaption').value;
  const platforms = Array.from(document.querySelectorAll('input[name="bulkPlatform"]:checked'))
    .map(cb => cb.value);
  const preset = document.getElementById('schedulePreset').value;

  if (platforms.length === 0) {
    notify('Please select at least one platform', 'warning');
    return;
  }

  // Calculate schedule times based on preset
  const scheduleTimes = calculateScheduleTimesFromPreset(bulkFilesNew.length, preset);

  // Create config for all posts
  bulkPostsConfig = bulkFilesNew.map((file, index) => ({
    file,
    caption,
    platforms,
    scheduledTime: scheduleTimes[index]
  }));

  showBulkReviewStep();
}

// Calculate schedule times from preset
function calculateScheduleTimesFromPreset(count, preset) {
  const times = [];
  const now = new Date();
  let startDate = new Date();
  startDate.setDate(startDate.getDate() + 1); // Start tomorrow
  startDate.setHours(9, 0, 0, 0); // Default 9 AM

  if (preset === 'daily') {
    // Once per day
    for (let i = 0; i < count; i++) {
      const scheduleDate = new Date(startDate);
      scheduleDate.setDate(startDate.getDate() + i);
      times.push(scheduleDate.toISOString().slice(0, 16));
    }
  } else if (preset === 'twice-week') {
    // Monday and Thursday
    const targetDays = [1, 4]; // Mon = 1, Thu = 4
    let currentDate = new Date(startDate);

    for (let i = 0; i < count; i++) {
      // Find next Mon or Thu
      while (!targetDays.includes(currentDate.getDay())) {
        currentDate.setDate(currentDate.getDate() + 1);
      }
      times.push(new Date(currentDate).toISOString().slice(0, 16));

      // Move to next valid day
      currentDate.setDate(currentDate.getDate() + 1);
    }
  } else if (preset === 'weekly') {
    // Once per week (Monday)
    for (let i = 0; i < count; i++) {
      const scheduleDate = new Date(startDate);
      scheduleDate.setDate(startDate.getDate() + (i * 7));
      times.push(scheduleDate.toISOString().slice(0, 16));
    }
  } else if (preset === 'three-week') {
    // Mon, Wed, Fri
    const targetDays = [1, 3, 5]; // Mon = 1, Wed = 3, Fri = 5
    let currentDate = new Date(startDate);

    for (let i = 0; i < count; i++) {
      while (!targetDays.includes(currentDate.getDay())) {
        currentDate.setDate(currentDate.getDate() + 1);
      }
      times.push(new Date(currentDate).toISOString().slice(0, 16));
      currentDate.setDate(currentDate.getDate() + 1);
    }
  } else if (preset === 'weekdays') {
    // Mon-Fri
    const targetDays = [1, 2, 3, 4, 5]; // Mon-Fri
    let currentDate = new Date(startDate);

    for (let i = 0; i < count; i++) {
      while (!targetDays.includes(currentDate.getDay())) {
        currentDate.setDate(currentDate.getDate() + 1);
      }
      times.push(new Date(currentDate).toISOString().slice(0, 16));
      currentDate.setDate(currentDate.getDate() + 1);
    }
  } else if (preset === 'custom') {
    // Use manual schedule from form
    const customStartTime = document.getElementById('customStartTime').value;
    const customInterval = parseInt(document.getElementById('customInterval').value) || 1;
    const customUnit = document.getElementById('customIntervalUnit').value;

    const startTime = customStartTime ? new Date(customStartTime) : startDate;
    const millisPerUnit = customUnit === 'hours' ? 3600000 : 86400000;

    for (let i = 0; i < count; i++) {
      const scheduleTime = new Date(startTime.getTime() + (i * customInterval * millisPerUnit));
      times.push(scheduleTime.toISOString().slice(0, 16));
    }
  }

  return times;
}

// Show bulk review step
function showBulkReviewStep() {
  document.getElementById('bulkUploadStep').style.display = 'none';
  document.getElementById('bulkConfigStep').style.display = 'none';
  document.getElementById('bulkReviewStep').style.display = 'block';

  // Update total posts count
  document.getElementById('reviewTotalPosts').textContent = bulkPostsConfig.length;

  // Render review grid
  const reviewGrid = document.getElementById('bulkReviewGrid');
  reviewGrid.innerHTML = '';
  reviewGrid.style.cssText = 'display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 16px; max-height: 500px; overflow-y: auto; padding: 16px; background: #f9fafb; border-radius: 8px;';

  bulkPostsConfig.forEach((config, index) => {
    const reviewItem = document.createElement('div');
    reviewItem.style.cssText = 'border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px; background: white;';

    // Thumbnail
    const thumbnail = document.createElement('div');
    thumbnail.style.cssText = 'width: 100%; aspect-ratio: 1; border-radius: 6px; overflow: hidden; margin-bottom: 8px; background: #f3f4f6;';

    if (config.file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (e) => {
        thumbnail.style.backgroundImage = `url(${e.target.result})`;
        thumbnail.style.backgroundSize = 'cover';
        thumbnail.style.backgroundPosition = 'center';
      };
      reader.readAsDataURL(config.file);
    } else {
      thumbnail.style.cssText += 'display: flex; align-items: center; justify-content: center; font-size: 32px;';
      thumbnail.textContent = '🎥';
    }

    reviewItem.appendChild(thumbnail);

    // Details
    const details = document.createElement('div');
    details.style.cssText = 'font-size: 12px; color: #6b7280;';

    const fileNameDiv = document.createElement('div');
    fileNameDiv.style.cssText = 'font-weight: 600; color: #1f2937; margin-bottom: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;';
    fileNameDiv.textContent = config.file.name;
    details.appendChild(fileNameDiv);

    const captionDiv = document.createElement('div');
    captionDiv.style.cssText = 'margin-bottom: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;';
    captionDiv.textContent = config.caption ? `"${config.caption.substring(0, 30)}..."` : '(No caption)';
    details.appendChild(captionDiv);

    const platformsDiv = document.createElement('div');
    platformsDiv.style.cssText = 'margin-bottom: 4px;';
    platformsDiv.textContent = config.platforms.join(', ') || 'No platforms';
    details.appendChild(platformsDiv);

    const scheduleDiv = document.createElement('div');
    scheduleDiv.style.cssText = 'font-size: 11px;';
    scheduleDiv.textContent = config.scheduledTime ? new Date(config.scheduledTime).toLocaleString() : 'Not scheduled';
    details.appendChild(scheduleDiv);

    reviewItem.appendChild(details);
    reviewGrid.appendChild(reviewItem);
  });
}

// Submit all bulk posts
async function submitBulkPosts() {
  if (bulkPostsConfig.length === 0) {
    notify('No posts to submit', 'warning');
    return;
  }

  // Validate all posts have platforms
  const invalidPosts = bulkPostsConfig.filter(config => !config.platforms || config.platforms.length === 0);
  if (invalidPosts.length > 0) {
    notify(`${invalidPosts.length} posts have no platforms selected. Please go back and select platforms.`, 'warning');
    return;
  }

  const token = localStorage.getItem('auth_token');

  // Show progress
  const reviewGrid = document.getElementById('bulkReviewGrid');
  reviewGrid.innerHTML = '<div style="text-align: center; padding: 40px;"><div class="spinner"></div><p>Uploading and creating posts... This may take a moment.</p></div>';

  console.log('Starting bulk upload of', bulkPostsConfig.length, 'posts');

  try {
    const createdPosts = [];
    const errors = [];

    for (let i = 0; i < bulkPostsConfig.length; i++) {
      const config = bulkPostsConfig[i];
      console.log(`Processing post ${i + 1}/${bulkPostsConfig.length}:`, config.file.name);

      try {
        // Upload file
        const formData = new FormData();
        formData.append('file', config.file);

        console.log('Uploading file:', config.file.name);
        const uploadResponse = await fetch('/api/upload', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` },
          body: formData
        });

        if (!uploadResponse.ok) {
          throw new Error(`Upload failed with status ${uploadResponse.status}`);
        }

        const uploadData = await uploadResponse.json();
        console.log('Upload successful:', uploadData);

        // Create post
        const postPayload = {
          user_id: currentUser.id,
          filename: uploadData.filename,
          filepath: uploadData.path,
          filetype: uploadData.mimetype.startsWith('image/') ? 'image' : 'video',
          caption: config.caption,
          platforms: config.platforms,
          scheduled_time: config.scheduledTime || null
        };

        console.log('Creating post with payload:', postPayload);

        const postResponse = await fetch('/api/posts', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify(postPayload)
        });

        if (!postResponse.ok) {
          throw new Error(`Post creation failed with status ${postResponse.status}`);
        }

        const postData = await postResponse.json();
        console.log('Post creation response:', postData);

        if (postData.success) {
          createdPosts.push(postData);
          console.log(`✓ Post ${i + 1} created successfully`);
        } else {
          const errorMsg = postData.error || 'Unknown error';
          console.error(`✗ Post ${i + 1} failed:`, errorMsg);
          errors.push(`${config.file.name}: ${errorMsg}`);
        }
      } catch (error) {
        console.error(`✗ Error processing ${config.file.name}:`, error);
        errors.push(`${config.file.name}: ${error.message}`);
      }
    }

    console.log('Bulk upload complete:', createdPosts.length, 'succeeded,', errors.length, 'failed');

    // Show results
    if (createdPosts.length > 0) {
      let message = `Successfully created ${createdPosts.length} posts!`;
      if (errors.length > 0) {
        message += `\n\n${errors.length} failed:\n${errors.slice(0, 3).join('\n')}`;
        if (errors.length > 3) {
          message += `\n... and ${errors.length - 3} more`;
        }
      }
      notify(message, errors.length > 0 ? 'warning' : 'success');

      // Reset everything
      bulkFilesNew = [];
      bulkPostsConfig = [];
      currentBulkPostIndex = 0;
      bulkConfigMethod = null;

      document.getElementById('bulkFileInput').value = '';
      showBulkUploadStep();
      document.getElementById('bulkUploadPlaceholder').style.display = 'block';
      document.getElementById('bulkThumbnailGrid').style.display = 'none';

      // Reload data
      loadStats();
      loadPosts();

      // Switch to posts tab
      switchTab('posts');
    } else {
      let errorMessage = 'Failed to create any posts.';
      if (errors.length > 0) {
        errorMessage += '\n\nErrors:\n' + errors.slice(0, 5).join('\n');
      }
      notify(errorMessage, { type: 'error', duration: 10000 });
      console.error('All posts failed. Errors:', errors);
      showBulkReviewStep();
    }

  } catch (error) {
    console.error('Bulk submit error:', error);
    notify('Failed to submit posts: ' + error.message, 'error');
    showBulkReviewStep();
  }
}


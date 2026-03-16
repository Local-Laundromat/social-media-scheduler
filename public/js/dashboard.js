// Dashboard JavaScript - Makes all buttons work!

let currentUser = null;
let uploadedFile = null;

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
    alert('Failed to disconnect. Please try again.');
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

    updateConnectionStatus('facebook', currentUser.facebook_connected, currentUser.facebook_page_name);
    updateConnectionStatus('instagram', currentUser.instagram_connected, currentUser.instagram_username);
    updateConnectionStatus('tiktok', currentUser.tiktok_connected, currentUser.tiktok_username);
  } catch (error) {
    console.error('Failed to reload user data:', error);
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
      pending: posts.filter(p => p.status === 'pending').length,
      posted: posts.filter(p => p.status === 'posted').length,
      failed: posts.filter(p => p.status === 'failed').length
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

    postsList.innerHTML = posts.map(post => {
      const platforms = JSON.parse(post.platforms || '[]').join(', ');
      const date = new Date(post.created_at).toLocaleDateString();

      return `
        <div class="post-item">
          <div class="post-image"></div>
          <div class="post-info">
            <div class="post-caption">${post.caption || post.filename}</div>
            <div class="post-meta">
              ${platforms} • ${date}
              ${post.scheduled_time ? `• Scheduled: ${new Date(post.scheduled_time).toLocaleString()}` : ''}
            </div>
          </div>
          <div class="post-status ${post.status}">${post.status}</div>
        </div>
      `;
    }).join('');
  } catch (error) {
    console.error('Failed to load posts:', error);
    postsList.innerHTML = '<div class="empty-state"><p>Failed to load posts</p></div>';
  }
}

// Tab switching
function switchTab(tabName) {
  // Update tabs
  document.querySelectorAll('.tab').forEach(tab => tab.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));

  event.target.classList.add('active');
  document.getElementById(`${tabName}Tab`).classList.add('active');

  // Reload data when switching to posts tab
  if (tabName === 'posts') {
    loadPosts();
    loadStats();
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

// Generate AI Caption
async function generateAICaption() {
  if (!uploadedFile) {
    alert('Please upload an image first');
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
      alert('Failed to generate caption. Please try again.');
    }
  } catch (error) {
    console.error('AI caption error:', error);
    captionField.value = originalText;
    alert('Failed to generate caption. Please try again.');
  } finally {
    captionField.disabled = false;
  }
}

// Create post
async function createPost(event) {
  event.preventDefault();

  if (!uploadedFile) {
    alert('Please select a file to upload');
    return;
  }

  const caption = document.getElementById('caption').value;
  const platforms = Array.from(document.querySelectorAll('input[name="platform"]:checked'))
    .map(cb => cb.value);
  const scheduleType = document.getElementById('scheduleType').value;
  const scheduledTime = scheduleType === 'later' ? document.getElementById('scheduledTime').value : null;

  if (platforms.length === 0) {
    alert('Please select at least one platform');
    return;
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
        scheduled_time: scheduledTime
      })
    });

    const postData = await postResponse.json();

    if (postData.success) {
      alert('Post created successfully!');

      // Reset form
      document.getElementById('createPostForm').reset();
      uploadedFile = null;
      document.getElementById('uploadPlaceholder').style.display = 'block';
      document.getElementById('uploadPreview').style.display = 'none';

      // Reload stats and posts
      loadStats();
      loadPosts();
    } else {
      alert('Failed to create post: ' + (postData.error || 'Unknown error'));
    }
  } catch (error) {
    console.error('Create post error:', error);
    alert('Failed to create post. Please try again.');
  }
}

// Load settings
function loadSettings() {
  document.getElementById('apiKeyDisplay').textContent = currentUser.api_key || 'Not available';
  document.getElementById('webhookUrl').value = currentUser.webhook_url || '';
  document.getElementById('settingsEmail').value = currentUser.email;
  document.getElementById('settingsName').value = currentUser.name || '';
  document.getElementById('settingsCompany').value = currentUser.company || '';
}

// Copy API key
function copyApiKey() {
  const apiKey = currentUser.api_key;
  navigator.clipboard.writeText(apiKey).then(() => {
    alert('API key copied to clipboard!');
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

    alert('Webhook URL saved!');
    reloadUserData();
  } catch (error) {
    alert('Failed to save webhook URL');
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

    alert('Profile updated!');
    reloadUserData();
  } catch (error) {
    alert('Failed to update profile');
  }
}

// Logout
function logout() {
  localStorage.removeItem('auth_token');
  localStorage.removeItem('user');
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
    alert('Please select files to upload');
    return;
  }

  const pattern = document.getElementById('schedulePattern').value;
  const platforms = Array.from(document.querySelectorAll('input[name="bulkPlatform"]:checked'))
    .map(cb => cb.value);
  const defaultCaption = document.getElementById('bulkCaption').value;

  if (platforms.length === 0) {
    alert('Please select at least one platform');
    return;
  }

  const token = localStorage.getItem('auth_token');

  // Show loading
  alert(`Uploading ${bulkFiles.length} files... This may take a moment.`);

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

    alert(`Successfully created ${createdPosts.length} posts!`);

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
    alert('Failed to process bulk upload. Please try again.');
  }
}

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

  // Reload data when switching to specific tabs
  if (tabName === 'posts') {
    loadPosts();
    loadStats();
  } else if (tabName === 'calendar') {
    loadCalendar();
  } else if (tabName === 'analytics') {
    loadAnalytics();
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
    alert('Please select a CSV file');
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

  if (\!caption || caption.trim().length === 0) {
    alert("Please write a caption first");
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
      const hashtagsStr = "

" + data.hashtags.slice(0, 15).join(" ");
      captionField.value = currentCaption + hashtagsStr;
      alert(`Added ${data.hashtags.length} relevant hashtags\!`);
    } else {
      alert(data.note || "Failed to generate hashtags");
    }
  } catch (error) {
    console.error("Hashtag generation error:", error);
    alert("Failed to generate hashtags. Please try again.");
  }
}

// Translate caption
async function translateCaption() {
  const captionField = document.getElementById("caption");
  const caption = captionField.value;

  if (\!caption || caption.trim().length === 0) {
    alert("Please write a caption first");
    return;
  }

  const targetLanguage = prompt("Translate to which language?
(e.g., Spanish, French, German, Japanese)");
  if (\!targetLanguage) return;

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
      alert(`Caption translated to ${targetLanguage}\!`);
    } else {
      alert(data.error || "Translation failed");
    }
  } catch (error) {
    console.error("Translation error:", error);
    alert("Failed to translate caption. Please try again.");
  }
}

// Optimize caption for platform
async function optimizeCaption() {
  const captionField = document.getElementById("caption");
  const caption = captionField.value;

  if (\!caption || caption.trim().length === 0) {
    alert("Please write a caption first");
    return;
  }

  const platforms = Array.from(document.querySelectorAll("input[name=\"platform\"]:checked"))
    .map(cb => cb.value);

  if (platforms.length === 0) {
    alert("Please select at least one platform to optimize for");
    return;
  }

  let targetPlatform = platforms[0];
  if (platforms.length > 1) {
    targetPlatform = prompt(`Optimize for which platform?
Options: ${platforms.join(", ")}`, platforms[0]);
    if (\!targetPlatform) return;
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
      if (confirm(`Optimized for ${targetPlatform}\!

"${data.optimizedCaption}"

Replace your caption with this?`)) {
        captionField.value = data.optimizedCaption;
      }
    } else {
      alert(data.error || "Optimization failed");
    }
  } catch (error) {
    console.error("Optimization error:", error);
    alert("Failed to optimize caption. Please try again.");
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
        const platforms = JSON.parse(post.platforms || '[]');
        
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

// Show post details in modal
function showPostDetails(post) {
  const modal = document.getElementById('postDetailsModal');
  const content = document.getElementById('modalPostContent');
  
  const platforms = JSON.parse(post.platforms || '[]');
  const scheduledTime = post.scheduled_time ? new Date(post.scheduled_time).toLocaleString() : 'Not scheduled';
  
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
      <strong>Error:</strong><br>
      <div style="background: #fee2e2; padding: 12px; border-radius: 6px; margin-top: 8px; color: #991b1b;">
        ${post.error_message}
      </div>
    </div>
    ` : ''}
    <div style="display: flex; gap: 12px; margin-top: 24px;">
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
  alert('Edit functionality coming soon! Post ID: ' + postId);
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
    
    alert('Post deleted successfully!');
    closePostModal();
    renderCalendar(currentCalendarDate);
    loadStats();
  } catch (error) {
    alert('Failed to delete post');
  }
}

// ===== ANALYTICS DASHBOARD =====

// Load analytics when tab is switched
async function loadAnalytics() {
  const token = localStorage.getItem('auth_token');
  const timeRange = document.getElementById('analyticsTimeRange').value;

  try {
    // Fetch all posts
    const response = await fetch(`/api/users/${currentUser.id}/posts`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    const data = await response.json();
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
    const pendingPosts = posts.filter(p => p.status === 'pending').length;
    const failedPosts = posts.filter(p => p.status === 'failed').length;
    const successRate = totalPosts > 0 ? Math.round((successfulPosts / totalPosts) * 100) : 0;

    // Platform breakdown
    const platformCounts = { facebook: 0, instagram: 0, tiktok: 0 };
    posts.forEach(post => {
      const platforms = JSON.parse(post.platforms || '[]');
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

    // Update status counts
    document.getElementById('analyticsPostedCount').textContent = successfulPosts;
    document.getElementById('analyticsPendingCount').textContent = pendingPosts;
    document.getElementById('analyticsFailedCount').textContent = failedPosts;

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
    renderStatusChart(successfulPosts, pendingPosts, failedPosts);
    renderActivityChart(posts, parseInt(timeRange === 'all' ? 30 : timeRange));

  } catch (error) {
    console.error('Failed to load analytics:', error);
  }
}

// Render status distribution chart (simple bar chart)
function renderStatusChart(posted, pending, failed) {
  const canvas = document.getElementById('statusChart');
  const ctx = canvas.getContext('2d');
  
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
  const ctx = canvas.getContext('2d');

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


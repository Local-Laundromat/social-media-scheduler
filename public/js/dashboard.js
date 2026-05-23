// Dashboard JavaScript - Makes all buttons work!

let currentUser = null;
let teamManager = null;
let uploadedFile = null;
let socialAccounts = { facebook: [], instagram: [], tiktok: [], pinterest: [], youtube: [], google: [] };
let currentGlobalAccount = null; // Global account filter: { platform: 'facebook', accountId: '123', name: 'Page Name' }

/** Ensure social_accounts from API always has array fields (avoids .forEach on undefined). */
function normalizeSocialAccounts(sa) {
  const d = sa && typeof sa === 'object' ? sa : {};
  return {
    facebook: Array.isArray(d.facebook) ? d.facebook : [],
    instagram: Array.isArray(d.instagram) ? d.instagram : [],
    tiktok: Array.isArray(d.tiktok) ? d.tiktok : [],
    pinterest: Array.isArray(d.pinterest) ? d.pinterest : [],
    youtube: Array.isArray(d.youtube) ? d.youtube : [],
    google: Array.isArray(d.google) ? d.google : []
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

const DASHBOARD_FETCH_DEADLINE_MS = 22000;

function fetchWithDeadline(url, options = {}, deadlineMs = DASHBOARD_FETCH_DEADLINE_MS) {
  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), deadlineMs);
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(tid));
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
    const response = await fetchWithDeadline('/api/auth/me', {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!response.ok) {
      if (response.status === 503 || response.status === 504) {
        const el = document.getElementById('userName');
        if (el) el.textContent = 'Server busy';
        if (typeof notify === 'function') {
          notify('The server could not verify your session in time (Supabase auth). Reload in a minute or check hosting logs.', 'error');
        }
        console.error('[Dashboard] Auth unreachable:', response.status, await response.text());
        return;
      }
      console.error('[Dashboard] Auth failed:', response.status, response.statusText);
      const errorText = await response.text();
      console.error('[Dashboard] Response:', errorText);
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
    if (error.name === 'AbortError') {
      const el = document.getElementById('userName');
      if (el) el.textContent = "Can't reach server";
      if (typeof notify === 'function') {
        notify('Request timed out. Check your connection, then reload the page.', 'error');
      }
      console.error('[Dashboard] /api/auth/me timed out or was aborted:', error.message);
      return;
    }
    console.error('[Dashboard] Auth error:', error);
    console.error('[Dashboard] Error details:', error.message, error.stack);
    localStorage.removeItem('auth_token');
    window.location.href = '/login';
  }
});

// Cache for loaded data (avoid redundant API calls)
const dataCache = {
  stats: null,
  posts: null,
  settings: null,
  comments: null,
  analytics: null,
  lastLoaded: {}
};

/** Escape text for safe insertion into HTML attributes / innerHTML */
function escapeHtml(value) {
  if (value == null || value === '') return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/** Sidebar + switcher use the same account list: full team, or one client when an agency client is selected */
function deriveSidebarAccountsForPlatform(platform) {
  if (typeof currentSelectedClient !== 'undefined' && currentSelectedClient && currentSelectedClient.accounts) {
    return normalizeSocialAccounts(currentSelectedClient.accounts)[platform] || [];
  }
  return socialAccounts[platform] || [];
}

function globalAccountFilterPlatform() {
  if (!currentGlobalAccount) return null;
  return currentGlobalAccount.platform === 'google_business' ? 'google' : currentGlobalAccount.platform;
}

/** True if this row is the one chosen in the Social account toolbar filter */
function socialRowMatchesGlobalFilter(platform, account) {
  const g = currentGlobalAccount;
  if (!g) return true;
  const want = String(g.accountId);
  switch (platform) {
    case 'facebook':
      return String(account.page_id ?? '') === want || String(account.id ?? '') === want;
    case 'instagram':
      return (
        String(account.account_id ?? '') === want ||
        String(account.instagram_business_account_id ?? '') === want ||
        String(account.id ?? '') === want
      );
    case 'tiktok':
      return String(account.open_id ?? '') === want || String(account.id ?? '') === want;
    case 'pinterest':
      return (
        String(account.pinterest_user_id ?? '') === want ||
        String(account.account_id ?? '') === want ||
        String(account.username ?? '') === want
      );
    case 'youtube':
      return String(account.channel_id ?? '') === want || String(account.id ?? '') === want;
    case 'google':
      return (
        String(account.location_name ?? '') === want ||
        String(account.location_id ?? '') === want ||
        String(account.id ?? '') === want
      );
    default:
      return true;
  }
}

function refreshSidebarConnectionStatuses() {
  if (!currentUser) return;
  updateConnectionStatus('facebook', currentUser.facebook_connected, currentUser.facebook_page_name);
  updateConnectionStatus('instagram', currentUser.instagram_connected, currentUser.instagram_username);
  updateConnectionStatus('tiktok', currentUser.tiktok_connected, currentUser.tiktok_username);
  updateConnectionStatus('pinterest', currentUser.pinterest_connected, currentUser.pinterest_username);
  updateConnectionStatus('youtube', currentUser.youtube_connected, currentUser.youtube_channel_title);
  updateConnectionStatus('google', currentUser.google_connected, currentUser.google_account_display_name);
}

window.refreshSidebarConnectionStatuses = refreshSidebarConnectionStatuses;

// Initialize dashboard with user data
function initializeDashboard() {
  // Update welcome message
  document.getElementById('userName').textContent = currentUser.name || currentUser.email;
  document.getElementById('welcomeName').textContent = currentUser.name || 'there';

  // Update connection status (respects client + social account filter)
  refreshSidebarConnectionStatuses();

  // ONLY load stats on initial load (lightweight)
  loadStats();

  // Populate account selectors (no API call, just UI)
  populateAccountSelectors();

  // Populate global account switcher
  populateGlobalAccountSwitcher();

  // Populate brand filter dropdown
  populateBrandFilterDropdown();

  handleBillingRedirectQuery();
  applyBillingDeepLink();

  // Initialize team manager if available
  if (window.TeamManager) {
    teamManager = new window.TeamManager();
    teamManager.init(currentUser).catch(err => {
      console.error('Failed to initialize team manager:', err);
    });
  }

  // DEFER: Load posts only when Posts tab is opened
  // DEFER: Load settings only when Settings tab is opened
  // DEFER: Load comments only when Comments tab is opened
  // DEFER: Load analytics only when Analytics tab is opened
}

// Update connection status UI - Now supports multiple accounts per platform
function updateConnectionStatus(platform, connected, accountName) {
  const card = document.getElementById(`${platform}Connection`);
  const status = document.getElementById(`${platform}Status`);
  const details = document.getElementById(`${platform}Details`);
  const btn = document.getElementById(`${platform}Btn`);

  if (!card || !status || !details || !btn) return;

  btn.style.display = '';

  const filterPlat = globalAccountFilterPlatform();
  const allAccounts = deriveSidebarAccountsForPlatform(platform);

  if (currentGlobalAccount && filterPlat && filterPlat !== platform && allAccounts.length > 0) {
    card.classList.add('connected');
    status.className = 'status-badge disconnected';
    status.textContent = 'Hidden';
    details.innerHTML =
      '<p style="font-size: 13px; color: #6b7280; margin: 0;">You are viewing another account in the toolbar. Choose <strong>All accounts</strong> there to show every connection on this screen.</p>';
    btn.style.display = 'none';
    return;
  }

  let accounts = allAccounts;
  if (currentGlobalAccount && filterPlat === platform && allAccounts.length > 1) {
    const filtered = allAccounts.filter((acc) => socialRowMatchesGlobalFilter(platform, acc));
    accounts = filtered.length > 0 ? filtered : allAccounts;
    if (filtered.length === 0 && allAccounts.length > 0) {
      console.warn('[Dashboard] Global filter did not match any row; showing all for', platform);
    }
  }

  // Platform configuration
  const platformConfig = {
    facebook: {
      detailsText: 'Connect your Facebook Business Page',
      btnText: 'Connect Facebook',
      connectFunc: connectFacebook,
      icon: '📘',
      nameField: 'page_name',
      idField: 'page_id'
    },
    instagram: {
      detailsText: 'Connect your Instagram Business Account',
      btnText: 'Connect Instagram',
      connectFunc: connectInstagram,
      icon: '📷',
      nameField: 'username',
      idField: 'account_id'
    },
    tiktok: {
      detailsText: 'Connect your TikTok Business Account',
      btnText: 'Connect TikTok',
      connectFunc: connectTikTok,
      icon: '🎵',
      nameField: 'display_name',
      idField: 'open_id'
    },
    pinterest: {
      detailsText: 'Connect your Pinterest Business Account',
      btnText: 'Connect Pinterest',
      connectFunc: connectPinterest,
      icon: '📌',
      nameField: 'username',
      idField: 'account_id'
    },
    youtube: {
      detailsText: 'Connect your YouTube Channel',
      btnText: 'Connect YouTube',
      connectFunc: connectYouTube,
      icon: '📺',
      nameField: 'channel_title',
      idField: 'channel_id'
    },
    google: {
      detailsText: 'Connect your Google Business Profile',
      btnText: 'Connect Google Business',
      connectFunc: connectGoogle,
      icon: '🏢',
      nameField: 'location_title',
      idField: 'location_name'
    }
  };

  const config = platformConfig[platform];
  if (!config) return;

  if (accounts.length > 0) {
    // CONNECTED STATE - Show list of accounts
    card.classList.add('connected');
    status.className = 'status-badge connected';
    status.textContent = `Connected (${accounts.length})`;

    // Build account list HTML
    let accountListHTML = '<div style="margin-bottom: 12px;">';
    accounts.forEach((account, index) => {
      const rawName = account[config.nameField] || account.account_name || 'Account ' + (index + 1);
      const accountDisplayName = escapeHtml(rawName);
      accountListHTML += `
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px 0; ${index < accounts.length - 1 ? 'border-bottom: 1px solid #e5e7eb;' : ''}">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span>${config.icon}</span>
            <span style="font-weight: 500;">${accountDisplayName}</span>
          </div>
          <button onclick="disconnectAccount('${platform}', ${account.id})" class="btn btn-danger" style="padding: 4px 12px; font-size: 13px; width: auto;">
            Disconnect
          </button>
        </div>
      `;
    });
    accountListHTML += '</div>';

    details.innerHTML = accountListHTML;

    // Change button to "Add Another Account"
    btn.className = 'btn btn-primary';
    btn.textContent = `+ Add Another ${platform.charAt(0).toUpperCase() + platform.slice(1)} Account`;
    btn.onclick = config.connectFunc;

  } else {
    // DISCONNECTED STATE - Show connect button
    card.classList.remove('connected');
    status.className = 'status-badge disconnected';
    status.textContent = 'Not Connected';

    details.textContent = config.detailsText;
    btn.className = 'btn btn-primary';
    btn.textContent = config.btnText;
    btn.onclick = config.connectFunc;
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

// Connect Pinterest
function connectPinterest() {
  const width = 600;
  const height = 700;
  const left = (screen.width - width) / 2;
  const top = (screen.height - height) / 2;

  const popup = window.open(
    `/auth/pinterest?user_id=${currentUser.id}&app=direct&name=${encodeURIComponent(currentUser.name || '')}`,
    'Pinterest Login',
    `width=${width},height=${height},left=${left},top=${top}`
  );

  const checkPopup = setInterval(() => {
    if (popup.closed) {
      clearInterval(checkPopup);
      reloadUserData();
    }
  }, 500);
}

// Connect YouTube
function connectYouTube() {
  const width = 600;
  const height = 700;
  const left = (screen.width - width) / 2;
  const top = (screen.height - height) / 2;

  const popup = window.open(
    `/auth/youtube?user_id=${currentUser.id}&app=direct&name=${encodeURIComponent(currentUser.name || '')}`,
    'YouTube Login',
    `width=${width},height=${height},left=${left},top=${top}`
  );

  const checkPopup = setInterval(() => {
    if (popup.closed) {
      clearInterval(checkPopup);
      reloadUserData();
    }
  }, 500);
}

// Connect Google Business Profile
function connectGoogle() {
  const width = 600;
  const height = 700;
  const left = (screen.width - width) / 2;
  const top = (screen.height - height) / 2;

  const popup = window.open(
    `/auth/google?user_id=${currentUser.id}&app=direct&name=${encodeURIComponent(currentUser.name || '')}`,
    'Google Business Login',
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

// Disconnect a specific account (for multi-account management)
async function disconnectAccount(platform, accountId) {
  // Find the account name for confirmation message (same scope as sidebar: team or agency client)
  const accounts = deriveSidebarAccountsForPlatform(platform);
  const account = accounts.find(acc => acc.id === accountId);
  const accountName = account ? (account.page_name || account.username || account.display_name || account.channel_title || account.location_title || 'this account') : 'this account';

  if (!confirm(`Are you sure you want to disconnect ${accountName}?`)) {
    return;
  }

  const token = localStorage.getItem('auth_token');

  try {
    const response = await fetch(`/api/users/${currentUser.id}/disconnect/${platform}/${accountId}`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (response.ok) {
      notify(`${accountName} disconnected successfully`, 'success');
      reloadUserData();
    } else {
      throw new Error('Failed to disconnect account');
    }
  } catch (error) {
    console.error('Disconnect error:', error);
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

    refreshSidebarConnectionStatuses();

    // Repopulate account selectors & toolbar switcher
    populateAccountSelectors();
    populateGlobalAccountSwitcher();
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

  // Populate YouTube selector
  const ytSelect = document.getElementById('youtubeAccountSelect');
  if (ytSelect) {
    ytSelect.innerHTML = '<option value="">Select a YouTube Channel...</option>';
    socialAccounts.youtube.forEach(account => {
      const option = document.createElement('option');
      option.value = account.id;
      option.textContent = account.channel_title;
      ytSelect.appendChild(option);
    });
    // Auto-select if only one account
    if (socialAccounts.youtube.length === 1) {
      ytSelect.value = socialAccounts.youtube[0].id;
    }
  }

  // Populate Google Business selector
  const gbSelect = document.getElementById('googleAccountSelect');
  if (gbSelect) {
    gbSelect.innerHTML = '<option value="">Select a Google Business Profile...</option>';
    socialAccounts.google.forEach(account => {
      const option = document.createElement('option');
      option.value = account.id;
      option.textContent = account.location_title || account.account_display_name;
      gbSelect.appendChild(option);
    });
    // Auto-select if only one account
    if (socialAccounts.google.length === 1) {
      gbSelect.value = socialAccounts.google[0].id;
    }
  }

  // Show/hide selectors based on checkbox state
  toggleAccountSelector('facebook');
  toggleAccountSelector('instagram');
  toggleAccountSelector('tiktok');
  toggleAccountSelector('youtube');
  toggleAccountSelector('google');
}

// Populate brand filter dropdowns (posts, analytics, calendar)
async function populateBrandFilterDropdown() {
  try {
    const token = localStorage.getItem('auth_token');
    const response = await fetch('/api/brands', {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!response.ok) return;

    const data = await response.json();
    const brands = data.brands || [];

    // Populate Posts tab brand filter
    const postsFilter = document.getElementById('postsFilterBrand');
    if (postsFilter) {
      postsFilter.innerHTML = '<option value="">All Posts (No Brand Filter)</option>';
      brands.forEach(brand => {
        const option = document.createElement('option');
        option.value = brand.id;
        option.textContent = brand.name;
        postsFilter.appendChild(option);
      });
    }

    // Populate Analytics tab brand filter
    const analyticsFilter = document.getElementById('analyticsFilterBrand');
    if (analyticsFilter) {
      analyticsFilter.innerHTML = '<option value="">All Brands</option>';
      brands.forEach(brand => {
        const option = document.createElement('option');
        option.value = brand.id;
        option.textContent = brand.name;
        analyticsFilter.appendChild(option);
      });
    }

    // Populate Calendar tab brand filter (will add later)
    const calendarFilter = document.getElementById('calendarFilterBrand');
    if (calendarFilter) {
      calendarFilter.innerHTML = '<option value="">All Brands</option>';
      brands.forEach(brand => {
        const option = document.createElement('option');
        option.value = brand.id;
        option.textContent = brand.name;
        calendarFilter.appendChild(option);
      });
    }
  } catch (error) {
    console.error('Error loading brands for filters:', error);
  }
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

// Load stats (same filters as posts list: agency client + global account switcher)
async function loadStats() {
  const token = localStorage.getItem('auth_token');

  try {
    let url = `/api/users/${currentUser.id}/posts`;
    const params = new URLSearchParams();

    if (typeof currentGlobalAccount !== 'undefined' && currentGlobalAccount) {
      params.set('platform', currentGlobalAccount.platform);
      params.set('accountId', currentGlobalAccount.accountId);
    }

    if (typeof currentSelectedClient !== 'undefined' && currentSelectedClient) {
      params.set('client_id', currentSelectedClient.id);
    }

    if (params.toString()) {
      url += `?${params.toString()}`;
    }

    const response = await fetch(url, {
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

    // Cache the stats data and update timestamp
    dataCache.stats = stats;
    dataCache.lastLoaded.stats = Date.now();
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
    // Build URL with optional account, client, and brand filters
    let url = `/api/users/${currentUser.id}/posts`;
    const params = new URLSearchParams();

    if (currentGlobalAccount) {
      params.set('platform', currentGlobalAccount.platform);
      params.set('accountId', currentGlobalAccount.accountId);
    }

    if (currentSelectedClient) {
      params.set('client_id', currentSelectedClient.id);
    }

    // Add brand filter
    const brandFilter = document.getElementById('postsFilterBrand');
    if (brandFilter && brandFilter.value) {
      params.set('brand_profile_id', brandFilter.value);
    }

    if (params.toString()) {
      url += `?${params.toString()}`;
    }

    const response = await fetch(url, {
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

    // Cache the posts data and update timestamp
    dataCache.posts = posts;
    dataCache.lastLoaded.posts = Date.now();
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
    if (tab.getAttribute('data-tab') === tabName) {
      tab.classList.add('active');
    }
  });

  document.getElementById(`${tabName}Tab`).classList.add('active');

  // LAZY LOAD with cache checking
  const cacheExpiry = 5 * 60 * 1000; // 5 minutes
  const now = Date.now();

  if (tabName === 'posts') {
    const cacheAge = now - (dataCache.lastLoaded.posts || 0);
    if (!dataCache.posts || cacheAge > cacheExpiry) {
      loadPosts();
      loadStats();
    }
  } else if (tabName === 'calendar') {
    const cacheAge = now - (dataCache.lastLoaded.calendar || 0);
    if (cacheAge > cacheExpiry) {
      loadCalendar();
    }
  } else if (tabName === 'analytics') {
    const cacheAge = now - (dataCache.lastLoaded.analytics || 0);
    if (!dataCache.analytics || cacheAge > cacheExpiry) {
      loadAnalytics();
    }
  } else if (tabName === 'settings') {
    const cacheAge = now - (dataCache.lastLoaded.settings || 0);
    if (!dataCache.settings || cacheAge > cacheExpiry) {
      loadSettings();
    }
  } else if (tabName === 'comments') {
    const cacheAge = now - (dataCache.lastLoaded.comments || 0);
    if (!dataCache.comments || cacheAge > cacheExpiry) {
      loadComments();
    }
  } else if (tabName === 'reviews') {
    const cacheAge = now - (dataCache.lastLoaded.reviews || 0);
    if (!dataCache.reviews || cacheAge > cacheExpiry) {
      loadReviews();
      dataCache.lastLoaded.reviews = now;
    }
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
  } else if (postType === 'story') {
    hint.textContent = 'Stories are 24-hour posts and can only be posted to Facebook';
    hint.style.color = '#ca8a04';

    // Auto-select Facebook and deselect others for Stories
    if (facebookCheckbox) facebookCheckbox.checked = true;
    if (instagramCheckbox) instagramCheckbox.checked = false;
    if (tiktokCheckbox) tiktokCheckbox.checked = false;
  } else {
    hint.textContent = 'Choose "Instagram Reel" for vertical videos or "Facebook Story" for 24-hour posts';
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

  // Validate Stories: only for Facebook
  if (postType === 'story') {
    if (platforms.length > 1 || !platforms.includes('facebook')) {
      notify('Facebook Stories can only be posted to Facebook. Please select only Facebook as the platform.', 'warning');
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
        ...selectedAccounts,  // Include selected account IDs
        client_id: currentSelectedClient?.id || null  // Include client context
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

  // Load brand voice settings
  const brandVoice = currentUser.brand_voice || {};
  document.getElementById('brandVoiceTone').value = brandVoice.tone || 'friendly';
  document.getElementById('customVoiceDescription').value = brandVoice.custom_description || '';
  document.getElementById('emojiUsage').value = brandVoice.emoji_usage || 'moderate';
  document.getElementById('responseLength').value = brandVoice.response_length || 'medium';
  document.getElementById('brandContactEmail').value = brandVoice.contact_email || '';
  document.getElementById('brandContactPhone').value = brandVoice.contact_phone || '';

  // Show/hide custom voice description based on tone
  const customVoiceGroup = document.getElementById('customVoiceGroup');
  if (brandVoice.tone === 'custom') {
    customVoiceGroup.style.display = 'block';
  } else {
    customVoiceGroup.style.display = 'none';
  }

  // Load team information
  loadTeamInfo();

  refreshBillingStatus();

  // Cache the settings data and update timestamp
  dataCache.settings = true; // Settings don't need to store data, just mark as loaded
  dataCache.lastLoaded.settings = Date.now();
}

/** After Stripe redirects back to `/dashboard` */
function handleBillingRedirectQuery() {
  const u = new URL(window.location.href);
  const b = u.searchParams.get('billing');
  if (!b) return;

  if (b === 'success') {
    if (typeof notify === 'function') {
      notify('Checkout finished — syncing your subscription from Stripe (may take a few seconds).', 'success');
    }
    switchTab('settings');
    switchSettingsPane('subscription');
    reloadUserData();
    setTimeout(() => refreshBillingStatus(), 2000);
  } else if (b === 'cancel') {
    if (typeof notify === 'function') notify('Checkout was cancelled.', 'warning');
    switchTab('settings');
    switchSettingsPane('subscription');
    refreshBillingStatus();
  } else if (b === 'portal') {
    if (typeof notify === 'function') notify('Welcome back.', 'success');
    switchTab('settings');
    switchSettingsPane('subscription');
    reloadUserData();
    refreshBillingStatus();
  }

  u.searchParams.delete('billing');
  const qs = u.searchParams.toString();
  const next = qs ? `${u.pathname}?${qs}` : u.pathname;
  window.history.replaceState({}, '', next);
}

function switchSettingsPane(paneName) {
  const generalPane = document.getElementById('settingsPaneGeneral');
  const subscriptionPane = document.getElementById('settingsPaneSubscription');
  if (!generalPane || !subscriptionPane || !paneName) return;

  document.querySelectorAll('.settings-inner-tab').forEach((btn) => {
    const matches = btn.getAttribute('data-settings-pane') === paneName;
    btn.classList.toggle('active', matches);
    btn.setAttribute('aria-selected', matches ? 'true' : 'false');
  });

  generalPane.classList.toggle('active', paneName === 'general');
  subscriptionPane.classList.toggle('active', paneName === 'subscription');
}

/** Open Settings → Subscription from marketing links (`#billing`, `#billingSection`, etc.) */
function applyBillingDeepLink() {
  const raw = window.location.hash ? window.location.hash.slice(1).toLowerCase() : '';
  if (!raw) return;
  const open =
    raw === 'billing' ||
    raw === 'billingsection' ||
    raw === 'subscription' ||
    raw === 'plans';

  if (open) {
    switchTab('settings');
    switchSettingsPane('subscription');
    requestAnimationFrame(() => {
      document.getElementById('billingSection')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }
}

function billingCatalogKeyLabel(key) {
  if (!key && key !== 0) return '';
  return String(key)
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatUsdCatalogPrice(n) {
  if (n == null || !Number.isFinite(Number(n))) return null;
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' }).format(Number(n));
  } catch (_) {
    return `$${Number(n).toFixed(2)}`;
  }
}

function formatStripeMoneyMinor(unitAmount, currency) {
  const ccy = String(currency || 'usd').toUpperCase();
  const amount = typeof unitAmount === 'number' ? unitAmount / 100 : NaN;
  if (!Number.isFinite(amount)) return null;
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: ccy }).format(amount);
  } catch (_) {
    return `${amount} ${ccy}`;
  }
}

function billingFeatureValuePretty(v) {
  if (v === true) return 'Yes';
  if (v === false) return 'No';
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'object') return escapeHtml(JSON.stringify(v));
  return escapeHtml(String(v));
}

function renderBillingTierButtons(tierCatalog, canManageStripe) {
  const wrap = document.getElementById('billingUpgradeButtons');
  if (!wrap) return;
  wrap.innerHTML = '';

  if (!tierCatalog?.length) {
    wrap.innerHTML =
      '<span style="font-size:13px;color:#6b7280;">No active catalog rows returned from subscription_tiers.</span>';
    return;
  }

  tierCatalog.forEach((tier) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn-primary billing-tier-btn';
    btn.dataset.tier = tier.tierName;
    btn.style.flex = '1';
    btn.style.minWidth = '118px';

    const priceLabel = formatUsdCatalogPrice(tier.monthlyPriceUsd);
    btn.textContent = priceLabel ? `${billingCatalogKeyLabel(tier.tierName)} (${priceLabel}/mo)` : billingCatalogKeyLabel(tier.tierName);

    const tip = [];
    tip.push(`Catalog — social accounts: ${tier.maxSocialAccounts}, AI executions / month: ${tier.maxAiExecutionsPerMonth}`);
    if (!tier.checkoutAvailable) {
      btn.disabled = true;
      btn.classList.replace('btn-primary', 'btn-secondary');
      tip.push('Checkout disabled: map a Stripe Price (env or subscription_tiers.stripe_price_id).');
    }
    if (canManageStripe === false) {
      btn.disabled = true;
      btn.classList.replace('btn-primary', 'btn-secondary');
      tip.push('Only the workspace owner who created the team can change plans.');
    }
    btn.title = tip.join('. ');

    wrap.appendChild(btn);
  });
}

async function refreshBillingStatus() {
  const el = document.getElementById('billingStatusSummary');
  const portalWrap = document.getElementById('stripePortalWrap');
  const setupNote = document.getElementById('billingSetupNote');
  const planEl = document.getElementById('billingPlanIncluded');
  if (!el) return;

  const token = localStorage.getItem('auth_token');
  if (!token) return;

  el.innerHTML = 'Loading billing status…';
  if (portalWrap) portalWrap.style.display = 'none';

  try {
    const r = await fetchWithDeadline('/api/billing/status', { headers: { Authorization: `Bearer ${token}` } });
    const j = await r.json();

    if (!r.ok) {
      el.innerHTML = escapeHtml(`Unable to load billing: ${j.error || r.status}`);
      return;
    }

    const tierCatalog = Array.isArray(j.tierCatalog) ? j.tierCatalog : [];
    const canStripe = j.billing?.canManageStripe !== false;
    renderBillingTierButtons(tierCatalog, canStripe);

    if (setupNote) {
      const teamBillingNote =
        j.billing?.viewerIsTeamMemberBilling && !canStripe && j.billing?.ownerContactEmail
          ? `Subscription is billed to the workspace owner (${escapeHtml(String(j.billing.ownerContactEmail))}). They manage checkout and Stripe.`
          : j.billing?.viewerIsTeamMemberBilling && !canStripe
            ? 'Subscription is billed to whoever created your team—they manage Stripe checkout and receipts.'
            : '';

      const baseStripe =
        !j.configured
          ? 'Stripe billing is not fully configured yet (server needs STRIPE_SECRET_KEY + price mapping). Operational plans still load from the database.'
          : 'Plans and entitlement limits sync from subscription_tiers. Live charges are managed through Stripe Checkout and the Customer Portal.';

      setupNote.innerHTML =
        (teamBillingNote ? `<span style="display:block;margin-bottom:8px;">${teamBillingNote}</span>` : '') +
        `<span>${baseStripe}</span>`;
    }

    const s = j.subscription || {};
    const sb = j.stripeBilling || null;
    const current = j.currentTierPlan || null;
    const renewalIso = j.nextRenewalAt || s.renewsAt || null;

    const cancelBadge = sb?.cancelAtPeriodEnd
      ? '<span style="background:#fef3c7;color:#92400e;font-size:12px;padding:2px 6px;border-radius:4px;margin-left:8px;">Cancels at period end</span>'
      : '';

    let titleMiddle = '';
    if (sb?.productName && String(sb.productName).trim()) {
      titleMiddle = ` — ${escapeHtml(sb.productName.trim())}`;
    } else if (current && current.tierName) {
      const cents = formatUsdCatalogPrice(current.monthlyPriceUsd);
      titleMiddle =
        ` — ${escapeHtml(billingCatalogKeyLabel(current.tierName))}` +
        (cents ? ` <span style="font-weight:500;color:#4b5563;">(${escapeHtml(cents)} / mo catalog)</span>` : '');
    } else if (s.tier && s.tier !== 'none') {
      titleMiddle = ` — ${escapeHtml(billingCatalogKeyLabel(s.tier))}`;
    } else {
      titleMiddle = ' — <span style="font-weight:500;color:#4b5563;">No paid plan selected</span>';
    }

    const htmlParts = [
      `<div style="display:flex;flex-direction:column;gap:8px;line-height:1.45;">`,
      `<div style="font-size:15px;font-weight:700;color:#111827;">Current plan${titleMiddle}${cancelBadge}</div>`,
      `<div><strong>Billing status:</strong> ${escapeHtml(String(s.status || 'inactive'))}</div>`,
      `<div><strong>Plan tier id:</strong> <code>${escapeHtml(String(s.tier || 'none'))}</code></div>`,
    ];

    if (sb && typeof sb.unitAmount === 'number' && sb.interval) {
      const pretty = formatStripeMoneyMinor(sb.unitAmount, sb.currency);
      if (pretty) {
        let cadence = ` per ${sb.interval}`;
        if (sb.intervalCount && sb.intervalCount !== 1) {
          cadence = ` every ${sb.intervalCount} ${sb.interval}(s)`;
        }
        htmlParts.push(`<div><strong>Billed (Stripe):</strong> ${escapeHtml(pretty)}${escapeHtml(cadence)}</div>`);
      }
    }

    if (renewalIso) {
      htmlParts.push(
        `<div><strong>Renews:</strong> ${escapeHtml(new Date(renewalIso).toLocaleString())}</div>`
      );
    }

    if (sb?.priceId) {
      htmlParts.push(
        `<div style="font-size:12px;color:#6b7280;"><strong>Stripe price ID:</strong> <code>${escapeHtml(sb.priceId)}</code></div>`
      );
    }

    htmlParts.push(
      `<div style="margin-top:8px;font-size:12px;color:#6b7280;line-height:1.35;">Stripe API version: ` +
      `<code>${escapeHtml(String(j.stripeApiVersion || '—'))}</code> · Billing keys ${j.configured ? 'configured ✓' : 'not configured'}</div>`
    );

    htmlParts.push('</div>');
    el.innerHTML = htmlParts.join('');

    if (planEl) {
      if (!current || s.tier === 'none') {
        planEl.innerHTML =
          `<p style="font-size:13px;color:#6b7280;margin:0;">No active tier from the catalog matches this workspace yet.` +
          ` Choose a plan below.${s.subscriptionId ? ' If you just subscribed, refresh in a few seconds.' : ''}</p>` +
          `<p style="font-size:12px;color:#6b7280;margin:10px 0 0;"><strong>This period usage:</strong> ` +
          `${escapeHtml(String(s.currentMonthlyUsage ?? 0))} / ${escapeHtml(String(s.maxAllowedUsage ?? 0))}</p>`;
      } else {
        const feats = current.features || {};
        const featKeys = Object.keys(feats).sort((a, b) => a.localeCompare(b));
        let inc = `<div style="padding:14px;background:#ecfdf5;border-radius:10px;border:1px solid #bbf7d0;color:#065f46;">`;
        inc += `<div style="font-weight:700;margin-bottom:8px;color:#065f46;font-size:14px;">What you get (${escapeHtml(
          billingCatalogKeyLabel(current.tierName)
        )})</div>`;
        inc += `<ul style="margin:0 0 10px;padding-left:18px;line-height:1.55;color:#065f46;font-size:13px;">`;
        inc += `<li>Social accounts (catalog cap): ${escapeHtml(String(current.maxSocialAccounts))}</li>`;
        inc += `<li>AI executions / month cap: ${escapeHtml(String(current.maxAiExecutionsPerMonth))}</li>`;
        inc += `<li>This period AI usage so far: ${escapeHtml(String(s.currentMonthlyUsage ?? 0))} / ${escapeHtml(
          String(s.maxAllowedUsage ?? 0)
        )}</li>`;
        if (current.requiresOwnApiKey) {
          inc += `<li>${escapeHtml('This tier requires bringing your own OpenAI API key (BYOK).')}</li>`;
        }
        inc += '</ul>';

        if (featKeys.length) {
          inc += `<div style="font-size:12px;font-weight:600;color:#047857;text-transform:uppercase;letter-spacing:0.04em;">Catalog metadata</div>`;
          inc += `<ul style="margin:8px 0 0;padding-left:18px;line-height:1.5;color:#047857;font-size:13px;">`;
          featKeys.forEach((k) => {
            inc += `<li><strong>${escapeHtml(billingCatalogKeyLabel(k))}:</strong> ${billingFeatureValuePretty(
              feats[k]
            )}</li>`;
          });
          inc += '</ul>';
        }

        inc += `<div style="font-size:11px;color:#065f46;opacity:.9;margin-top:10px;">Values come from subscription_tiers; usage from your billing profile.` +
          (s.usesOwnApiKey ? ' BYOK detected for this workspace.' : '') +
          '</div>';
        inc += '</div>';
        planEl.innerHTML = inc;
      }
    }

    if (portalWrap && s.customerId && j.billing?.canManageStripe !== false) portalWrap.style.display = 'flex';
  } catch (e) {
    el.textContent =
      e.name === 'AbortError' ? 'Billing status timed out.' : 'Billing error: ' + String(e.message);
  }
}

async function startStripeCheckout(tier) {
  const token = localStorage.getItem('auth_token');
  try {
    const r = await fetchWithDeadline('/api/billing/create-checkout-session', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ tier }),
    });
    const j = await r.json();
    if (!r.ok || !j.url) {
      if (typeof notify === 'function') notify(j.error || j.hint || 'Could not start checkout', 'error');
      return;
    }
    window.location.href = j.url;
  } catch (e) {
    if (typeof notify === 'function') notify(e.message || 'Checkout failed', 'error');
  }
}

async function openStripeBillingPortal() {
  const token = localStorage.getItem('auth_token');
  try {
    const r = await fetchWithDeadline('/api/billing/create-portal-session', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    const j = await r.json();
    if (!r.ok || !j.url) {
      if (typeof notify === 'function') notify(j.error || j.hint || 'Customer portal unavailable', 'error');
      return;
    }
    window.location.href = j.url;
  } catch (e) {
    if (typeof notify === 'function') notify(e.message || 'Portal failed', 'error');
  }
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
            scheduled_time: post.scheduledTime,
            client_id: currentSelectedClient?.id || null  // Include client context
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
  // Update timestamp (calendar doesn't need persistent caching)
  dataCache.lastLoaded.calendar = Date.now();
}

// Render calendar for given month
async function renderCalendar(date) {
  const token = localStorage.getItem('auth_token');

  try {
    // Build URL with optional account and brand filters
    let postsUrl = `/api/users/${currentUser.id}/posts`;
    const params = new URLSearchParams();

    if (currentGlobalAccount) {
      params.set('platform', currentGlobalAccount.platform);
      params.set('accountId', currentGlobalAccount.accountId);
    }

    // Add brand filter
    const brandFilter = document.getElementById('calendarFilterBrand');
    if (brandFilter && brandFilter.value) {
      params.set('brand_profile_id', brandFilter.value);
    }

    if (params.toString()) {
      postsUrl += `?${params.toString()}`;
    }

    // Fetch all posts
    const response = await fetch(postsUrl, {
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
    // Build URL with optional account and brand filters
    let postsUrl = `/api/users/${currentUser.id}/posts`;
    const params = new URLSearchParams();

    if (currentGlobalAccount) {
      params.set('platform', currentGlobalAccount.platform);
      params.set('accountId', currentGlobalAccount.accountId);
    }

    // Add brand filter
    const brandFilter = document.getElementById('analyticsFilterBrand');
    if (brandFilter && brandFilter.value) {
      params.set('brand_profile_id', brandFilter.value);
    }

    if (params.toString()) {
      postsUrl += `?${params.toString()}`;
    }

    const [postsRes, healthRes] = await Promise.all([
      fetch(postsUrl, {
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

    // Cache the analytics data and update timestamp
    dataCache.analytics = { posts, timeRange };
    dataCache.lastLoaded.analytics = Date.now();
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

// AI Auto-Plan: Use LangGraph multi-agent system to create optimized content calendar
async function useAIPlan() {
  if (bulkFilesNew.length === 0) {
    notify('Please upload files first', 'warning');
    return;
  }

  const token = localStorage.getItem('auth_token');
  if (!token) {
    notify('Authentication required', 'error');
    return;
  }

  // Get selected platforms from checkboxes
  const platformCheckboxes = document.querySelectorAll('input[name="bulkPlatform"]:checked');
  const platforms = Array.from(platformCheckboxes).map(cb => cb.value);

  if (platforms.length === 0) {
    notify('Please select at least one platform below', 'warning');
    return;
  }

  // Get schedule preset
  const preset = document.getElementById('schedulePreset').value || 'daily';

  // Map preset to API pattern
  const patternMap = {
    'daily': 'daily',
    'weekdays': 'weekdays',
    'three-week': '3x-week',
    'twice-week': '2x-week',
    'weekly': 'weekly'
  };
  const schedulePattern = patternMap[preset] || 'daily';

  // Show loading modal
  showAIPlanningModal('analyzing');

  try {
    // First, upload all files to get URLs
    const uploadedFiles = [];
    for (let i = 0; i < bulkFilesNew.length; i++) {
      const file = bulkFilesNew[i];
      const formData = new FormData();
      formData.append('file', file);

      const uploadResponse = await fetch('/api/upload', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData
      });

      if (!uploadResponse.ok) {
        throw new Error(`Failed to upload ${file.name}`);
      }

      const uploadData = await uploadResponse.json();
      uploadedFiles.push({
        name: file.name,
        type: file.type,
        url: uploadData.url,
        preview: uploadData.url
      });

      updateAIPlanningProgress((i + 1) / bulkFilesNew.length * 0.3); // 0-30%
    }

    // Call AI planning API
    updateAIPlanningModal('planning');
    const planResponse = await fetch('/api/content-planner/auto-plan', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        files: uploadedFiles,
        schedulePattern,
        platforms,
        startDate: new Date().toISOString(),
        niche: 'general'
      })
    });

    if (!planResponse.ok) {
      const errorData = await planResponse.json();
      throw new Error(errorData.error || 'AI planning failed');
    }

    const planData = await planResponse.json();

    if (!planData.success) {
      throw new Error(planData.error || 'AI planning failed');
    }

    updateAIPlanningProgress(1); // 100%

    // Show strategy modal
    showStrategyResults(planData);

    // Populate bulk review with AI-generated calendar
    populateReviewFromAIPlan(planData.calendar, uploadedFiles);

  } catch (error) {
    console.error('AI planning error:', error);
    hideAIPlanningModal();
    notify(error.message || 'AI planning failed. Please try manual configuration.', 'error');
  }
}

// Show AI planning modal with status
function showAIPlanningModal(status) {
  let modal = document.getElementById('aiPlanningModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'aiPlanningModal';
    modal.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.7); display: flex; align-items: center; justify-content: center; z-index: 10000;';

    const content = document.createElement('div');
    content.style.cssText = 'background: white; padding: 32px; border-radius: 12px; max-width: 500px; text-align: center;';

    content.innerHTML = `
      <div id="aiPlanningStatus"></div>
      <div id="aiPlanningProgress" style="width: 100%; height: 6px; background: #e5e7eb; border-radius: 3px; margin-top: 20px; overflow: hidden;">
        <div id="aiPlanningProgressBar" style="width: 0%; height: 100%; background: linear-gradient(90deg, #8b5cf6, #7c3aed); transition: width 0.3s;"></div>
      </div>
    `;

    modal.appendChild(content);
    document.body.appendChild(modal);
  }

  updateAIPlanningModal(status);
  modal.style.display = 'flex';
}

// Update AI planning modal status
function updateAIPlanningModal(status) {
  const statusDiv = document.getElementById('aiPlanningStatus');
  if (!statusDiv) return;

  const messages = {
    analyzing: {
      icon: '📤',
      title: 'Uploading Files...',
      text: 'Preparing your content for AI analysis'
    },
    planning: {
      icon: '🤖',
      title: 'AI Planning in Progress...',
      text: 'Multi-agent system analyzing content, creating narrative arcs, and optimizing timing'
    }
  };

  const msg = messages[status] || messages.planning;
  statusDiv.innerHTML = `
    <div style="font-size: 48px; margin-bottom: 16px;">${msg.icon}</div>
    <h3 style="margin: 0 0 8px 0; color: #1f2937;">${msg.title}</h3>
    <p style="margin: 0; color: #6b7280; font-size: 14px;">${msg.text}</p>
  `;
}

// Update progress bar
function updateAIPlanningProgress(percent) {
  const progressBar = document.getElementById('aiPlanningProgressBar');
  if (progressBar) {
    progressBar.style.width = (percent * 100) + '%';
  }
}

// Hide planning modal
function hideAIPlanningModal() {
  const modal = document.getElementById('aiPlanningModal');
  if (modal) {
    modal.style.display = 'none';
  }
}

// Show AI strategy results in a modal
function showStrategyResults(planData) {
  hideAIPlanningModal();

  const modal = document.createElement('div');
  modal.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.7); display: flex; align-items: center; justify-content: center; z-index: 10000; padding: 20px;';

  const content = document.createElement('div');
  content.style.cssText = 'background: white; padding: 32px; border-radius: 12px; max-width: 700px; max-height: 80vh; overflow-y: auto;';

  const narrativeGroups = planData.strategy?.narrativeGroups || [];
  const narrativeGroupsHTML = narrativeGroups.length > 0
    ? narrativeGroups.map(group => `
        <div style="background: #f3f4f6; padding: 12px; border-radius: 8px; margin-bottom: 8px;">
          <strong style="color: #7c3aed;">${group.name || 'Story Arc'}</strong>
          <p style="margin: 4px 0 0 0; font-size: 13px; color: #6b7280;">${group.description || ''}</p>
        </div>
      `).join('')
    : '<p style="color: #6b7280; font-size: 13px;">Content organized strategically</p>';

  content.innerHTML = `
    <div style="text-align: center; margin-bottom: 24px;">
      <div style="font-size: 48px; margin-bottom: 12px;">✨</div>
      <h2 style="margin: 0 0 8px 0; color: #1f2937;">AI Content Plan Ready</h2>
      <p style="margin: 0; color: #6b7280;">Your optimized content calendar has been generated</p>
    </div>

    <div style="background: linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%); color: white; padding: 20px; border-radius: 8px; margin-bottom: 24px;">
      <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; text-align: center;">
        <div>
          <div style="font-size: 28px; font-weight: 700;">${planData.summary?.totalPosts || 0}</div>
          <div style="font-size: 12px; opacity: 0.9;">Total Posts</div>
        </div>
        <div>
          <div style="font-size: 28px; font-weight: 700;">${planData.summary?.narrativeGroups || 0}</div>
          <div style="font-size: 12px; opacity: 0.9;">Story Arcs</div>
        </div>
        <div>
          <div style="font-size: 28px; font-weight: 700;">${planData.summary?.platforms?.length || 0}</div>
          <div style="font-size: 12px; opacity: 0.9;">Platforms</div>
        </div>
      </div>
    </div>

    <div style="margin-bottom: 20px;">
      <h4 style="margin: 0 0 12px 0; color: #1f2937; font-size: 14px;">Narrative Strategy</h4>
      ${narrativeGroupsHTML}
    </div>

    <div style="background: #ecfdf5; border-left: 4px solid #10b981; padding: 16px; border-radius: 8px; margin-bottom: 20px;">
      <p style="margin: 0; color: #065f46; font-size: 13px;">
        <strong>AI Insight:</strong> ${planData.tip || 'Content strategically organized for maximum engagement'}
      </p>
    </div>

    <div style="display: flex; gap: 12px; justify-content: flex-end;">
      <button onclick="this.closest('[style*=fixed]').remove(); showBulkConfigStep();" style="background: #e5e7eb; color: #1f2937; border: none; padding: 12px 24px; border-radius: 8px; font-weight: 600; cursor: pointer;">
        Cancel
      </button>
      <button onclick="this.closest('[style*=fixed]').remove(); showBulkReviewStep();" style="background: linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%); color: white; border: none; padding: 12px 24px; border-radius: 8px; font-weight: 600; cursor: pointer;">
        Review Posts →
      </button>
    </div>
  `;

  modal.appendChild(content);
  document.body.appendChild(modal);
}

// Populate bulk review from AI-generated plan
function populateReviewFromAIPlan(calendar, uploadedFiles) {
  // Create file lookup by URL
  const filesByUrl = {};
  bulkFilesNew.forEach((file, index) => {
    if (uploadedFiles[index]) {
      filesByUrl[uploadedFiles[index].url] = file;
    }
  });

  // Convert AI calendar to bulkPostsConfig format
  bulkPostsConfig = calendar.map(item => {
    const file = filesByUrl[item.fileUrl] || bulkFilesNew[0]; // Fallback to first file if lookup fails
    return {
      file: file,
      caption: item.suggestedCaption || '',
      platforms: item.platforms || [],
      scheduledTime: item.scheduledTime ? new Date(item.scheduledTime).toISOString().slice(0, 16) : '',
      metadata: {
        narrativeGroup: item.narrativeGroup,
        contentPillar: item.contentPillar,
        reasoning: item.reasoning
      }
    };
  });

  // Review step will be shown when user clicks "Review Posts" button
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

// ===== GLOBAL ACCOUNT SWITCHER =====

// Populate global account switcher dropdown
function populateGlobalAccountSwitcher() {
  const switcher = document.getElementById('globalAccountSwitcher');
  const select = document.getElementById('globalAccountSelect');

  if (!switcher || !select) {
    return;
  }

  // When an agency selects a client, only that client's connected assets appear in this list
  const accountsSource =
    typeof currentSelectedClient !== 'undefined' && currentSelectedClient && currentSelectedClient.accounts
      ? normalizeSocialAccounts(currentSelectedClient.accounts)
      : socialAccounts;

  // Collect all accounts across all platforms
  let allAccounts = [];

  // Facebook Pages
  if (accountsSource.facebook && accountsSource.facebook.length > 0) {
    accountsSource.facebook.forEach((acc, idx) => {
      allAccounts.push({
        platform: 'facebook',
        platformName: 'Facebook',
        accountId: acc.page_id != null ? String(acc.page_id) : String(acc.id ?? idx),
        name: acc.page_name || acc.name || `Facebook Page ${idx + 1}`,
        icon: '📘'
      });
    });
  }

  // Instagram Accounts
  if (accountsSource.instagram && accountsSource.instagram.length > 0) {
    accountsSource.instagram.forEach((acc, idx) => {
      allAccounts.push({
        platform: 'instagram',
        platformName: 'Instagram',
        accountId:
          acc.account_id != null
            ? String(acc.account_id)
            : String(acc.instagram_business_account_id ?? acc.id ?? idx),
        name: acc.username || acc.name || `Instagram Account ${idx + 1}`,
        icon: '📷'
      });
    });
  }

  // TikTok Accounts
  if (accountsSource.tiktok && accountsSource.tiktok.length > 0) {
    accountsSource.tiktok.forEach((acc, idx) => {
      allAccounts.push({
        platform: 'tiktok',
        platformName: 'TikTok',
        accountId:
          acc.open_id != null
            ? String(acc.open_id)
            : String(acc.id ?? idx),
        name: acc.display_name || acc.name || `TikTok Account ${idx + 1}`,
        icon: '🎵'
      });
    });
  }

  // Pinterest Accounts
  if (accountsSource.pinterest && accountsSource.pinterest.length > 0) {
    accountsSource.pinterest.forEach((acc, idx) => {
      allAccounts.push({
        platform: 'pinterest',
        platformName: 'Pinterest',
        accountId:
          acc.pinterest_user_id != null
            ? String(acc.pinterest_user_id)
            : String(acc.account_id ?? acc.id ?? idx),
        name: acc.username || acc.name || `Pinterest Account ${idx + 1}`,
        icon: '📌'
      });
    });
  }

  // YouTube Channels
  if (accountsSource.youtube && accountsSource.youtube.length > 0) {
    accountsSource.youtube.forEach((acc, idx) => {
      allAccounts.push({
        platform: 'youtube',
        platformName: 'YouTube',
        accountId:
          acc.channel_id != null
            ? String(acc.channel_id)
            : String(acc.id ?? idx),
        name: acc.channel_title || acc.name || `YouTube Channel ${idx + 1}`,
        icon: '📺'
      });
    });
  }

  // Google Business Profiles
  if (accountsSource.google && accountsSource.google.length > 0) {
    accountsSource.google.forEach((acc, idx) => {
      allAccounts.push({
        platform: 'google_business',
        platformName: 'Google Business',
        accountId:
          acc.location_name != null
            ? String(acc.location_name)
            : String(acc.location_id ?? acc.id ?? idx),
        name:
          acc.business_name ||
          acc.account_display_name ||
          acc.location_title ||
          acc.location_name ||
          `Google Business ${idx + 1}`,
        icon: '🏢'
      });
    });
  }

  // Show switcher only if user has multiple accounts
  if (allAccounts.length > 1) {
    switcher.style.display = 'flex';

    // Build dropdown options
    select.innerHTML = '<option value="">All accounts</option>';

    // Group by platform
    const platforms = ['facebook', 'instagram', 'tiktok', 'pinterest', 'youtube', 'google_business'];
    platforms.forEach(platform => {
      const platformAccounts = allAccounts.filter(acc => acc.platform === platform);
      if (platformAccounts.length > 0) {
        platformAccounts.forEach(acc => {
          const value = JSON.stringify({ platform: acc.platform, accountId: acc.accountId });
          select.innerHTML += `<option value='${value}'>${acc.icon} ${acc.name}</option>`;
        });
      }
    });
  } else {
    switcher.style.display = 'none';
  }
}

// Switch global account filter
function switchGlobalAccount() {
  const select = document.getElementById('globalAccountSelect');
  if (!select) return;

  const value = select.value;

  if (!value) {
    // "All Accounts" selected
    currentGlobalAccount = null;
  } else {
    try {
      currentGlobalAccount = JSON.parse(value);
      if (currentGlobalAccount && currentGlobalAccount.platform === 'google') {
        currentGlobalAccount.platform = 'google_business';
      }
    } catch (e) {
      console.error('Failed to parse account selection:', e);
      currentGlobalAccount = null;
    }
  }

  // Invalidate lazy-load caches — filter changed, old tab payloads would be misleading
  dataCache.lastLoaded.posts = 0;
  dataCache.lastLoaded.calendar = 0;
  dataCache.lastLoaded.analytics = 0;
  dataCache.lastLoaded.comments = 0;
  dataCache.lastLoaded.reviews = 0;

  // Reload current tab data with new filter (tabs use data-tab, not onclick)
  const activeTab = document.querySelector('.tab.active');
  const tabName = activeTab?.getAttribute?.('data-tab');
  if (tabName) {
    refreshCurrentTab(tabName);
  }

  // Update welcome message
  const sub = document.getElementById('welcomeSubtitle');
  if (sub) {
    if (currentGlobalAccount && select.selectedIndex >= 0) {
      const accountName = select.options[select.selectedIndex].text.replace(/^[^\s]+\s/, ''); // Remove emoji
      sub.textContent = `Viewing: ${accountName}`;
    } else {
      sub.textContent = 'Queue. Post. Grow.';
    }
  }

  refreshSidebarConnectionStatuses();
  loadStats();
}

/** Agency client row changed — clear stale social-account filter before repopulating the dropdown */
window.resetSocialAccountFilterFromClientSwitch = function () {
  currentGlobalAccount = null;
  const sel = document.getElementById('globalAccountSelect');
  if (sel) sel.value = '';
  const sub = document.getElementById('welcomeSubtitle');
  if (sub) sub.textContent = 'Queue. Post. Grow.';
};

// Refresh current tab data based on global account filter
function refreshCurrentTab(tabName) {
  switch (tabName) {
    case 'posts':
      loadPosts();
      break;
    case 'comments':
      if (typeof loadComments === 'function') loadComments();
      break;
    case 'reviews':
      if (typeof loadReviews === 'function') loadReviews();
      break;
    case 'analytics':
      loadAnalytics();
      break;
    case 'calendar':
      loadCalendar();
      break;
    default:
      // No action for other tabs
      break;
  }
}

// Save brand voice settings
async function saveBrandVoiceSettings() {
  try {
    const brandVoiceData = {
      tone: document.getElementById('brandVoiceTone').value,
      custom_description: document.getElementById('customVoiceDescription').value,
      emoji_usage: document.getElementById('emojiUsage').value,
      response_length: document.getElementById('responseLength').value,
      contact_email: document.getElementById('brandContactEmail').value,
      contact_phone: document.getElementById('brandContactPhone').value
    };

    const response = await window.SupabaseAuth.apiRequest('/api/profile/brand-voice', {
      method: 'PUT',
      body: JSON.stringify(brandVoiceData)
    });

    const result = await response.json();

    if (result.success) {
      // Update local user object
      currentUser.brand_voice = brandVoiceData;

      notify('Brand voice settings saved successfully!', 'success');

      // Clear settings cache so it reloads fresh next time
      dataCache.lastLoaded.settings = 0;
    } else {
      notify('Failed to save brand voice settings: ' + (result.error || 'Unknown error'), 'error');
    }
  } catch (error) {
    console.error('Error saving brand voice:', error);
    notify('Failed to save brand voice settings: ' + error.message, 'error');
  }
}


// ========================================
// CSP-COMPLIANT EVENT LISTENERS SETUP
// ========================================
// All inline event handlers have been removed for CSP compliance
// This section attaches event listeners using addEventListener

document.addEventListener('DOMContentLoaded', function() {
  // Logout button
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) logoutBtn.addEventListener('click', logout);

  // Tab switching
  document.querySelectorAll('.tab[data-tab]').forEach(tab => {
    tab.addEventListener('click', function() {
      switchTab(this.getAttribute('data-tab'));
    });
  });

  // Social platform connection buttons
  const facebookBtn = document.getElementById('facebookBtn');
  if (facebookBtn) facebookBtn.addEventListener('click', connectFacebook);

  const instagramBtn = document.getElementById('instagramBtn');
  if (instagramBtn) instagramBtn.addEventListener('click', connectInstagram);

  const tiktokBtn = document.getElementById('tiktokBtn');
  if (tiktokBtn) tiktokBtn.addEventListener('click', connectTikTok);

  const pinterestBtn = document.getElementById('pinterestBtn');
  if (pinterestBtn) pinterestBtn.addEventListener('click', connectPinterest);

  const youtubeBtn = document.getElementById('youtubeBtn');
  if (youtubeBtn) youtubeBtn.addEventListener('click', connectYouTube);

  const googleBtn = document.getElementById('googleBtn');
  if (googleBtn) googleBtn.addEventListener('click', connectGoogle);

  // Create post form submission
  const createPostForm = document.getElementById('createPostForm');
  if (createPostForm) createPostForm.addEventListener('submit', createPost);

  // Upload zone click (trigger file input)
  const uploadZone = document.getElementById('uploadZone');
  if (uploadZone) uploadZone.addEventListener('click', function() {
    document.getElementById('fileInput').click();
  });

  // File input change
  const fileInput = document.getElementById('fileInput');
  if (fileInput) fileInput.addEventListener('change', handleFileSelect);

  // AI caption buttons
  const aiCaptionBtns = document.querySelectorAll('.ai-caption-btn');
  if (aiCaptionBtns.length > 0) {
    aiCaptionBtns[0].addEventListener('click', generateAICaption);
    if (aiCaptionBtns[1]) aiCaptionBtns[1].addEventListener('click', generateHashtags);
    if (aiCaptionBtns[2]) aiCaptionBtns[2].addEventListener('click', translateCaption);
    if (aiCaptionBtns[3]) aiCaptionBtns[3].addEventListener('click', optimizeCaption);
  }

  // Post type change
  const postType = document.getElementById('postType');
  if (postType) postType.addEventListener('change', handlePostTypeChange);

  // Platform checkboxes
  document.querySelectorAll('input[name="platform"]').forEach(checkbox => {
    checkbox.addEventListener('change', function() {
      toggleAccountSelector(this.value);
    });
  });

  // Schedule type change
  const scheduleType = document.getElementById('scheduleType');
  if (scheduleType) scheduleType.addEventListener('change', toggleScheduleTime);

  // Bulk upload zone
  const bulkUploadZone = document.getElementById('bulkUploadZone');
  if (bulkUploadZone) bulkUploadZone.addEventListener('click', function() {
    document.getElementById('bulkFileInput').click();
  });

  // Bulk file input change
  const bulkFileInput = document.getElementById('bulkFileInput');
  if (bulkFileInput) bulkFileInput.addEventListener('change', handleBulkFileSelectNew);

  // Bulk upload continue button
  const continueToConfigBtn = document.getElementById('continueToConfigBtn');
  if (continueToConfigBtn) continueToConfigBtn.addEventListener('click', showBulkConfigStep);

  // Calendar view toggle buttons
  const gridViewBtn = document.getElementById('gridViewBtn');
  if (gridViewBtn) gridViewBtn.addEventListener('click', function() {
    switchCalendarView('grid');
  });

  const listViewBtn = document.getElementById('listViewBtn');
  if (listViewBtn) listViewBtn.addEventListener('click', function() {
    switchCalendarView('list');
  });

  // Calendar navigation buttons
  const prevMonthBtns = document.querySelectorAll('.btn-secondary');
  prevMonthBtns.forEach(btn => {
    if (btn.textContent.includes('Previous')) {
      btn.addEventListener('click', previousMonth);
    }
    if (btn.textContent.includes('Next')) {
      btn.addEventListener('click', nextMonth);
    }
  });

  // Analytics time range selector
  const analyticsTimeRange = document.getElementById('analyticsTimeRange');
  if (analyticsTimeRange) analyticsTimeRange.addEventListener('change', loadAnalytics);

  // Comment filter
  const commentFilter = document.getElementById('commentFilter');
  if (commentFilter) commentFilter.addEventListener('change', filterComments);

  // Auto-reply toggle
  const autoReplyToggle = document.getElementById('autoReplyToggle');
  if (autoReplyToggle) autoReplyToggle.addEventListener('change', toggleAutoReply);

  // Review filter
  const reviewFilter = document.getElementById('reviewFilter');
  if (reviewFilter) reviewFilter.addEventListener('change', filterReviews);

  // Review auto-reply toggle
  const reviewAutoReplyToggle = document.getElementById('reviewAutoReplyToggle');
  if (reviewAutoReplyToggle) reviewAutoReplyToggle.addEventListener('change', toggleReviewAutoReply);

  // Review account selector
  const reviewAccountSelector = document.getElementById('reviewAccountSelector');
  if (reviewAccountSelector) reviewAccountSelector.addEventListener('change', switchReviewAccount);

  // Schedule preset selector
  const schedulePreset = document.getElementById('schedulePreset');
  if (schedulePreset) schedulePreset.addEventListener('change', updateSchedulePresetDetails);

  // Global account selector
  const globalAccountSelect = document.getElementById('globalAccountSelect');
  if (globalAccountSelect) globalAccountSelect.addEventListener('change', switchGlobalAccount);

  // Brand voice settings
  const brandVoiceTone = document.getElementById('brandVoiceTone');
  if (brandVoiceTone) brandVoiceTone.addEventListener('change', function() {
    const customVoiceGroup = document.getElementById('customVoiceGroup');
    if (this.value === 'custom') {
      customVoiceGroup.style.display = 'block';
    } else {
      customVoiceGroup.style.display = 'none';
    }
  });

  const saveBrandVoiceBtn = document.getElementById('saveBrandVoiceBtn');
  if (saveBrandVoiceBtn) saveBrandVoiceBtn.addEventListener('click', saveBrandVoiceSettings);

  document.querySelectorAll('.settings-inner-tab').forEach((btn) => {
    btn.addEventListener('click', function () {
      const pane = this.getAttribute('data-settings-pane');
      if (pane) switchSettingsPane(pane);
      if (pane === 'subscription') refreshBillingStatus();
    });
  });

  const settingsTab = document.getElementById('settingsTab');
  if (settingsTab) {
    settingsTab.addEventListener('click', function(e) {
      const tierBtn = e.target.closest('.billing-tier-btn');
      if (tierBtn && tierBtn.dataset && tierBtn.dataset.tier) {
        startStripeCheckout(tierBtn.dataset.tier);
      }
    });
  }

  const openStripePortalBtn = document.getElementById('openStripePortalBtn');
  if (openStripePortalBtn) openStripePortalBtn.addEventListener('click', openStripeBillingPortal);

  window.addEventListener('hashchange', applyBillingDeepLink);

  console.log('✓ All event listeners attached successfully (CSP-compliant)');
});

/**
 * Brand Profiles Management
 * Handles creating, editing, and managing brand profiles
 * VERSION: 2.2 - Using dashboard's styled notifications
 */

console.log('🔵 [brands.js v2.2] Loading NOW - timestamp:', new Date().toISOString());

// State
let brands = [];
let currentBrand = null;

/** Matches dashboard.js / supabase-client — session lives under `auth_token`. */
function getAuthToken() {
  return localStorage.getItem('auth_token') || localStorage.getItem('sb-access-token');
}

// ============================================
// INITIALIZE
// ============================================
async function initBrands() {
  await loadBrands();
  setupEventListeners();
}

// ============================================
// LOAD BRANDS
// ============================================
async function loadBrands() {
  try {
    const token = getAuthToken();
    if (!token) {
      throw new Error('Not authenticated');
    }

    // Add timeout to prevent freezing (10 seconds)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const response = await fetch('/api/brands', {
      headers: {
        'Authorization': `Bearer ${token}`
      },
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('API error:', errorText);
      throw new Error(`Failed to load brands (${response.status})`);
    }

    const data = await response.json();
    brands = data.brands || [];
    renderBrandsList();
  } catch (error) {
    console.error('Error loading brands:', error);

    // Provide helpful error messages
    if (error.name === 'AbortError') {
      showBrandNotification('Request timed out. The brands list may be slow to load. Try refreshing.', 'error');
    } else if (error.message.includes('401') || error.message.includes('Not authenticated')) {
      showBrandNotification('Please log in again', 'error');
      setTimeout(() => window.location.href = '/login', 2000);
    } else {
      showBrandNotification('Failed to load brands. Check console for details.', 'error');
    }

    // Still render empty list so UI isn't broken
    brands = [];
    renderBrandsList();
  }
}

// ============================================
// RENDER BRANDS LIST
// ============================================
function renderBrandsList() {
  const container = document.getElementById('brandsList');
  if (!container) return;

  if (brands.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <p>No brands yet. Create your first brand to get started!</p>
        <button onclick="showCreateBrandModal()" class="btn btn-primary">
          + Create Brand
        </button>
      </div>
    `;
    return;
  }

  container.innerHTML = brands.map(brand => `
    <div class="brand-card" data-brand-id="${brand.id}">
      <div class="brand-header">
        ${brand.logo_url ? `<img src="${brand.logo_url}" alt="${brand.name}" class="brand-logo">` : ''}
        <div class="brand-info">
          <h3>${escapeHtml(brand.name)}</h3>
          ${brand.description ? `<p class="brand-description">${escapeHtml(brand.description)}</p>` : ''}
        </div>
      </div>

      <div class="brand-stats">
        <div class="stat">
          <span class="stat-value">${brand.total_social_accounts || 0}</span>
          <span class="stat-label">Social Accounts</span>
        </div>
        <div class="stat">
          <span class="stat-value">${brand.posts_count || 0}</span>
          <span class="stat-label">Posts</span>
        </div>
        <div class="stat">
          <span class="stat-value">${brand.scheduled_posts_count || 0}</span>
          <span class="stat-label">Scheduled</span>
        </div>
      </div>

      <div class="brand-actions">
        <button data-action="view" data-brand-id="${brand.id}" class="btn btn-secondary btn-sm brand-action-btn">
          View Details
        </button>
        <button data-action="edit" data-brand-id="${brand.id}" class="btn btn-secondary btn-sm brand-action-btn">
          Edit
        </button>
        <button data-action="delete" data-brand-id="${brand.id}" class="btn btn-danger btn-sm brand-action-btn">
          Delete
        </button>
      </div>
    </div>
  `).join('');

  // Set up click handlers for the newly rendered buttons (only once per render)
  attachBrandActionListeners();
}

// ============================================
// SHOW CREATE BRAND MODAL
// ============================================
function showCreateBrandModal() {
  console.log('[brands.js] showCreateBrandModal called');
  currentBrand = null;
  const modal = document.getElementById('brandModal');
  const form = document.getElementById('brandForm');
  const modalTitle = document.getElementById('modalTitle');

  if (!modal) {
    console.error('[brands.js] brandModal not found in DOM');
    showBrandNotification('Error: Brand modal not found. Please refresh the page.', 'error');
    return;
  }
  if (!form) {
    console.error('[brands.js] brandForm not found in DOM');
    showBrandNotification('Error: Brand form not found. Please refresh the page.', 'error');
    return;
  }

  if (modalTitle) {
    modalTitle.textContent = 'Create New Brand';
  }

  try {
    form.reset();
  } catch (e) {
    console.error('[brands.js] Error resetting form:', e);
  }

  modal.style.display = 'block';
  console.log('[brands.js] Modal should now be visible');

  // Focus the first input field
  setTimeout(() => {
    const brandNameInput = document.getElementById('brandName');
    if (brandNameInput) {
      brandNameInput.focus();
    }
  }, 100);
}

// ============================================
// EDIT BRAND
// ============================================
async function editBrand(brandId) {
  try {
    const brand = brands.find(b => b.id === brandId);
    if (!brand) {
      throw new Error('Brand not found');
    }

    currentBrand = brand;
    const modal = document.getElementById('brandModal');

    document.getElementById('modalTitle').textContent = 'Edit Brand';
    document.getElementById('brandName').value = brand.name || '';
    document.getElementById('brandDescription').value = brand.description || '';
    document.getElementById('brandLogoUrl').value = brand.logo_url || '';

    // Set brand voice
    if (brand.brand_voice) {
      document.getElementById('brandTone').value = brand.brand_voice.tone || 'friendly';
      document.getElementById('brandStyle').value = brand.brand_voice.style || 'casual';
    }

    modal.style.display = 'block';
  } catch (error) {
    console.error('Error editing brand:', error);
    showBrandNotification('Failed to load brand details', 'error');
  }
}

// ============================================
// VIEW BRAND DETAILS
// ============================================
async function viewBrand(brandId) {
  try {
    const brand = brands.find(b => b.id === brandId);
    if (!brand) {
      throw new Error('Brand not found');
    }

    // Load brand's social accounts
    const token = getAuthToken();
    const response = await fetch(`/api/brands/${brandId}/accounts`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (!response.ok) {
      throw new Error('Failed to load brand accounts');
    }

    const data = await response.json();
    showBrandDetailsModal(brand, data.accounts);
  } catch (error) {
    console.error('Error viewing brand:', error);
    showBrandNotification('Failed to load brand details', 'error');
  }
}

// ============================================
// SHOW BRAND DETAILS MODAL
// ============================================
function showBrandDetailsModal(brand, accounts) {
  const modal = document.getElementById('brandDetailsModal');
  const content = document.getElementById('brandDetailsContent');

  const totalAccounts = (accounts.facebook?.length || 0) +
                       (accounts.instagram?.length || 0) +
                       (accounts.tiktok?.length || 0);

  content.innerHTML = `
    <div class="brand-details">
      <div class="brand-header-detail">
        ${brand.logo_url ? `<img src="${brand.logo_url}" alt="${brand.name}" class="brand-logo-large">` : ''}
        <div>
          <h2>${escapeHtml(brand.name)}</h2>
          ${brand.description ? `<p>${escapeHtml(brand.description)}</p>` : ''}
        </div>
      </div>

      <div class="brand-stats-detail">
        <div class="stat-card">
          <h4>${totalAccounts}</h4>
          <p>Social Accounts</p>
        </div>
        <div class="stat-card">
          <h4>${brand.posts_count || 0}</h4>
          <p>Total Posts</p>
        </div>
        <div class="stat-card">
          <h4>${brand.scheduled_posts_count || 0}</h4>
          <p>Scheduled Posts</p>
        </div>
      </div>

      <div class="brand-accounts-section">
        <h3>Connected Social Accounts</h3>

        ${renderPlatformAccounts('Facebook', accounts.facebook)}
        ${renderPlatformAccounts('Instagram', accounts.instagram)}
        ${renderPlatformAccounts('TikTok', accounts.tiktok)}
      </div>

      ${brand.brand_voice ? `
        <div class="brand-voice-section">
          <h3>Brand Voice Settings</h3>
          <div class="brand-voice-info">
            <p><strong>Tone:</strong> ${brand.brand_voice.tone || 'Not set'}</p>
            <p><strong>Style:</strong> ${brand.brand_voice.style || 'Not set'}</p>
          </div>
        </div>
      ` : ''}
    </div>
  `;

  modal.style.display = 'block';
}

function renderPlatformAccounts(platform, accounts) {
  if (!accounts || accounts.length === 0) {
    return `
      <div class="platform-accounts">
        <h4>${platform}</h4>
        <p class="text-muted">No ${platform} accounts connected</p>
      </div>
    `;
  }

  return `
    <div class="platform-accounts">
      <h4>${platform} (${accounts.length})</h4>
      <ul class="accounts-list">
        ${accounts.map(account => `
          <li>
            ${account.name || account.username || account.page_name || 'Unknown'}
            ${account.is_active ? '<span class="badge badge-success">Active</span>' : '<span class="badge badge-secondary">Inactive</span>'}
          </li>
        `).join('')}
      </ul>
    </div>
  `;
}

// ============================================
// SAVE BRAND
// ============================================
async function saveBrand(event) {
  event.preventDefault();

  const formData = {
    name: document.getElementById('brandName').value,
    description: document.getElementById('brandDescription').value,
    logo_url: document.getElementById('brandLogoUrl').value,
    brand_voice: {
      tone: document.getElementById('brandTone').value,
      style: document.getElementById('brandStyle').value
    }
  };

  try {
    const token = getAuthToken();
    if (!token) {
      showBrandNotification('Please sign in again to save brands.', 'error');
      return;
    }

    const url = currentBrand
      ? `/api/brands/${currentBrand.id}`
      : '/api/brands';

    const method = currentBrand ? 'PUT' : 'POST';

    const response = await fetch(url, {
      method,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(formData)
    });

    if (!response.ok) {
      let errMsg = `Could not save brand (${response.status})`;
      try {
        const body = await response.json();
        const main = body.error || body.message;
        const detail = body.details || body.hint || '';
        errMsg = main || errMsg;
        if (detail && detail !== main) {
          errMsg = main ? `${main}: ${detail}` : detail;
        }
      } catch (_) {
        /* ignore non-JSON error body */
      }
      throw new Error(errMsg);
    }

    showBrandNotification(currentBrand ? 'Brand updated successfully' : 'Brand created successfully', 'success');
    closeModal('brandModal');
    await loadBrands();
  } catch (error) {
    console.error('Error saving brand:', error);
    showBrandNotification(error.message || 'Failed to save brand', 'error');
  }
}

// ============================================
// DELETE BRAND
// ============================================
async function deleteBrand(brandId) {
  if (!confirm('Are you sure you want to delete this brand? This action cannot be undone.')) {
    return;
  }

  try {
    const token = getAuthToken();
    const response = await fetch(`/api/brands/${brandId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (!response.ok) {
      throw new Error('Failed to delete brand');
    }

    showBrandNotification('Brand deleted successfully', 'success');
    await loadBrands();
  } catch (error) {
    console.error('Error deleting brand:', error);
    showBrandNotification('Failed to delete brand', 'error');
  }
}

// ============================================
// MODAL FUNCTIONS
// ============================================
function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.style.display = 'none';
  }
}

// ============================================
// SETUP EVENT LISTENERS (called once on init)
// ============================================
let listenersAttached = false;

function setupEventListeners() {
  if (listenersAttached) {
    console.log('[brands.js] Event listeners already attached, skipping');
    return;
  }

  console.log('[brands.js] setupEventListeners called');

  // Brand form submit (only attach once)
  const brandForm = document.getElementById('brandForm');
  if (brandForm) {
    brandForm.addEventListener('submit', saveBrand);
    console.log('[brands.js] Form listener attached');
  }

  listenersAttached = true;
}

// Attach listeners to brand action buttons (called after each render)
function attachBrandActionListeners() {
  const brandActionButtons = document.querySelectorAll('.brand-action-btn');
  console.log(`[brands.js] Found ${brandActionButtons.length} brand action buttons`);

  brandActionButtons.forEach(button => {
    button.addEventListener('click', (e) => {
      e.preventDefault();
      const action = button.getAttribute('data-action');
      const brandId = parseInt(button.getAttribute('data-brand-id'));

      console.log(`[brands.js] Action clicked: ${action} for brand ${brandId}`);

      if (action === 'view') {
        viewBrand(brandId);
      } else if (action === 'edit') {
        editBrand(brandId);
      } else if (action === 'delete') {
        deleteBrand(brandId);
      }
    });
  });
}

// Close modal overlays when clicking the dimmed backdrop (register once;
// repeating this inside setupEventListeners stacked many handlers.)
function closeModalOnBackdropClick(event) {
  if (event.target.classList && event.target.classList.contains('modal')) {
    event.target.style.display = 'none';
  }
}
window.addEventListener('click', closeModalOnBackdropClick);

// ============================================
// UTILITY FUNCTIONS
// ============================================
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function showBrandNotification(message, type = 'info') {
  // Use dashboard's styled notification system
  if (typeof window.notify === 'function') {
    window.notify(message, type);
  } else {
    // Fallback to console + alert if notify not loaded yet
    console.log(`[${type.toUpperCase()}] ${message}`);
    alert(message);
  }
}

// ============================================
// POPULATE BRAND SELECTOR IN POST CREATION
// ============================================
async function populateBrandSelector() {
  const brandSelect = document.getElementById('brandSelect');
  if (!brandSelect) return;

  try {
    const token = getAuthToken();
    if (!token) return;

    // Add timeout to prevent freezing (5 seconds for selector)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const response = await fetch('/api/brands', {
      headers: {
        'Authorization': `Bearer ${token}`
      },
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) return;

    const data = await response.json();
    const brands = data.brands || [];

    // Clear existing options except the first one
    brandSelect.innerHTML = '<option value="">No brand - Personal post</option>';

    // Add brand options
    brands.forEach(brand => {
      const option = document.createElement('option');
      option.value = brand.id;
      option.textContent = brand.name;
      brandSelect.appendChild(option);
    });
  } catch (error) {
    if (error.name === 'AbortError') {
      console.warn('Brand selector timed out - brands API is slow');
    } else {
      console.error('Error loading brands for selector:', error);
    }
  }
}

// ============================================
// HANDLE BRAND SELECTION IN POST CREATION
// ============================================
async function handleBrandSelection() {
  const brandSelect = document.getElementById('brandSelect');
  const brandVoiceHint = document.getElementById('brandVoiceHint');
  const brandVoiceText = document.getElementById('brandVoiceText');

  if (!brandSelect || !brandVoiceHint || !brandVoiceText) return;

  const brandId = brandSelect.value;

  // Hide hint if no brand selected
  if (!brandId) {
    brandVoiceHint.style.display = 'none';
    return;
  }

  try {
    const token = getAuthToken();
    const response = await fetch(`/api/brands/${brandId}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!response.ok) {
      brandVoiceHint.style.display = 'none';
      return;
    }

    const data = await response.json();
    const brand = data.brand;

    // Show brand voice guidance if available
    if (brand && brand.brand_voice && (brand.brand_voice.tone || brand.brand_voice.style)) {
      const tone = brand.brand_voice.tone || 'neutral';
      const style = brand.brand_voice.style || 'casual';

      brandVoiceText.textContent = `Write in a ${tone} tone with a ${style} style for ${brand.name}`;
      brandVoiceHint.style.display = 'block';
    } else {
      brandVoiceHint.style.display = 'none';
    }
  } catch (error) {
    console.error('Error fetching brand details:', error);
    brandVoiceHint.style.display = 'none';
  }
}

// DISABLED: This was causing browser freezes on page load
// The brands API is hanging, which freezes the entire page
// Will be called manually when brands tab is opened instead
console.log('[brands.js] Auto-init disabled to prevent freeze');

// Call on page load - COMMENTED OUT TO FIX FREEZE
// if (document.readyState === 'loading') {
//   document.addEventListener('DOMContentLoaded', () => {
//     populateBrandSelector();
//     setupEventListeners();
//   });
// } else {
//   populateBrandSelector();
//   setupEventListeners();
// }

// Export functions for global access
window.initBrands = initBrands;
window.showCreateBrandModal = showCreateBrandModal;
window.editBrand = editBrand;
window.viewBrand = viewBrand;
window.deleteBrand = deleteBrand;
window.closeModal = closeModal;
window.populateBrandSelector = populateBrandSelector;
window.handleBrandSelection = handleBrandSelection;

console.log('🟢 [brands.js v2.2] Script fully loaded!');
console.log('🟢 [brands.js v2.2] showCreateBrandModal available:', typeof window.showCreateBrandModal);
console.log('🟢 [brands.js v2.2] Using dashboard notify system:', typeof window.notify);

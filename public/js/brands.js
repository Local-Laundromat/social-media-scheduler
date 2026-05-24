/**
 * Brand Profiles Management
 * Handles creating, editing, and managing brand profiles
 */

// State
let brands = [];
let currentBrand = null;

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
    const token = localStorage.getItem('sb-access-token');
    if (!token) {
      throw new Error('Not authenticated');
    }

    const response = await fetch('/api/brands', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (!response.ok) {
      throw new Error('Failed to load brands');
    }

    const data = await response.json();
    brands = data.brands || [];
    renderBrandsList();
  } catch (error) {
    console.error('Error loading brands:', error);
    showNotification('Failed to load brands', 'error');
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

  // Set up click handlers for the newly rendered buttons
  setupEventListeners();
}

// ============================================
// SHOW CREATE BRAND MODAL
// ============================================
function showCreateBrandModal() {
  currentBrand = null;
  const modal = document.getElementById('brandModal');
  const form = document.getElementById('brandForm');

  document.getElementById('modalTitle').textContent = 'Create New Brand';
  form.reset();

  modal.style.display = 'block';
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
    showNotification('Failed to load brand details', 'error');
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
    const token = localStorage.getItem('sb-access-token');
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
    showNotification('Failed to load brand details', 'error');
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
    const token = localStorage.getItem('sb-access-token');
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
      throw new Error('Failed to save brand');
    }

    showNotification(currentBrand ? 'Brand updated successfully' : 'Brand created successfully', 'success');
    closeModal('brandModal');
    await loadBrands();
  } catch (error) {
    console.error('Error saving brand:', error);
    showNotification('Failed to save brand', 'error');
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
    const token = localStorage.getItem('sb-access-token');
    const response = await fetch(`/api/brands/${brandId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (!response.ok) {
      throw new Error('Failed to delete brand');
    }

    showNotification('Brand deleted successfully', 'success');
    await loadBrands();
  } catch (error) {
    console.error('Error deleting brand:', error);
    showNotification('Failed to delete brand', 'error');
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
// SETUP EVENT LISTENERS
// ============================================
function setupEventListeners() {
  // Brand form submit
  const brandForm = document.getElementById('brandForm');
  if (brandForm) {
    // Remove existing listener to avoid duplicates
    brandForm.removeEventListener('submit', saveBrand);
    brandForm.addEventListener('submit', saveBrand);
  }

  // Hook up all "New Brand" buttons
  const newBrandButtons = document.querySelectorAll('button[onclick*="showCreateBrandModal"]');
  newBrandButtons.forEach(button => {
    button.removeAttribute('onclick');
    button.addEventListener('click', (e) => {
      e.preventDefault();
      showCreateBrandModal();
    });
  });

  // Hook up all modal close buttons
  const closeButtons = document.querySelectorAll('[onclick*="closeModal"]');
  closeButtons.forEach(button => {
    const modalId = button.getAttribute('onclick')?.match(/closeModal\('([^']+)'\)/)?.[1];
    if (modalId) {
      button.removeAttribute('onclick');
      button.addEventListener('click', (e) => {
        e.preventDefault();
        closeModal(modalId);
      });
    }
  });

  // Hook up brand action buttons (view, edit, delete) using data attributes
  const brandActionButtons = document.querySelectorAll('.brand-action-btn');
  brandActionButtons.forEach(button => {
    // Remove any existing listeners by cloning
    const newButton = button.cloneNode(true);
    button.parentNode?.replaceChild(newButton, button);

    newButton.addEventListener('click', (e) => {
      e.preventDefault();
      const action = newButton.getAttribute('data-action');
      const brandId = parseInt(newButton.getAttribute('data-brand-id'));

      if (action === 'view') {
        viewBrand(brandId);
      } else if (action === 'edit') {
        editBrand(brandId);
      } else if (action === 'delete') {
        deleteBrand(brandId);
      }
    });
  });

  // Also handle old-style onclick buttons (for backwards compatibility)
  const onclickButtons = document.querySelectorAll('button[onclick*="Brand"]');
  onclickButtons.forEach(button => {
    const onclick = button.getAttribute('onclick');
    if (!onclick) return;

    const viewMatch = onclick.match(/viewBrand\((\d+)\)/);
    const editMatch = onclick.match(/editBrand\((\d+)\)/);
    const deleteMatch = onclick.match(/deleteBrand\((\d+)\)/);

    button.removeAttribute('onclick');

    if (viewMatch) {
      button.addEventListener('click', (e) => {
        e.preventDefault();
        viewBrand(parseInt(viewMatch[1]));
      });
    } else if (editMatch) {
      button.addEventListener('click', (e) => {
        e.preventDefault();
        editBrand(parseInt(editMatch[1]));
      });
    } else if (deleteMatch) {
      button.addEventListener('click', (e) => {
        e.preventDefault();
        deleteBrand(parseInt(deleteMatch[1]));
      });
    }
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

function showNotification(message, type = 'info') {
  // Reuse existing notification system if available
  if (typeof window.showNotification === 'function') {
    window.showNotification(message, type);
  } else {
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
    const token = localStorage.getItem('sb-access-token');
    if (!token) return;

    const response = await fetch('/api/brands', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

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
    console.error('Error loading brands for selector:', error);
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
    const token = localStorage.getItem('sb-access-token');
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

// Call on page load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    populateBrandSelector();
    setupEventListeners();
  });
} else {
  populateBrandSelector();
  setupEventListeners();
}

// Also watch for when brands tab becomes visible
document.addEventListener('DOMContentLoaded', () => {
  const observer = new MutationObserver(() => {
    setupEventListeners();
  });

  const brandsTab = document.getElementById('brandsTab');
  if (brandsTab) {
    observer.observe(brandsTab, { childList: true, subtree: true });
  }
});

// Export functions for global access
window.initBrands = initBrands;
window.showCreateBrandModal = showCreateBrandModal;
window.editBrand = editBrand;
window.viewBrand = viewBrand;
window.deleteBrand = deleteBrand;
window.closeModal = closeModal;
window.populateBrandSelector = populateBrandSelector;
window.handleBrandSelection = handleBrandSelection;

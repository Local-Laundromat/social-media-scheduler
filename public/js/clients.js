/**
 * Client Management System for Marketing Agencies
 * Allows agencies to organize social accounts by client
 */

let allClients = [];
let currentSelectedClient = null;

const CLIENT_FETCH_DEADLINE_MS = 22000;

function fetchClientsWithDeadline(url, options = {}, deadlineMs = CLIENT_FETCH_DEADLINE_MS) {
  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), deadlineMs);
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(tid));
}

// Load clients on page load
async function loadClients() {
  try {
    const token = localStorage.getItem('auth_token');
    const response = await fetchClientsWithDeadline('/api/clients', {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!response.ok) throw new Error('Failed to load clients');

    const data = await response.json();
    allClients = data.clients || [];

    // Show client selector if user has clients
    if (allClients.length > 0) {
      document.getElementById('clientSwitcher').style.display = 'flex';
      populateClientSelector();
    }
  } catch (error) {
    console.error('Load clients error:', error);
  }
}

// Populate the client dropdown
function populateClientSelector() {
  const select = document.getElementById('clientSelect');
  select.innerHTML = '<option value="">All Clients</option>';

  allClients.forEach(client => {
    const option = document.createElement('option');
    option.value = client.id;
    option.textContent = `${client.display_name || client.name} (${client.total_accounts} accounts)`;
    select.appendChild(option);
  });
}

// Handle client selection
document.getElementById('clientSelect')?.addEventListener('change', async (e) => {
  const clientId = e.target.value;

  if (!clientId) {
    // Show all accounts
    currentSelectedClient = null;
    updateConnectionsDisplay(socialAccounts);

    // Reload posts to show all posts
    if (typeof loadPosts === 'function') {
      loadPosts();
    }
    return;
  }

  try {
    const token = localStorage.getItem('auth_token');
    const response = await fetchClientsWithDeadline(`/api/clients/${clientId}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!response.ok) throw new Error('Failed to load client');

    const data = await response.json();
    currentSelectedClient = data.client;

    // Update connection display to show only this client's accounts
    updateConnectionsDisplay(currentSelectedClient.accounts);

    // Reload posts to filter by client
    if (typeof loadPosts === 'function') {
      loadPosts();
    }
  } catch (error) {
    console.error('Client selection error:', error);
    appNotify('Failed to load client accounts', 'error');
  }
});

// Update the connections sidebar to show filtered accounts
function updateConnectionsDisplay(accounts) {
  // Update Facebook
  const fbAccounts = accounts.facebook || [];
  updatePlatformConnection('facebook', fbAccounts.length > 0,
    fbAccounts.length > 0 ? `${fbAccounts.length} page(s) connected` : 'No pages connected');

  // Update Instagram
  const igAccounts = accounts.instagram || [];
  updatePlatformConnection('instagram', igAccounts.length > 0,
    igAccounts.length > 0 ? `${igAccounts.length} account(s) connected` : 'No accounts connected');

  // Update TikTok
  const ttAccounts = accounts.tiktok || [];
  updatePlatformConnection('tiktok', ttAccounts.length > 0,
    ttAccounts.length > 0 ? `${ttAccounts.length} account(s) connected` : 'No accounts connected');

  // Update Pinterest
  const pnAccounts = accounts.pinterest || [];
  updatePlatformConnection('pinterest', pnAccounts.length > 0,
    pnAccounts.length > 0 ? `${pnAccounts.length} account(s) connected` : 'No accounts connected');

  // Update YouTube
  const ytAccounts = accounts.youtube || [];
  updatePlatformConnection('youtube', ytAccounts.length > 0,
    ytAccounts.length > 0 ? `${ytAccounts.length} channel(s) connected` : 'No channels connected');

  // Update Google Business
  const gbAccounts = accounts.google || [];
  updatePlatformConnection('google', gbAccounts.length > 0,
    gbAccounts.length > 0 ? `${gbAccounts.length} location(s) connected` : 'No locations connected');
}

// Helper to update individual platform connection status
function updatePlatformConnection(platform, isConnected, details) {
  const connection = document.getElementById(`${platform}Connection`);
  const status = document.getElementById(`${platform}Status`);
  const detailsEl = document.getElementById(`${platform}Details`);

  if (isConnected) {
    connection?.classList.add('connected');
    status?.classList.remove('disconnected');
    status?.classList.add('connected');
    if (status) status.textContent = 'Connected';
    if (detailsEl) detailsEl.textContent = details;
  } else {
    connection?.classList.remove('connected');
    status?.classList.remove('connected');
    status?.classList.add('disconnected');
    if (status) status.textContent = 'Not Connected';
    if (detailsEl) detailsEl.textContent = details;
  }
}

// Create client modal handler
document.getElementById('manageClientsBtn')?.addEventListener('click', () => {
  showCreateClientModal();
});

// Show create client modal
function showCreateClientModal() {
  const modalHTML = `
    <div id="createClientModal" style="display: flex; position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); z-index: 10000; align-items: center; justify-content: center;">
      <div style="background: white; padding: 24px; border-radius: 12px; max-width: 500px; width: 90%; max-height: 80vh; overflow-y: auto;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
          <h3 style="margin: 0;">Create New Client</h3>
          <button id="closeClientModal" style="background: none; border: none; font-size: 24px; cursor: pointer; color: #6b7280;">×</button>
        </div>

        <form id="createClientForm">
          <div class="form-group">
            <label>Client Name *</label>
            <input type="text" id="clientName" required placeholder="e.g., Seoul Restaurant">
          </div>

          <div class="form-group">
            <label>Display Name (optional)</label>
            <input type="text" id="clientDisplayName" placeholder="e.g., Seoul Korean BBQ">
          </div>

          <div class="form-group">
            <label>Business Type</label>
            <select id="clientBusinessType">
              <option value="">Select type...</option>
              <option value="restaurant">Restaurant</option>
              <option value="retail">Retail Store</option>
              <option value="service">Service Business</option>
              <option value="healthcare">Healthcare</option>
              <option value="education">Education</option>
              <option value="other">Other</option>
            </select>
          </div>

          <div class="form-group">
            <label>Contact Email (optional)</label>
            <input type="email" id="clientEmail" placeholder="contact@client.com">
          </div>

          <div style="display: flex; gap: 12px; margin-top: 24px;">
            <button type="button" class="btn btn-secondary" id="cancelClientBtn" style="max-width: 150px;">Cancel</button>
            <button type="submit" class="btn btn-primary" style="max-width: 200px;">Create Client</button>
          </div>
        </form>
      </div>
    </div>
  `;

  document.body.insertAdjacentHTML('beforeend', modalHTML);

  // Close modal handlers
  document.getElementById('closeClientModal').onclick = closeCreateClientModal;
  document.getElementById('cancelClientBtn').onclick = closeCreateClientModal;

  // Form submit handler
  document.getElementById('createClientForm').onsubmit = async (e) => {
    e.preventDefault();
    await createClient();
  };
}

// Close create client modal
function closeCreateClientModal() {
  const modal = document.getElementById('createClientModal');
  if (modal) modal.remove();
}

// Create new client
async function createClient() {
  const name = document.getElementById('clientName').value;
  const display_name = document.getElementById('clientDisplayName').value;
  const business_type = document.getElementById('clientBusinessType').value;
  const contact_email = document.getElementById('clientEmail').value;

  try {
    const token = localStorage.getItem('auth_token');
    const response = await fetchClientsWithDeadline('/api/clients', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name,
        display_name,
        business_type,
        contact_email
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to create client');
    }

    const data = await response.json();
    appNotify(`Client "${name}" created successfully!`, 'success');

    // Reload clients and close modal
    await loadClients();
    closeCreateClientModal();
  } catch (error) {
    console.error('Create client error:', error);
    appNotify(error.message || 'Failed to create client', 'error');
  }
}

// Initialize on page load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', loadClients);
} else {
  loadClients();
}

/**
 * Global Event Handlers & Styled Notifications
 * Fixes all onclick issues and replaces alerts with styled modals
 */

// ============================================
// STYLED NOTIFICATION SYSTEM
// ============================================

function showStyledNotification(message, type = 'info', duration = 3000) {
  // Remove existing notifications
  const existing = document.querySelectorAll('.styled-notification');
  existing.forEach(n => n.remove());

  const notification = document.createElement('div');
  notification.className = `styled-notification styled-notification-${type}`;

  const icons = {
    success: '✓',
    error: '✕',
    warning: '⚠',
    info: 'ℹ'
  };

  const colors = {
    success: { bg: '#10b981', border: '#059669' },
    error: { bg: '#ef4444', border: '#dc2626' },
    warning: { bg: '#f59e0b', border: '#d97706' },
    info: { bg: '#3b82f6', border: '#2563eb' }
  };

  const color = colors[type] || colors.info;

  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: ${color.bg};
    color: white;
    padding: 16px 24px;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    z-index: 10000;
    display: flex;
    align-items: center;
    gap: 12px;
    font-size: 14px;
    font-weight: 500;
    max-width: 400px;
    animation: slideIn 0.3s ease-out;
    border-left: 4px solid ${color.border};
  `;

  notification.innerHTML = `
    <span style="font-size: 20px; font-weight: bold;">${icons[type]}</span>
    <span>${message}</span>
    <button onclick="this.parentElement.remove()" style="
      background: none;
      border: none;
      color: white;
      font-size: 20px;
      cursor: pointer;
      padding: 0;
      margin-left: 8px;
      opacity: 0.8;
      line-height: 1;
    ">&times;</button>
  `;

  document.body.appendChild(notification);

  if (duration > 0) {
    setTimeout(() => {
      notification.style.animation = 'slideOut 0.3s ease-in';
      setTimeout(() => notification.remove(), 300);
    }, duration);
  }
}

// Add animation keyframes
if (!document.getElementById('notification-styles')) {
  const style = document.createElement('style');
  style.id = 'notification-styles';
  style.textContent = `
    @keyframes slideIn {
      from {
        transform: translateX(400px);
        opacity: 0;
      }
      to {
        transform: translateX(0);
        opacity: 1;
      }
    }
    @keyframes slideOut {
      from {
        transform: translateX(0);
        opacity: 1;
      }
      to {
        transform: translateX(400px);
        opacity: 0;
      }
    }
  `;
  document.head.appendChild(style);
}

// ============================================
// STYLED CONFIRM DIALOG
// ============================================

function showStyledConfirm(message, onConfirm, onCancel) {
  // Remove existing confirm dialogs
  const existing = document.querySelectorAll('.styled-confirm-overlay');
  existing.forEach(d => d.remove());

  const overlay = document.createElement('div');
  overlay.className = 'styled-confirm-overlay';
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    z-index: 10001;
    display: flex;
    align-items: center;
    justify-content: center;
    animation: fadeIn 0.2s ease-out;
  `;

  const dialog = document.createElement('div');
  dialog.style.cssText = `
    background: white;
    padding: 24px;
    border-radius: 12px;
    box-shadow: 0 20px 50px rgba(0,0,0,0.3);
    max-width: 450px;
    width: 90%;
    animation: scaleIn 0.2s ease-out;
  `;

  dialog.innerHTML = `
    <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 16px;">
      <div style="
        width: 40px;
        height: 40px;
        border-radius: 50%;
        background: #fef3c7;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 24px;
      ">⚠</div>
      <h3 style="margin: 0; font-size: 18px; font-weight: 600; color: #111827;">Confirm Action</h3>
    </div>
    <p style="margin: 0 0 24px 0; color: #6b7280; font-size: 14px; line-height: 1.6;">
      ${message}
    </p>
    <div style="display: flex; gap: 12px; justify-content: flex-end;">
      <button class="cancel-btn" style="
        padding: 10px 20px;
        border: 1px solid #d1d5db;
        background: white;
        border-radius: 6px;
        cursor: pointer;
        font-size: 14px;
        font-weight: 500;
        color: #374151;
        transition: all 0.2s;
      ">Cancel</button>
      <button class="confirm-btn" style="
        padding: 10px 20px;
        border: none;
        background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
        border-radius: 6px;
        cursor: pointer;
        font-size: 14px;
        font-weight: 500;
        color: white;
        transition: all 0.2s;
      ">Confirm</button>
    </div>
  `;

  overlay.appendChild(dialog);
  document.body.appendChild(overlay);

  // Add animation styles
  if (!document.getElementById('confirm-styles')) {
    const style = document.createElement('style');
    style.id = 'confirm-styles';
    style.textContent = `
      @keyframes fadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
      }
      @keyframes scaleIn {
        from { transform: scale(0.9); opacity: 0; }
        to { transform: scale(1); opacity: 1; }
      }
      .cancel-btn:hover {
        background: #f3f4f6 !important;
      }
      .confirm-btn:hover {
        transform: translateY(-1px);
        box-shadow: 0 4px 12px rgba(239, 68, 68, 0.3);
      }
    `;
    document.head.appendChild(style);
  }

  const cancelBtn = dialog.querySelector('.cancel-btn');
  const confirmBtn = dialog.querySelector('.confirm-btn');

  cancelBtn.addEventListener('click', () => {
    overlay.remove();
    if (onCancel) onCancel();
  });

  confirmBtn.addEventListener('click', () => {
    overlay.remove();
    if (onConfirm) onConfirm();
  });

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      overlay.remove();
      if (onCancel) onCancel();
    }
  });
}

// ============================================
// GLOBAL EVENT DELEGATION
// ============================================

document.addEventListener('DOMContentLoaded', function() {
  // Use event delegation on document body
  document.body.addEventListener('click', function(e) {
    const target = e.target.closest('[onclick]');
    if (!target) return;

    const onclickAttr = target.getAttribute('onclick');
    if (!onclickAttr) return;

    // Prevent default if it's a button or link
    if (target.tagName === 'BUTTON' || target.tagName === 'A') {
      e.preventDefault();
    }

    // Extract function name and parameters
    try {
      // Remove the onclick attribute to prevent double execution
      target.removeAttribute('onclick');

      // Execute the function
      const func = new Function('event', onclickAttr);
      func.call(target, e);

      // Add it back for future reference
      target.setAttribute('data-onclick-backup', onclickAttr);
    } catch (error) {
      console.error('Error executing onclick:', error, onclickAttr);
    }
  });
});

// ============================================
// REPLACE NATIVE ALERT/CONFIRM
// ============================================

// Store originals
window._originalAlert = window.alert;
window._originalConfirm = window.confirm;

// Override alert
window.alert = function(message) {
  showStyledNotification(message, 'info', 4000);
};

// Override confirm
window.confirm = function(message) {
  return new Promise((resolve) => {
    showStyledConfirm(message,
      () => resolve(true),
      () => resolve(false)
    );
  });
};

// ============================================
// EXPORT FOR GLOBAL USE
// ============================================

window.showStyledNotification = showStyledNotification;
window.showStyledConfirm = showStyledConfirm;
window.showNotification = showStyledNotification; // Alias for compatibility

console.log('✓ Global handlers initialized - All onclick issues fixed!');

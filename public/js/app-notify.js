/**
 * Toast notifications aligned with the Quu dashboard (Inter, gold accent, rounded cards).
 * Usage: notify('Message'); notify('Message', 'success'); notify('Message', { type: 'error', duration: 8000 });
 */
(function () {
  const CONTAINER_ID = 'app-notify-stack';

  function getContainer() {
    let el = document.getElementById(CONTAINER_ID);
    if (!el) {
      el = document.createElement('div');
      el.id = CONTAINER_ID;
      el.className = 'app-notify-stack';
      el.setAttribute('aria-live', 'polite');
      el.setAttribute('aria-relevant', 'additions');
      document.body.appendChild(el);
    }
    return el;
  }

  const defaultDuration = { success: 4200, error: 7000, warning: 5000, info: 4500 };

  function normalizeOptions(second) {
    if (second === undefined || second === null) return {};
    if (typeof second === 'string') return { type: second };
    return second;
  }

  window.notify = function notify(message, second) {
    const opts = normalizeOptions(second);
    const type = ['success', 'error', 'warning', 'info'].includes(opts.type) ? opts.type : 'info';
    const duration = typeof opts.duration === 'number' ? opts.duration : defaultDuration[type];

    const container = getContainer();
    const toast = document.createElement('div');
    toast.className = 'app-notify app-notify--' + type;
    toast.setAttribute('role', 'status');

    const icons = {
      success: '✓',
      error: '!',
      warning: '⚠',
      info: 'ℹ'
    };

    const inner = document.createElement('div');
    inner.className = 'app-notify__inner';
    inner.innerHTML =
      '<span class="app-notify__icon" aria-hidden="true">' +
      icons[type] +
      '</span>' +
      '<p class="app-notify__text"></p>' +
      '<button type="button" class="app-notify__close" aria-label="Dismiss">×</button>';

    const textEl = inner.querySelector('.app-notify__text');
    textEl.textContent = message;

    const closeBtn = inner.querySelector('.app-notify__close');
    let removed = false;
    function removeToast() {
      if (removed) return;
      removed = true;
      toast.classList.add('app-notify--out');
      window.clearTimeout(timer);
      window.setTimeout(function () {
        toast.remove();
        if (container.children.length === 0) {
          container.remove();
        }
      }, 280);
    }

    closeBtn.addEventListener('click', removeToast);
    toast.appendChild(inner);
    container.appendChild(toast);

    requestAnimationFrame(function () {
      toast.classList.add('app-notify--in');
    });

    const timer = window.setTimeout(removeToast, duration);
  };
})();

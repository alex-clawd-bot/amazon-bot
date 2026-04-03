const elements = {
  form: document.querySelector('#email-form'),
  emailInput: document.querySelector('#email-input'),
  checkButton: document.querySelector('#check-button'),
  registerButton: document.querySelector('#register-button'),
  refreshStatsButton: document.querySelector('#refresh-stats-button'),
  feedbackBanner: document.querySelector('#feedback-banner'),
  registeredCount: document.querySelector('#registered-count'),
  sentCount: document.querySelector('#sent-count'),
  pendingCount: document.querySelector('#pending-count'),
  processingCount: document.querySelector('#processing-count'),
  statusBadge: document.querySelector('#status-badge'),
  statusEmail: document.querySelector('#status-email'),
  statusDescription: document.querySelector('#status-description'),
  statusExists: document.querySelector('#status-exists'),
  statusSent: document.querySelector('#status-sent'),
  bookTitle: document.querySelector('#book-title')
};

const statusMap = {
  not_found: {
    label: '尚未登記',
    description: '這個 email 還沒加入名單，可以直接點「加入名單」。',
    className: 'not-found'
  },
  pending: {
    label: '已登記',
    description: '這個 email 已經登記成功，等待送書。',
    className: 'pending'
  },
  processing: {
    label: '處理中',
    description: '系統正在處理這個 email 的送書流程。',
    className: 'processing'
  },
  ordered: {
    label: '已送出',
    description: '這個 email 已經收到電子書。',
    className: 'sent'
  }
};

async function boot() {
  bindEvents();
  await Promise.all([loadStats(), loadBookMeta()]);
}

function bindEvents() {
  elements.form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const email = getEmailValue();
    if (!email) {
      showBanner('請先輸入 email。', 'error');
      return;
    }

    await registerEmail(email);
  });

  elements.checkButton.addEventListener('click', async () => {
    const email = getEmailValue();
    if (!email) {
      showBanner('請先輸入 email。', 'error');
      return;
    }

    await checkEmailStatus(email);
  });

  elements.refreshStatsButton.addEventListener('click', loadStats);

  elements.emailInput.addEventListener('blur', async () => {
    const email = getEmailValue();
    if (!email || !isLikelyEmail(email)) {
      return;
    }

    await checkEmailStatus(email, { silent: true });
  });
}

function getEmailValue() {
  return elements.emailInput.value.trim().toLowerCase();
}

async function registerEmail(email) {
  setBusy(true);

  try {
    const response = await fetch('/api/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });

    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || '加入名單失敗');
    }

    renderStatus(payload.status);
    renderStats(payload.stats);

    if (payload.created) {
      showBanner('已成功加入送書名單。', 'success');
      return;
    }

    if (payload.status.alreadySent) {
      showBanner('這個 email 已經收過書了。', 'warning');
      return;
    }

    showBanner('這個 email 已經在名單中。', 'warning');
  } catch (error) {
    showBanner(error.message || '加入名單失敗', 'error');
  } finally {
    setBusy(false);
  }
}

async function checkEmailStatus(email, options = {}) {
  const { silent = false } = options;
  if (!silent) {
    setBusy(true);
  }

  try {
    const response = await fetch(`/api/emails/status?email=${encodeURIComponent(email)}`);
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.error || '查詢失敗');
    }

    renderStatus(payload.status);

    if (!silent) {
      if (payload.status.exists) {
        showBanner(payload.status.alreadySent ? '這個 email 已經送過書。' : '這個 email 已存在。', 'success');
      } else {
        showBanner('這個 email 尚未登記，可以直接加入名單。', 'warning');
      }
    }
  } catch (error) {
    if (!silent) {
      showBanner(error.message || '查詢失敗', 'error');
    }
  } finally {
    if (!silent) {
      setBusy(false);
    }
  }
}

async function loadStats() {
  try {
    const response = await fetch('/api/stats');
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || '無法載入統計');
    }

    renderStats(payload.stats);
  } catch (error) {
    showBanner(error.message || '無法載入統計', 'error');
  }
}

async function loadBookMeta() {
  try {
    const response = await fetch('/health');
    const payload = await response.json();
    if (response.ok && payload?.ebook?.title) {
      elements.bookTitle.textContent = payload.ebook.title;
    }
  } catch {
  }
}

function renderStats(stats) {
  elements.registeredCount.textContent = String(stats.registeredEmails ?? 0);
  elements.sentCount.textContent = String(stats.sentEmails ?? 0);
  elements.pendingCount.textContent = String(stats.notSentEmails ?? stats.pendingEmails ?? 0);
  elements.processingCount.textContent = String(stats.processingEmails ?? 0);
}

function renderStatus(status) {
  const view = statusMap[status.status] ?? statusMap.not_found;
  elements.statusBadge.textContent = view.label;
  elements.statusBadge.className = `status-badge ${view.className}`;
  elements.statusEmail.textContent = status.email || '請先輸入 email';
  elements.statusDescription.textContent = view.description;
  elements.statusExists.textContent = status.exists ? '是' : '否';
  elements.statusSent.textContent = status.alreadySent ? '是' : '否';
}

function showBanner(message, type) {
  elements.feedbackBanner.textContent = message;
  elements.feedbackBanner.className = `feedback-banner ${type}`;
}

function setBusy(isBusy) {
  elements.checkButton.disabled = isBusy;
  elements.registerButton.disabled = isBusy;
  elements.refreshStatsButton.disabled = isBusy;
}

function isLikelyEmail(value) {
  return /[^\s@]+@[^\s@]+\.[^\s@]+/.test(value);
}

boot();

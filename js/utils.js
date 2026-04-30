// js/utils.js
export function generatePairKey(uid1, uid2) {
  return [String(uid1), String(uid2)].sort().join('__');
}

export function generateRequestId(uid1, uid2) {
  return generatePairKey(uid1, uid2);
}

export function generateBlockId(blockerUid, blockedUid) {
  return `${blockerUid}__${blockedUid}`;
}

export function safeText(value) {
  return String(value ?? '').trim();
}

export function initials(name = '') {
  const clean = safeText(name);
  if (!clean) return '?';
  const parts = clean.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase();
}

export function formatDate(value) {
  if (!value) return '';
  const date = typeof value?.toDate === 'function'
    ? value.toDate()
    : value instanceof Date
      ? value
      : new Date(value);

  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('de-DE', {
    dateStyle: 'medium',
    timeStyle: 'short'
  });
}

export function debounce(fn, wait = 250) {
  let timer = null;
  return (...args) => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => fn(...args), wait);
  };
}

export function showToast(message, type = 'info') {
  const hostId = 'toast-host';
  let host = document.getElementById(hostId);

  if (!host) {
    host = document.createElement('div');
    host.id = hostId;
    host.className = 'toast-host';
    document.body.appendChild(host);
  }

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;

  host.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('visible'));

  window.setTimeout(() => {
    toast.classList.remove('visible');
    window.setTimeout(() => toast.remove(), 180);
  }, 2400);
}

export function normalizeQuery(value) {
  return safeText(value).toLowerCase();
}

export function compareByName(a, b) {
  return safeText(a?.name).localeCompare(safeText(b?.name), 'de', { sensitivity: 'base' });
}
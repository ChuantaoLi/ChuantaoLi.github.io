/* global Image */

(() => {
  'use strict';

  const endpoint = 'https://bing.biturl.top/?resolution=1920&format=json&index=0&mkt=zh-CN';
  const storageKey = 'blog-daily-background-v1';
  let appliedDate = '';
  let loading = false;
  let refreshTimer;

  function dateKey() {
    const now = new Date();
    return [now.getFullYear(), now.getMonth() + 1, now.getDate()].join('-');
  }

  function validateUrl(value) {
    const url = new URL(value);
    if (url.protocol !== 'https:' || !['www.bing.com', 'cn.bing.com', 'bing.com'].includes(url.hostname) || url.pathname !== '/th') {
      throw new Error('Invalid wallpaper URL');
    }
    return url.href;
  }

  function preload(url) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      const timeout = setTimeout(() => {
        image.onload = null;
        image.onerror = null;
        reject(new Error('Wallpaper loading timed out'));
      }, 12000);
      image.onload = () => {
        clearTimeout(timeout);
        resolve();
      };
      image.onerror = () => {
        clearTimeout(timeout);
        reject(new Error('Wallpaper unavailable'));
      };
      image.src = url;
    });
  }

  async function applyImage(url, date) {
    const validated = validateUrl(url);
    await preload(validated);
    document.documentElement.style.setProperty('--daily-bg-image', `url("${validated}")`);
    appliedDate = date;
    return validated;
  }

  function scheduleRefresh() {
    clearTimeout(refreshTimer);
    const now = new Date();
    const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const delay = midnight - now + 1000;
    refreshTimer = setTimeout(refresh, appliedDate === dateKey() ? delay : Math.min(delay, 10 * 60 * 1000));
  }

  async function refresh() {
    if (loading || appliedDate === dateKey()) return;
    loading = true;
    const date = dateKey();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch(endpoint, {signal: controller.signal, cache: 'no-store'});
      if (!response.ok) throw new Error('Wallpaper request failed');
      const data = await response.json();
      clearTimeout(timeout);
      const url = await applyImage(data.url, date);
      try {
        localStorage.setItem(storageKey, JSON.stringify({date, url}));
      } catch (_) {
        // The background also works when browser storage is unavailable.
      }
    } catch (_) {
      // Keep the last loaded image, or the local background defined in CSS.
    } finally {
      clearTimeout(timeout);
      loading = false;
      scheduleRefresh();
    }
  }

  async function initialize() {
    try {
      const cached = JSON.parse(localStorage.getItem(storageKey));
      if (cached && cached.date && cached.url) await applyImage(cached.url, cached.date);
    } catch (_) {
      // An invalid cache must not prevent today's image from loading.
    }
    await refresh();
    scheduleRefresh();
  }

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) refresh();
  });
  window.addEventListener('online', refresh);
  initialize();
})();

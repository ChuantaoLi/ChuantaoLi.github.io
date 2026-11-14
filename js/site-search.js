(() => {
  'use strict';

  const normalize = value => String(value || '').normalize('NFKC');
  const fold = value => normalize(value).toLowerCase();
  const keywords = query => [...new Set(fold(query).trim().split(/\s+/).filter(Boolean))].slice(0, 12);
  const plainText = value => normalize(value).replace(/&#(x[0-9a-f]+|\d+);|&(amp|lt|gt|quot|apos|nbsp);/gi, (entity, code, name) => {
    if (name) return { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }[name.toLowerCase()];
    const point = code[0].toLowerCase() === 'x' ? parseInt(code.slice(1), 16) : Number(code);
    return point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : entity;
  });

  function prepareArticles(data) {
    const posts = Array.isArray(data) ? data : data.posts;
    if (!Array.isArray(posts) || !posts.length) throw new Error('Article index is empty');
    return posts.map(post => {
      if (typeof post.title !== 'string' || typeof post.path !== 'string' || typeof post.text !== 'string' ||
          !Array.isArray(post.tags) || !post.path || /^[\\/]|:/.test(post.path) || post.path.split('/').includes('..')) {
        throw new Error('Invalid article index');
      }
      const title = post.title;
      const text = plainText(post.text);
      const tags = post.tags.map(tag => String(typeof tag === 'string' ? tag : tag.name));
      return { title, text, tags, path: post.path, titleKey: fold(title), textKey: fold(text), tagKeys: tags.map(fold) };
    });
  }

  function searchArticles(posts, query) {
    const terms = keywords(query);
    if (!terms.length) return [];
    return posts.map(post => {
      let score = 0;
      for (const term of terms) {
        if (post.titleKey.includes(term)) score += 30;
        else if (post.tagKeys.some(tag => tag.includes(term))) score += 12;
        else if (post.textKey.includes(term)) score++;
        else return null;
      }
      if (post.titleKey === fold(query).trim()) score += 100;
      return { post, score };
    }).filter(Boolean).sort((a, b) => b.score - a.score || a.post.title.localeCompare(b.post.title, 'zh-CN')).map(result => result.post);
  }

  // The build checks exercise the same matching logic used in the browser.
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { prepareArticles, searchArticles, keywords };
    return;
  }

  let indexPromise;
  let indexAddress;
  let cleanup = () => {};

  function loadIndex(url) {
    if (indexPromise && indexAddress === url) return indexPromise;
    indexAddress = url;
    indexPromise = (async () => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      try {
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) throw new Error('Article index unavailable');
        return prepareArticles(await response.json());
      } finally {
        clearTimeout(timeout);
      }
    })().catch(error => {
      indexPromise = undefined;
      throw error;
    });
    return indexPromise;
  }

  function highlight(container, value, terms) {
    if (!terms.length) {
      container.textContent = value;
      return;
    }
    const escaped = terms.slice().sort((a, b) => b.length - a.length).map(term => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const pattern = new RegExp(escaped.join('|'), 'giu');
    let previous = 0;
    for (const match of value.matchAll(pattern)) {
      container.append(document.createTextNode(value.slice(previous, match.index)));
      const mark = document.createElement('mark');
      mark.textContent = match[0];
      container.append(mark);
      previous = match.index + match[0].length;
    }
    container.append(document.createTextNode(value.slice(previous)));
  }

  function excerpt(post, terms) {
    const matches = terms.map(term => post.textKey.indexOf(term)).filter(index => index !== -1);
    const start = matches.length ? Math.max(0, Math.min(...matches) - 40) : 0;
    return `${start ? '…' : ''}${post.text.slice(start, start + 180)}${post.text.length > start + 180 ? '…' : ''}`;
  }

  function initialize() {
    cleanup();
    const block = document.querySelector('[data-site-search]');
    if (!block) return;
    const form = block.querySelector('form');
    const input = block.querySelector('input[name="q"]');
    const status = block.querySelector('.site-search-status');
    const list = block.querySelector('.site-search-results');
    const retry = block.querySelector('.site-search-retry');
    const indexUrl = new URL(block.dataset.indexUrl, location.href);
    const root = new URL('.', indexUrl);
    let version = 0;
    let debounce;
    let composing = false;

    function rememberQuery(query) {
      const url = new URL(location.href);
      if (query) url.searchParams.set('q', query);
      else url.searchParams.delete('q');
      // Retain the PJAX history state while updating the shareable search URL.
      history.replaceState(history.state ? { ...history.state, url: url.href } : null, '', url);
    }

    async function search() {
      clearTimeout(debounce);
      const current = ++version;
      const query = input.value.trim().slice(0, 200);
      rememberQuery(query);
      list.replaceChildren();
      retry.hidden = true;
      if (!keywords(query).length) {
        block.removeAttribute('aria-busy');
        status.textContent = '输入关键词开始搜索。';
        return;
      }
      block.setAttribute('aria-busy', 'true');
      status.textContent = '正在搜索…';
      try {
        const posts = await loadIndex(indexUrl.href);
        if (current !== version || !block.isConnected) return;
        const matches = searchArticles(posts, query);
        const terms = keywords(query);
        const fragment = document.createDocumentFragment();
        for (const post of matches) {
          const item = document.createElement('li');
          const heading = document.createElement('h2');
          const link = document.createElement('a');
          link.href = new URL(post.path, root).href;
          highlight(link, post.title, terms);
          heading.append(link);
          item.append(heading);
          const tags = document.createElement('p');
          tags.className = 'site-search-tags';
          highlight(tags, post.tags.map(tag => `# ${tag}`).join(' · '), terms);
          const summary = document.createElement('p');
          summary.className = 'site-search-excerpt';
          highlight(summary, excerpt(post, terms), terms);
          item.append(tags, summary);
          fragment.append(item);
        }
        list.append(fragment);
        status.textContent = matches.length ? `找到 ${matches.length} 篇文章（共 ${posts.length} 篇）。` : `没有找到“${query}”。试试更短的关键词，或按系列目录阅读。`;
        // Search results are created after PJAX has parsed the page's links.
        if (window.pjax && typeof window.pjax.refresh === 'function') window.pjax.refresh(list);
      } catch (_) {
        if (current !== version || !block.isConnected) return;
        status.textContent = '搜索暂时不可用，请检查网络后重试。';
        retry.hidden = false;
      } finally {
        if (current === version && block.isConnected) block.removeAttribute('aria-busy');
      }
    }

    input.addEventListener('input', () => {
      // Invalidate an earlier request immediately, including during the debounce.
      version++;
      clearTimeout(debounce);
      if (!composing) debounce = setTimeout(search, 180);
    });
    input.addEventListener('compositionstart', () => { composing = true; });
    input.addEventListener('compositionend', () => {
      composing = false;
      clearTimeout(debounce);
      debounce = setTimeout(search, 180);
    });
    form.addEventListener('submit', event => {
      event.preventDefault();
      if (!composing) search();
    }, true);
    retry.addEventListener('click', search);
    block.querySelectorAll('[data-search-query]').forEach(button => button.addEventListener('click', () => {
      input.value = button.dataset.searchQuery;
      search();
      input.focus();
    }));
    cleanup = () => { version++; clearTimeout(debounce); };
    input.value = (new URL(location.href).searchParams.get('q') || '').slice(0, 200);
    if (input.value.trim()) search();
  }

  document.addEventListener('DOMContentLoaded', initialize);
  document.addEventListener('pjax:success', initialize);
  window.addEventListener('pjax:send', () => cleanup());
})();

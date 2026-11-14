/* global Image */
(() => {
  'use strict';

  // Keep one viewer outside the PJAX container; delegated clicks also cover new posts.
  const dialog = document.createElement('dialog');
  dialog.className = 'image-viewer';
  dialog.setAttribute('aria-label', '原图查看器');
  dialog.innerHTML = `
    <div class="image-viewer-toolbar" role="group" aria-label="图片操作">
      <output class="image-viewer-scale" aria-label="当前缩放比例">100%</output>
      <button type="button" data-action="out" aria-label="缩小" title="缩小（−）">−</button>
      <button type="button" data-action="in" aria-label="放大" title="放大（+）">+</button>
      <button type="button" data-action="fit" title="适应窗口（0）">适应窗口</button>
      <button type="button" data-action="actual" title="原始尺寸（1）">1:1</button>
      <button type="button" data-action="retry" hidden>重试原图</button>
      <button type="button" data-action="close" aria-label="关闭原图" title="关闭（Esc）">×</button>
    </div>
    <div class="image-viewer-stage"></div>
    <p class="image-viewer-status" role="status" aria-live="polite"></p>
    <p class="image-viewer-help">滚轮缩放 · 拖动查看 · 双击切换原始尺寸 · Esc 关闭</p>`;
  document.body.appendChild(dialog);

  const stage = dialog.querySelector('.image-viewer-stage');
  const percentage = dialog.querySelector('.image-viewer-scale');
  const status = dialog.querySelector('.image-viewer-status');
  const retry = dialog.querySelector('[data-action="retry"]');
  const closeButton = dialog.querySelector('[data-action="close"]');
  const controls = dialog.querySelectorAll('[data-action="in"], [data-action="out"], [data-action="fit"], [data-action="actual"]');
  let image;
  let original;
  let trigger;
  let originalUrl;
  let session = 0;
  let width = 0;
  let height = 0;
  let scale = 1;
  let fitScale = 1;
  let x = 0;
  let y = 0;
  let drag;
  let previousOverflow;

  function measure() {
    fitScale = Math.min(Math.max(1, stage.clientWidth - 24) / width, Math.max(1, stage.clientHeight - 24) / height, 1);
  }

  function render() {
    if (!width) return;
    const limitX = Math.max(0, (width * scale - stage.clientWidth) / 2);
    const limitY = Math.max(0, (height * scale - stage.clientHeight) / 2);
    x = Math.max(-limitX, Math.min(limitX, x));
    y = Math.max(-limitY, Math.min(limitY, y));
    image.style.transform = `translate(-50%, -50%) translate(${x}px, ${y}px) scale(${scale})`;
    stage.classList.toggle('is-zoomed', scale > fitScale + 0.001);
    percentage.textContent = `${Math.round(scale * 100)}%`;
    controls.forEach(button => { button.disabled = false; });
    dialog.querySelector('[data-action="out"]').disabled = scale <= fitScale + 0.001;
    dialog.querySelector('[data-action="in"]').disabled = scale >= 4;
  }

  function fit() {
    if (!width) return;
    measure();
    scale = fitScale;
    x = y = 0;
    render();
  }

  function zoom(next, clientX, clientY) {
    if (!width) return;
    next = Math.max(fitScale, Math.min(4, next));
    const rect = stage.getBoundingClientRect();
    const pointX = clientX === undefined ? 0 : clientX - rect.left - rect.width / 2;
    const pointY = clientY === undefined ? 0 : clientY - rect.top - rect.height / 2;
    x = pointX - (pointX - x) * next / scale;
    y = pointY - (pointY - y) * next / scale;
    scale = next;
    render();
  }

  function display(url, nextWidth, nextHeight) {
    const oldWidth = width;
    const wasFit = !width || Math.abs(scale - fitScale) < 0.001;
    width = nextWidth;
    height = nextHeight;
    image.width = width;
    image.height = height;
    image.src = url;
    image.hidden = false;
    measure();
    if (wasFit) {
      fit();
    } else {
      // Preserve the visible area if the reader zoomed the preview while loading.
      scale = Math.max(fitScale, Math.min(4, scale * oldWidth / width));
      render();
    }
  }

  function loadOriginal() {
    const currentSession = session;
    if (original) {
      original.onload = original.onerror = null;
      original.removeAttribute('src');
    }
    original = new Image();
    status.textContent = '正在加载原图…';
    status.hidden = false;
    retry.hidden = true;
    original.onload = () => {
      if (!dialog.open || session !== currentSession) return;
      image.onload = null;
      display(originalUrl, original.naturalWidth, original.naturalHeight);
      status.hidden = true;
    };
    original.onerror = () => {
      if (!dialog.open || session !== currentSession) return;
      status.textContent = width ? '原图加载失败，当前显示预览图。' : '图片加载失败，请重试。';
      retry.hidden = false;
    };
    // Load as an image, avoiding a navigation that may trigger an OSS download.
    original.src = originalUrl;
  }

  function open(link) {
    const thumbnail = link.querySelector('img');
    if (!thumbnail) return;
    trigger = link;
    originalUrl = thumbnail.dataset.originalSrc || link.href;
    session++;
    width = height = 0;
    x = y = 0;
    drag = null;
    stage.classList.remove('is-dragging', 'is-zoomed');
    controls.forEach(button => { button.disabled = true; });
    percentage.textContent = '—';
    image = document.createElement('img');
    image.alt = thumbnail.alt || '文章原图';
    image.draggable = false;
    image.hidden = true;
    stage.replaceChildren(image);
    previousOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    dialog.showModal();
    closeButton.focus({ preventScroll: true });
    const previewUrl = thumbnail.currentSrc || thumbnail.src;
    if (thumbnail.complete && thumbnail.naturalWidth) {
      display(previewUrl, thumbnail.naturalWidth, thumbnail.naturalHeight);
    } else {
      image.onload = () => {
        if (!width) display(previewUrl, image.naturalWidth, image.naturalHeight);
      };
      image.src = previewUrl;
    }
    loadOriginal();
  }

  dialog.addEventListener('close', () => {
    session++;
    if (original) {
      original.onload = original.onerror = null;
      original.removeAttribute('src');
      original = null;
    }
    image.onload = null;
    stage.replaceChildren();
    drag = null;
    document.documentElement.style.overflow = previousOverflow;
    if (trigger && trigger.isConnected) trigger.focus({ preventScroll: true });
  });

  dialog.querySelector('.image-viewer-toolbar').addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button) return;
    switch (button.dataset.action) {
      case 'close': dialog.close(); break;
      case 'fit': fit(); break;
      case 'actual': zoom(1); break;
      case 'in': zoom(scale * 1.25); break;
      case 'out': zoom(scale / 1.25); break;
      case 'retry': loadOriginal(); break;
    }
  });

  stage.addEventListener('wheel', event => {
    event.preventDefault();
    const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? stage.clientHeight : 1);
    zoom(scale * Math.exp(-Math.max(-120, Math.min(120, delta)) * 0.002), event.clientX, event.clientY);
  }, { passive: false });

  stage.addEventListener('dblclick', event => {
    if (event.target !== image) return;
    if (Math.abs(scale - fitScale) < 0.001) zoom(Math.max(1, fitScale * 2), event.clientX, event.clientY);
    else fit();
  });

  stage.addEventListener('pointerdown', event => {
    if (event.button !== 0 || drag) return;
    drag = { id: event.pointerId, startX: event.clientX, startY: event.clientY, x, y, background: event.target === stage, target: event.target };
    drag.target.setPointerCapture(event.pointerId);
    if (!drag.background && width) stage.classList.add('is-dragging');
    event.preventDefault();
  });

  stage.addEventListener('pointermove', event => {
    if (!drag || drag.id !== event.pointerId || drag.background) return;
    x = drag.x + event.clientX - drag.startX;
    y = drag.y + event.clientY - drag.startY;
    render();
  });

  stage.addEventListener('pointerup', event => {
    if (!drag || drag.id !== event.pointerId) return;
    const close = drag.background && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < 5;
    const target = drag.target;
    drag = null;
    stage.classList.remove('is-dragging');
    if (target.hasPointerCapture(event.pointerId)) target.releasePointerCapture(event.pointerId);
    if (close) dialog.close();
  });

  stage.addEventListener('lostpointercapture', () => {
    drag = null;
    stage.classList.remove('is-dragging');
  });

  dialog.addEventListener('keydown', event => {
    if (event.key === 'Tab') {
      const buttons = Array.from(dialog.querySelectorAll('button')).filter(button => !button.disabled && !button.hidden);
      const first = buttons[0];
      const last = buttons[buttons.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
      return;
    }
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.key === '+' || event.key === '=') zoom(scale * 1.25);
    else if (event.key === '-') zoom(scale / 1.25);
    else if (event.key === '0') fit();
    else if (event.key === '1') zoom(1);
    else return;
    event.preventDefault();
  });

  window.addEventListener('resize', () => {
    if (!dialog.open || !width) return;
    const wasFit = Math.abs(scale - fitScale) < 0.001;
    measure();
    if (wasFit) fit();
    else zoom(scale);
  });

  window.addEventListener('pjax:send', () => { if (dialog.open) dialog.close(); });
  document.addEventListener('click', event => {
    if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    const link = event.target.closest('.post-body a.life-photo-original');
    if (!link) return;
    event.preventDefault();
    event.stopPropagation();
    open(link);
  }, true);
})();

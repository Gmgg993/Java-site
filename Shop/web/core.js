/* TechParts — ядро сайта: запросы к серверу, маршруты, шапка, реклама. */
'use strict';

const App = { me: null, cfg: null, ads: {}, cart: [], viewed: new Set(), opts: {}, popupTimer: null };

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
const e = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = n => new Intl.NumberFormat('ru-RU').format(Math.round(Number(n) || 0)) + ' ₸';
const fmtDate = ms => new Date(Number(ms)).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
const fmtDateTime = ms => new Date(Number(ms)).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const fmtSize = b => b > 1048576 ? (b / 1048576).toFixed(1) + ' МБ' : Math.max(1, Math.round(b / 1024)) + ' КБ';

/* ---------- запросы ---------- */
async function api(method, path, body) {
  let res;
  try {
    res = await fetch('/api' + path, {
      method,
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'tp' },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
  } catch (err) {
    throw new Error('Нет связи с сайтом. Проверьте, что окно с программой не закрыто, и обновите страницу.');
  }
  let data = null;
  try { data = await res.json(); } catch (err) { /* пустой ответ */ }
  if (!res.ok) {
    const er = new Error((data && data.error) || 'Что-то пошло не так. Попробуйте ещё раз.');
    er.status = res.status;
    throw er;
  }
  return data;
}
const GET = p => api('GET', p);
const POST = (p, b) => api('POST', p, b || {});
const PUT = (p, b) => api('PUT', p, b || {});
const DEL = p => api('DELETE', p);

/* ---------- хранилище в браузере (корзина, закрытая реклама) ---------- */
const mem = {};
function store(key, val) {
  try {
    if (val === undefined) return localStorage.getItem(key);
    localStorage.setItem(key, val);
  } catch (err) {
    if (val === undefined) return mem[key] || null;
    mem[key] = val;
  }
  return null;
}
function sess(key, val) {
  try {
    if (val === undefined) return sessionStorage.getItem(key);
    sessionStorage.setItem(key, val);
  } catch (err) {
    if (val === undefined) return mem['s_' + key] || null;
    mem['s_' + key] = val;
  }
  return null;
}

function loadCart() {
  try { App.cart = JSON.parse(store('tp_cart') || '[]'); } catch (err) { App.cart = []; }
  if (!Array.isArray(App.cart)) App.cart = [];
}
function saveCart() {
  store('tp_cart', JSON.stringify(App.cart));
  const n = App.cart.reduce((s, i) => s + i.qty, 0);
  $$('.cart-count').forEach(el => { el.textContent = n; el.hidden = n === 0; });
}
function addToCart(id, qty) {
  id = Number(id);
  const item = App.cart.find(i => i.id === id);
  if (item) item.qty = Math.min(99, item.qty + (qty || 1)); else App.cart.push({ id, qty: qty || 1 });
  saveCart();
  toast('Товар добавлен в корзину');
}

function toast(msg, kind) {
  const box = $('#toasts');
  const t = document.createElement('div');
  t.className = 'toast ' + (kind || '');
  t.textContent = msg;
  box.appendChild(t);
  setTimeout(() => t.remove(), 3200);
}

/* ---------- значки категорий ---------- */
const ICONS = {
  cpu: '<rect x="12" y="12" width="24" height="24" rx="3"/><rect x="19" y="19" width="10" height="10"/><path d="M18 6v6M24 6v6M30 6v6M18 36v6M24 36v6M30 36v6M6 18h6M6 24h6M6 30h6M36 18h6M36 24h6M36 30h6"/>',
  gpu: '<rect x="4" y="13" width="40" height="21" rx="3"/><circle cx="17" cy="23.5" r="6"/><circle cx="33" cy="23.5" r="6"/><path d="M9 34v5M15 34v5M21 34v5"/>',
  mem: '<rect x="4" y="15" width="40" height="15" rx="2"/><path d="M10 30v6M16 30v6M22 30v6M28 30v6M34 30v6M40 30v6"/><rect x="10" y="20" width="6" height="6"/><rect x="21" y="20" width="6" height="6"/><rect x="32" y="20" width="6" height="6"/>',
  board: '<rect x="6" y="6" width="36" height="36" rx="3"/><rect x="13" y="13" width="11" height="11"/><path d="M30 12v11M35 12v11M12 31h24M12 37h14"/>',
  phone: '<rect x="14" y="4" width="20" height="40" rx="4"/><path d="M21 38h6M21 9h6"/>',
  acc: '<rect x="13" y="9" width="22" height="18" rx="3"/><path d="M19 9V3M29 9V3M24 27v5a6 6 0 0 0 6 6h6"/>',
  parts: '<circle cx="24" cy="24" r="7"/><path d="M24 5v6M24 37v6M5 24h6M37 24h6M10.6 10.6l4.2 4.2M33.2 33.2l4.2 4.2M10.6 37.4l4.2-4.2M33.2 14.8l4.2-4.2"/>'
};
const icon = (id, cls) => `<svg class="${cls || 'cicon'}" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[id] || ICONS.cpu}</svg>`;
const LOGO = '<svg viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="6" fill="#0d5c48"/><rect x="9" y="9" width="14" height="14" rx="2" fill="#10211c"/><path d="M12 5v4M16 5v4M20 5v4M12 23v4M16 23v4M20 23v4M5 12h4M5 16h4M5 20h4M23 12h4M23 16h4M23 20h4" stroke="#d9a92b" stroke-width="2"/></svg>';

const RESULT_ICON = {
  good: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9.5"/><path d="M7.5 12.5l3 3 6-6.5"/></svg>',
  warn: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3.5l9.5 16.5h-19z"/><path d="M12 10v4.5M12 17.2v.2"/></svg>',
  bad: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9.5"/><path d="M8.5 8.5l7 7M15.5 8.5l-7 7"/></svg>',
  info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9.5"/><path d="M12 11v6M12 7.6v.2"/></svg>'
};

function noteHTML(level, title, lines, extra) {
  const ls = lines && lines.length ? `<ul>${lines.map(l => `<li>${e(l)}</li>`).join('')}</ul>` : '';
  return `<div class="note ${e(level)}">${RESULT_ICON[level] || RESULT_ICON.info}<div class="txt"><p class="title">${e(title)}</p>${ls}${extra || ''}</div></div>`;
}

/* ---------- реклама ---------- */
function pickAd(place) {
  const list = App.ads[place] || [];
  return list.length ? list[Math.floor(Math.random() * list.length)] : null;
}
function adHTML(ad, place, preview) {
  const ext = /^https?:/.test(ad.link);
  const attrs = ext ? ' target="_blank" rel="sponsored noopener noreferrer"' : '';
  const img = ad.image ? `<img class="ad-img" src="${e(ad.image)}" alt="" loading="lazy">` : '';
  return `<a class="ad ad-${place} ad-${e(ad.color || 'green')}${ad.image ? ' has-img' : ''}" href="${e(ad.link || '#/')}"${attrs} data-ad="${ad.id}"${preview ? ' data-preview="1"' : ''}>
    <span class="ad-tag">Реклама</span>
    ${img}
    <span class="ad-body"><b class="ad-title">${e(ad.title)}</b>${ad.text ? `<span class="ad-text">${e(ad.text)}</span>` : ''}</span>
    ${ad.button ? `<span class="ad-btn">${e(ad.button)}</span>` : ''}
  </a>`;
}
function adSlot(place) {
  const ad = pickAd(place);
  return ad ? `<div class="adslot adslot-${place}">${adHTML(ad, place)}</div>` : '';
}
function trackAdViews() {
  $$('[data-ad]').forEach(el => {
    if (el.dataset.preview) return;
    const id = el.dataset.ad;
    if (App.viewed.has(id)) return;
    App.viewed.add(id);
    POST('/ads/' + id + '/view').catch(() => {});
  });
}
function showPopup(ad) {
  if ($('#popup')) return;
  sess('tp_popup', '1');
  const wrap = document.createElement('div');
  wrap.id = 'popup';
  wrap.className = 'popup-back';
  wrap.innerHTML = `<div class="popup" role="dialog" aria-modal="true" aria-label="Рекламное предложение">
    <button class="popup-close" type="button" aria-label="Закрыть рекламу">×</button>
    ${adHTML(ad, 'popup')}</div>`;
  document.body.appendChild(wrap);
  const close = () => { wrap.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = ev => { if (ev.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  wrap.addEventListener('click', ev => { if (ev.target === wrap || ev.target.closest('.popup-close')) close(); });
  $('.popup-close', wrap).focus();
  trackAdViews();
}
function schedulePopup() {
  if (App.opts.noAds || sess('tp_popup') || App.popupTimer) return;
  const ad = pickAd('popup');
  if (!ad) return;
  App.popupTimer = setTimeout(() => {
    App.popupTimer = null;
    if (!App.opts.noAds) showPopup(ad);
  }, 6000);
}
function bottomBarHTML() {
  if (App.opts.noAds || sess('tp_bottom')) return '';
  const ad = pickAd('bottom');
  if (!ad) return '';
  return `<div class="bottombar" id="bottombar"><div class="wrap">${adHTML(ad, 'bottom')}</div><button class="bottom-close" type="button" aria-label="Закрыть рекламу" data-close-bottom>×</button></div>`;
}

/* ---------- шапка и подвал ---------- */
function headerHTML() {
  const me = App.me;
  const n = App.cart.reduce((s, i) => s + i.qty, 0);
  const cats = (App.cfg ? App.cfg.categories : []);
  const quick = cats.filter(c => ['cpu', 'gpu', 'mem', 'phone', 'acc'].includes(c.id))
    .map(c => `<a href="#/catalog?cat=${c.id}" data-nav="/catalog?cat=${c.id}">${e(c.name)}</a>`).join('');
  return `<header class="top">
    <div class="top-main wrap">
      <a class="brand" href="#/">${LOGO}<span>TechParts</span></a>
      <form class="search" id="search" role="search">
        <label class="sr" for="q">Поиск по каталогу</label>
        <input id="q" name="q" type="search" placeholder="Найти процессор, видеокарту, смартфон…" autocomplete="off">
        <button type="submit" aria-label="Найти"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5L21 21"/></svg></button>
      </form>
      <a class="top-link" href="#/cart"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 4h2.5l2.2 10.5h10.3L20 7.5H6.4"/><circle cx="9" cy="19" r="1.5"/><circle cx="17" cy="19" r="1.5"/></svg><span>Корзина</span><b class="cart-count" ${n ? '' : 'hidden'}>${n}</b></a>
      ${me
        ? `<a class="top-link" href="#/cabinet"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21c1-4.5 4-6.5 8-6.5s7 2 8 6.5"/></svg><span>${e(me.name.split(' ')[0])}</span></a>`
        : `<a class="top-link" href="#/login"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21c1-4.5 4-6.5 8-6.5s7 2 8 6.5"/></svg><span>Войти</span></a>`}
    </div>
    <nav class="subnav" aria-label="Разделы сайта"><div class="wrap">
      <a href="#/catalog" data-nav="/catalog">Каталог</a>${quick}
      <a href="#/blog" data-nav="/blog">Статьи</a>
      <a href="#/services" data-nav="/services">Услуги</a>
      <a href="#/advisor" data-nav="/advisor">Подбор техники</a>
      ${me && me.role === 'admin' ? '<a href="#/admin" data-nav="/admin" class="admin-link">Админ-панель</a>' : ''}
    </div></nav>
  </header>`;
}

function footerHTML() {
  return `<footer class="foot"><div class="wrap foot-in">
    <div><b class="foot-brand">TechParts</b><p>Комплектующие для ПК, смартфоны, аксессуары и запчасти. Сборка и ремонт.</p></div>
    <div><b>Магазин</b><a href="#/catalog">Каталог</a><a href="#/advisor">Подбор техники</a><a href="#/blog">Статьи</a></div>
    <div><b>Сервис</b><a href="#/services">Сборка и ремонт</a><a href="#/services">Гарантия и возврат</a><a href="#/cabinet">Личный кабинет</a></div>
  </div></footer>`;
}

/* ---------- маршруты ---------- */
const routes = [];
function route(pattern, handler, opts) {
  routes.push({ re: new RegExp('^' + pattern + '$'), handler, opts: opts || {} });
}
function errorHTML(err) {
  return `<section class="empty-page"><h1>Не получилось открыть страницу</h1><p>${e(err.message)}</p><a class="btn" href="#/">На главную</a></section>`;
}

let navToken = 0;
async function navigate() {
  const token = ++navToken;
  const hash = location.hash.slice(1) || '/';
  const qi = hash.indexOf('?');
  const path = qi < 0 ? hash : hash.slice(0, qi);
  const q = Object.fromEntries(new URLSearchParams(qi < 0 ? '' : hash.slice(qi + 1)));
  let r = null;
  let params = [];
  for (const cand of routes) {
    const m = path.match(cand.re);
    if (m) { r = cand; params = m.slice(1); break; }
  }
  if (!r) {
    r = { opts: {}, handler: () => `<section class="empty-page"><h1>Страница не найдена</h1><p>Такого адреса на сайте нет. Вернитесь на главную или откройте каталог.</p><a class="btn" href="#/">На главную</a></section>` };
  }
  if (r.opts.auth && !App.me) { location.replace('#/login?next=' + encodeURIComponent(hash)); return; }
  if (r.opts.admin && (!App.me || App.me.role !== 'admin')) {
    location.replace(App.me ? '#/cabinet' : '#/login?next=' + encodeURIComponent(hash));
    return;
  }
  App.opts = r.opts;
  App.viewed.clear();
  let out;
  try {
    out = await r.handler(params, q);
  } catch (err) {
    out = errorHTML(err);
  }
  if (token !== navToken) return;
  const page = typeof out === 'string' ? { html: out } : out;
  $('#app').innerHTML = (r.opts.bare ? '' : headerHTML()) +
    (r.opts.noAds || r.opts.bare ? '' : `<div class="wrap">${adSlot('top')}</div>`) +
    `<main id="main" class="wrap${r.opts.wide ? ' wide' : ''}">${page.html}</main>` +
    (r.opts.bare ? '' : footerHTML()) + bottomBarHTML();
  document.body.classList.toggle('has-bottom', !!$('#bottombar'));
  document.title = (page.title ? page.title + ' — ' : '') + 'TechParts';
  markNav(path + (qi < 0 ? '' : '?' + new URLSearchParams(q).toString()));
  window.scrollTo(0, 0);
  if (page.after) page.after();
  trackAdViews();
  schedulePopup();
}
function markNav(full) {
  const base = full.split('?')[0];
  let best = null;
  $$('.subnav a[data-nav]').forEach(a => {
    const target = a.dataset.nav;
    if (target === full) best = a;
    else if (!best && target === base && !target.includes('?') && !full.includes('cat=')) best = a;
  });
  if (!best) {
    $$('.subnav a[data-nav]').forEach(a => { if (!a.dataset.nav.includes('?') && base.startsWith(a.dataset.nav) && a.dataset.nav !== '/') best = best || a; });
  }
  if (best) best.setAttribute('aria-current', 'page');
}

/* ---------- общие обработчики ---------- */
document.addEventListener('submit', ev => {
  if (ev.target.id === 'search') {
    ev.preventDefault();
    const q = $('#q').value.trim();
    location.hash = '#/catalog' + (q ? '?q=' + encodeURIComponent(q) : '');
  }
});
document.addEventListener('click', ev => {
  const ad = ev.target.closest('[data-ad]');
  if (ad && !ad.dataset.preview) {
    fetch('/api/ads/' + ad.dataset.ad + '/click', { method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'tp' }, body: '{}' }).catch(() => {});
  }
  if (ev.target.closest('[data-close-bottom]')) {
    sess('tp_bottom', '1');
    const b = $('#bottombar');
    if (b) b.remove();
    document.body.classList.remove('has-bottom');
  }
  const add = ev.target.closest('[data-add]');
  if (add) {
    ev.preventDefault();
    addToCart(add.dataset.add, 1);
  }
});

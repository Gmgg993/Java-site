/* TechParts — страницы магазина: главная, каталог, товар, корзина, статьи, услуги, подбор. */
'use strict';

/* ---------- карточка товара ---------- */
function productCard(p) {
  const sale = p.oldPrice > p.price ? `<span class="sale">−${Math.round((1 - p.price / p.oldPrice) * 100)}%</span>` : '';
  const out = p.stockInfo.level === 'out';
  return `<article class="pcard">
    <a class="pimg" href="#/product/${p.id}" aria-label="${e(p.name)}">${p.image ? `<img src="${e(p.image)}" alt="" loading="lazy">` : icon(p.cat, 'pico')}${sale}</a>
    <div class="pbody">
      <a class="pname" href="#/product/${p.id}">${e(p.name)}</a>
      <span class="pmeta">${e(p.catName)}${p.brand ? ', ' + e(p.brand) : ''}</span>
      <div class="pprice"><b>${money(p.price)}</b>${p.oldPrice > p.price ? `<s>${money(p.oldPrice)}</s>` : ''}</div>
      <div class="pfoot">
        <span class="stock s-${p.stockInfo.level}">${e(p.stockInfo.label)}</span>
        <button class="btn small" type="button" data-add="${p.id}" ${out ? 'disabled' : ''}>В корзину</button>
      </div>
    </div>
  </article>`;
}

function postArt(category) {
  const map = { 'Новости': 'cpu', 'Обзоры': 'gpu', 'Гайды': 'board', 'Акции': 'acc' };
  return `<span class="art art-${e(category)}">${icon(map[category] || 'cpu', 'artico')}</span>`;
}
function postCard(p) {
  return `<article class="postcard">
    <a class="postcover" href="#/post/${p.id}" aria-label="${e(p.title)}">${p.cover ? `<img src="${e(p.cover)}" alt="" loading="lazy">` : postArt(p.category)}${p.hasVideo ? '<span class="vid-badge">Видео</span>' : ''}</a>
    <div class="postbody">
      <span class="tag">${e(p.category)}</span>
      <h3><a href="#/post/${p.id}">${e(p.title)}</a></h3>
      <p>${e(p.excerpt)}</p>
      <span class="meta">${fmtDate(p.created)}, просмотров: ${p.views}</span>
    </div>
  </article>`;
}

/* ---------- главная ---------- */
route('/', async () => {
  const d = await GET('/home');
  const cats = App.cfg.categories.map(c => `<a class="cat" href="#/catalog?cat=${c.id}">${icon(c.id)}<span>${e(c.name)}</span></a>`).join('');
  const promo = d.promo;
  const feedAd = pickAd('feed');
  let posts = d.posts.map(postCard);
  if (feedAd && posts.length) posts.splice(Math.min(1, posts.length), 0, `<div class="feedad">${adHTML(feedAd, 'feed')}</div>`);
  return {
    html: `
    <section class="hero">
      <svg class="hero-art" viewBox="0 0 600 320" preserveAspectRatio="xMaxYMid slice" aria-hidden="true">
        <path class="faint" d="M0 60H140L180 100V240M600 30H420L380 70V180M0 280H120L170 230H400L450 280H600"/>
        <path class="trace" pathLength="1" d="M0 150H110L150 190H300L340 230V320"/>
        <path class="trace" pathLength="1" d="M600 210H470L430 170V0"/>
        <circle class="pad" cx="300" cy="190" r="7"/><circle class="pad" cx="430" cy="170" r="7"/><circle class="pad" cx="110" cy="150" r="7"/>
      </svg>
      <div class="hero-copy">
        <h1>Комплектующие для ПК и телефонов</h1>
        <p>Процессоры, видеокарты, память, смартфоны и аксессуары. Привезём по городу, соберём компьютер и отремонтируем телефон.</p>
        <div class="hero-actions"><a class="btn gold" href="#/catalog">Открыть каталог</a><a class="btn ghost-light" href="#/advisor">Подобрать технику</a></div>
      </div>
      <aside class="promo" aria-label="Акция дня">
        <span class="promo-label">Акция дня</span>
        <b>${e(promo.title)}</b>
        <p>${e(promo.text)}</p>
        ${promo.cat ? `<a class="link" href="#/catalog?cat=${e(promo.cat)}">Смотреть товары</a>` : `<a class="link" href="#/cabinet">Мой статус и скидка</a>`}
      </aside>
    </section>
    <section class="block"><h2>Категории</h2><div class="cats">${cats}</div></section>
    <section class="block"><div class="block-head"><h2>Популярные товары</h2><a class="link" href="#/catalog">Весь каталог</a></div>
      <div class="pgrid">${d.featured.map(productCard).join('')}</div></section>
    <section class="block"><div class="block-head"><h2>Новое в блоге</h2><a class="link" href="#/blog">Все статьи</a></div>
      <div class="postgrid">${posts.join('')}</div></section>
    <section class="strip">
      <div><b>Бесплатная доставка</b><span>по Астане и Алматы от 30 000 ₸</span></div>
      <div><b>Рассрочка на 12 месяцев</b><span>для клиентов от 18 лет</span></div>
      <div><b>Гарантия и возврат</b><span>проверьте условия в разделе «Услуги»</span></div>
    </section>`
  };
});

/* ---------- каталог ---------- */
route('/catalog', async (_, q) => {
  const qs = new URLSearchParams();
  ['cat', 'q', 'sort'].forEach(k => { if (q[k]) qs.set(k, q[k]); });
  const list = await GET('/products?' + qs.toString());
  const groups = [['pc', 'Комплектующие для ПК'], ['phone', 'Телефоны']];
  const side = groups.map(([g, title]) => `<div class="fgroup"><b>${title}</b>${App.cfg.categories.filter(c => c.group === g)
    .map(c => `<a href="#/catalog?cat=${c.id}" ${q.cat === c.id ? 'aria-current="true"' : ''}>${e(c.name)}</a>`).join('')}</div>`).join('');
  const catName = q.cat ? (App.cfg.categories.find(c => c.id === q.cat) || {}).name : '';
  const title = q.q ? `Поиск: «${q.q}»` : (catName || 'Каталог');
  const sorts = [['', 'По умолчанию'], ['price_asc', 'Сначала дешевле'], ['price_desc', 'Сначала дороже'], ['new', 'Сначала новые']];
  return {
    title: 'Каталог',
    html: `<div class="page-head"><h1>${e(title)}</h1><p>${list.length ? 'Найдено товаров: ' + list.length : ''}</p></div>
    <div class="layout">
      <aside class="filters">
        <div class="fgroup"><a href="#/catalog" ${!q.cat && !q.q ? 'aria-current="true"' : ''}>Все товары</a></div>
        ${side}
        <div class="fgroup"><label class="lbl" for="sort">Сортировка</label>
          <select id="sort">${sorts.map(([v, l]) => `<option value="${v}" ${q.sort === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
        ${adSlot('side')}
      </aside>
      <section>${list.length
        ? `<div class="pgrid cols3">${list.map(productCard).join('')}</div>`
        : `<div class="empty"><b>Ничего не нашли</b><p>Попробуйте другое слово или откройте другую категорию.</p><a class="btn" href="#/catalog">Показать все товары</a></div>`}</section>
    </div>`,
    after() {
      $('#sort').addEventListener('change', ev => {
        const p = new URLSearchParams();
        if (q.cat) p.set('cat', q.cat);
        if (q.q) p.set('q', q.q);
        if (ev.target.value) p.set('sort', ev.target.value);
        location.hash = '#/catalog' + (p.toString() ? '?' + p.toString() : '');
      });
      if (q.q) $('#q').value = q.q;
    }
  };
});

/* ---------- товар ---------- */
route('/product/(\\d+)', async ([id]) => {
  const p = await GET('/products/' + id);
  const out = p.stockInfo.level === 'out';
  return {
    title: p.name,
    html: `<nav class="crumbs"><a href="#/catalog">Каталог</a> / <a href="#/catalog?cat=${e(p.cat)}">${e(p.catName)}</a></nav>
    <section class="pdetail">
      <div class="pgallery">${p.image ? `<img src="${e(p.image)}" alt="${e(p.name)}">` : icon(p.cat, 'pico big')}</div>
      <div class="pinfo">
        <h1>${e(p.name)}</h1>
        <span class="pmeta">${e(p.catName)}${p.brand ? ', ' + e(p.brand) : ''}</span>
        <div class="pprice big"><b>${money(p.price)}</b>${p.oldPrice > p.price ? `<s>${money(p.oldPrice)}</s>` : ''}</div>
        <span class="stock s-${p.stockInfo.level}">${e(p.stockInfo.label)}</span>
        <p class="pdesc">${e(p.desc)}</p>
        <div class="buyrow"><button class="btn" type="button" data-add="${p.id}" ${out ? 'disabled' : ''}>${out ? 'Нет в наличии' : 'Добавить в корзину'}</button><a class="btn ghost" href="#/cart">Перейти в корзину</a></div>
        ${p.specs.length ? `<h2>Характеристики</h2><ul class="specs">${p.specs.map(s => `<li>${e(s)}</li>`).join('')}</ul>` : ''}
      </div>
    </section>
    ${p.similar.length ? `<section class="block"><h2>Похожие товары</h2><div class="pgrid">${p.similar.map(productCard).join('')}</div></section>` : ''}`
  };
});

/* ---------- корзина и оформление ---------- */
const checkout = { city: '', method: 'pickup', payment: 'card', address: '', phone: '', comment: '' };

route('/cart', async () => {
  if (App.me) {
    if (!checkout.city) checkout.city = App.me.city || 'astana';
    if (!checkout.phone) checkout.phone = App.me.phone || '';
    if (!checkout.address) checkout.address = App.me.address || '';
  }
  if (!checkout.city) checkout.city = 'astana';
  return { title: 'Корзина', html: '<div id="cartView"></div>', after: () => drawCart() };
});

async function drawCart(message) {
  const box = $('#cartView');
  if (!box) return;
  if (!App.cart.length) {
    box.innerHTML = `<div class="page-head"><h1>Корзина</h1></div><div class="empty"><b>В корзине пока пусто</b><p>Добавьте товары из каталога, и они появятся здесь.</p><a class="btn" href="#/catalog">Перейти в каталог</a></div>`;
    return;
  }
  let q;
  try {
    q = await POST('/quote', { items: App.cart, city: checkout.city, method: checkout.method, payment: checkout.payment });
  } catch (err) {
    box.innerHTML = noteHTML('bad', 'Не удалось посчитать заказ', [err.message]);
    return;
  }
  // убираем из корзины товары, которых уже нет
  const ids = q.lines.map(l => l.id);
  if (ids.length !== new Set(App.cart.map(i => i.id)).size) {
    App.cart = App.cart.filter(i => ids.includes(i.id));
    saveCart();
  }
  const cities = [['astana', 'Астана'], ['almaty', 'Алматы'], ['other', 'Другой регион']];
  const methods = [['pickup', 'Самовывоз'], ['courier', 'Курьер']];
  const pays = [['card', 'Банковская карта'], ['cash', 'Наличные при получении'], ['installment', 'Рассрочка на 12 месяцев'], ['wallet', 'Онлайн-кошелёк']];
  const opts = (arr, cur) => arr.map(([v, l]) => `<option value="${v}" ${cur === v ? 'selected' : ''}>${l}</option>`).join('');
  const d = q.discount;
  const lines = q.lines.map(l => `<tr>
      <td class="lname"><a href="#/product/${l.id}">${e(l.name)}</a></td>
      <td><div class="stepper"><button type="button" data-qty="${l.id}:-1" aria-label="Меньше">−</button><span>${l.qty}</span><button type="button" data-qty="${l.id}:1" aria-label="Больше">+</button></div></td>
      <td class="num">${money(l.sum)}</td>
      <td><button class="link danger" type="button" data-remove="${l.id}">Убрать</button></td></tr>`).join('');
  const blocked = App.me && false;
  box.innerHTML = `<div class="page-head"><h1>Корзина</h1></div>
  <div class="layout cart">
    <section>
      <table class="ctable"><thead><tr><th>Товар</th><th>Количество</th><th class="num">Сумма</th><th></th></tr></thead><tbody>${lines}</tbody></table>
      ${q.problems.length ? noteHTML('warn', 'Нужно поправить заказ', q.problems) : ''}
      <div class="form-card">
        <h2>Получение и оплата</h2>
        <div class="fields">
          <div class="field"><label class="lbl" for="ck-city">Город</label><select id="ck-city">${opts(cities, checkout.city)}</select></div>
          <div class="field"><label class="lbl" for="ck-method">Способ получения</label><select id="ck-method">${opts(methods, checkout.method)}</select></div>
          <div class="field"><label class="lbl" for="ck-pay">Оплата</label><select id="ck-pay">${opts(pays, checkout.payment)}</select></div>
          <div class="field"><label class="lbl" for="ck-phone">Телефон</label><input id="ck-phone" type="tel" autocomplete="tel" placeholder="+7 701 123 45 67" value="${e(checkout.phone)}"></div>
          ${checkout.method === 'courier' ? `<div class="field wide"><label class="lbl" for="ck-address">Адрес доставки</label><input id="ck-address" type="text" autocomplete="street-address" placeholder="Улица, дом, квартира" value="${e(checkout.address)}"></div>` : ''}
          <div class="field wide"><label class="lbl" for="ck-comment">Комментарий к заказу</label><input id="ck-comment" type="text" placeholder="Необязательно" value="${e(checkout.comment)}"></div>
        </div>
        <p class="hint">${e(q.delivery.note)}</p>
        ${checkout.payment === 'installment' ? `<p class="hint">${e(q.installment.reason)}</p>` : ''}
      </div>
    </section>
    <aside class="summary">
      <h2>Ваш заказ</h2>
      <dl>
        <div><dt>Товары</dt><dd>${money(q.subtotal)}</dd></div>
        ${d.amount > 0 ? `<div class="good"><dt>Скидка ${d.percent}%</dt><dd>−${money(d.amount)}</dd></div>` : ''}
        ${q.promo.amount > 0 ? `<div class="good"><dt>Акция дня</dt><dd>−${money(q.promo.amount)}</dd></div>` : ''}
        <div><dt>Доставка</dt><dd>${q.delivery.cost > 0 ? money(q.delivery.cost) : 'бесплатно'}</dd></div>
        <div class="total"><dt>Итого</dt><dd>${money(q.total)}</dd></div>
      </dl>
      ${d.reasons.length ? `<p class="hint">Скидка: ${d.reasons.map(e).join('; ')}.</p>` : (App.me ? '' : '<p class="hint">Войдите в аккаунт: скидка зависит от вашего статуса клиента.</p>')}
      ${q.giftNote ? `<p class="hint">${e(q.giftNote)}</p>` : ''}
      ${checkout.payment === 'installment' && q.installment.available ? `<p class="hint">Платёж: ${money(q.installment.monthly)} в месяц.</p>` : ''}
      <div id="cartError" role="alert">${message ? noteHTML('bad', 'Не получилось оформить заказ', [message]) : ''}</div>
      ${App.me
        ? `<button class="btn wide-btn" type="button" id="placeOrder" ${q.problems.length ? 'disabled' : ''}>Оформить заказ</button>`
        : `<a class="btn wide-btn" href="#/login?next=${encodeURIComponent('/cart')}">Войти, чтобы оформить</a><a class="link center" href="#/register">Создать аккаунт</a>`}
    </aside>
  </div>`;
}

function readCheckoutFields() {
  const g = id => { const el = $(id); return el ? el.value : null; };
  const city = g('#ck-city'); if (city !== null) checkout.city = city;
  const method = g('#ck-method'); if (method !== null) checkout.method = method;
  const pay = g('#ck-pay'); if (pay !== null) checkout.payment = pay;
  const phone = g('#ck-phone'); if (phone !== null) checkout.phone = phone;
  const addr = g('#ck-address'); if (addr !== null) checkout.address = addr;
  const com = g('#ck-comment'); if (com !== null) checkout.comment = com;
}

document.addEventListener('change', ev => {
  if (ev.target.closest('#cartView') && ev.target.matches('select')) { readCheckoutFields(); drawCart(); }
  if (ev.target.closest('#cartView') && ev.target.matches('input')) readCheckoutFields();
});
document.addEventListener('click', async ev => {
  const qty = ev.target.closest('[data-qty]');
  if (qty) {
    readCheckoutFields();
    const [id, d] = qty.dataset.qty.split(':').map(Number);
    const item = App.cart.find(i => i.id === id);
    if (item) { item.qty = Math.max(1, Math.min(99, item.qty + d)); saveCart(); drawCart(); }
  }
  const rm = ev.target.closest('[data-remove]');
  if (rm) {
    readCheckoutFields();
    App.cart = App.cart.filter(i => i.id !== Number(rm.dataset.remove));
    saveCart();
    drawCart();
  }
  if (ev.target.id === 'placeOrder') {
    readCheckoutFields();
    ev.target.disabled = true;
    try {
      const order = await POST('/checkout', { items: App.cart, city: checkout.city, method: checkout.method, payment: checkout.payment, address: checkout.address, phone: checkout.phone, comment: checkout.comment });
      App.cart = [];
      saveCart();
      $('#cartView').innerHTML = `<div class="page-head"><h1>Заказ №${order.id} оформлен</h1></div>
        ${noteHTML(order.status === 'review' ? 'warn' : 'good', order.statusText, [
          'Сумма: ' + money(order.total),
          order.status === 'call' ? 'Менеджер позвонит вам, чтобы подтвердить заказ.' : order.status === 'review' ? 'Менеджер проверит заказ и свяжется с вами.' : 'Мы начали собирать ваш заказ.',
          'Следить за статусом можно в личном кабинете.'
        ])}
        <div class="hero-actions"><a class="btn" href="#/cabinet/orders">Мои заказы</a><a class="btn ghost" href="#/catalog">Продолжить покупки</a></div>`;
    } catch (err) {
      drawCart(err.message);
    }
  }
});

/* ---------- статьи ---------- */
route('/blog', async (_, q) => {
  const qs = new URLSearchParams();
  if (q.cat) qs.set('cat', q.cat);
  if (q.q) qs.set('q', q.q);
  const list = await GET('/posts?' + qs.toString());
  const chips = ['', ...App.cfg.postCategories].map(c => `<a class="chip ${((q.cat || '') === c) ? 'on' : ''}" href="#/blog${c ? '?cat=' + encodeURIComponent(c) : ''}">${c || 'Все'}</a>`).join('');
  const cards = list.map(postCard);
  const feedAd = pickAd('feed');
  if (feedAd && cards.length) cards.splice(Math.min(2, cards.length), 0, `<div class="feedad">${adHTML(feedAd, 'feed')}</div>`);
  return {
    title: 'Статьи',
    html: `<div class="page-head"><h1>Статьи</h1><p>Обзоры, гайды и новости магазина.</p></div>
    <div class="chips">${chips}</div>
    <div class="layout blog">
      <section>${cards.length ? `<div class="postlist">${cards.join('')}</div>` : '<div class="empty"><b>Статей пока нет</b><p>Загляните позже или откройте другую рубрику.</p></div>'}</section>
      <aside>${adSlot('side')}<div class="sidebox"><b>Нужна помощь с выбором?</b><p>Ответьте на два вопроса, и мы подскажем конфигурацию.</p><a class="btn small" href="#/advisor">Подобрать технику</a></div></aside>
    </div>`
  };
});

function renderText(t) {
  return t.split(/\n{2,}/).map(block => {
    const b = block.trim();
    if (!b) return '';
    if (b.startsWith('## ')) {
      const lines = b.split('\n');
      const head = `<h2>${e(lines[0].slice(3))}</h2>`;
      const rest = lines.slice(1).join('\n').trim();
      return head + (rest ? `<p>${e(rest).replace(/\n/g, '<br>')}</p>` : '');
    }
    return `<p>${e(b).replace(/\n/g, '<br>')}</p>`;
  }).join('');
}

function playerHTML(p) {
  if (p.videoType === 'file') return `<video class="player" controls autoplay playsinline src="${e(p.videoUrl)}"></video>`;
  if (p.videoType === 'youtube') return `<iframe class="player" src="https://www.youtube-nocookie.com/embed/${e(p.videoUrl)}?autoplay=1&rel=0" title="Видео" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>`;
  return '';
}

route('/post/(\\d+)', async ([id]) => {
  const p = await GET('/posts/' + id);
  const hasVideo = p.videoType !== 'none' && p.videoUrl;
  const preAd = hasVideo ? pickAd('video') : null;
  const poster = p.cover ? `<img src="${e(p.cover)}" alt="">` : postArt(p.category);
  const videoBox = hasVideo ? `<div class="videobox" id="videobox">
      <div class="vposter">${poster}</div>
      ${preAd ? `<div class="preroll">${adHTML(preAd, 'video')}<div class="preroll-bar"><span id="skipInfo">Реклама · видео начнётся через 5 с</span><button class="btn small" type="button" id="skipAd" disabled>Пропустить</button></div></div>`
              : `<button class="playbtn" type="button" id="playNow" aria-label="Смотреть видео"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z" fill="currentColor"/></svg></button>`}
    </div>` : '';
  const gallery = p.gallery.length ? `<div class="gallery">${p.gallery.map(u => `<button type="button" class="gthumb" data-zoom="${e(u)}" aria-label="Открыть фото"><img src="${e(u)}" alt="" loading="lazy"></button>`).join('')}</div>` : '';
  return {
    title: p.title,
    html: `<nav class="crumbs"><a href="#/blog">Статьи</a> / <a href="#/blog?cat=${encodeURIComponent(p.category)}">${e(p.category)}</a></nav>
    <div class="layout blog">
      <article class="post">
        <span class="tag">${e(p.category)}</span>
        <h1>${e(p.title)}</h1>
        <span class="meta">${fmtDate(p.created)}, ${e(p.author)}, просмотров: ${p.views}</span>
        ${p.cover && !hasVideo ? `<img class="postimg" src="${e(p.cover)}" alt="">` : ''}
        ${videoBox}
        <div class="prose">${renderText(p.text)}</div>
        ${gallery}
        <div class="postend"><a class="link" href="#/blog">Все статьи</a></div>
      </article>
      <aside>${adSlot('side')}<div class="sidebox"><b>В каталоге</b><p>Комплектующие и смартфоны в наличии.</p><a class="btn small" href="#/catalog">Открыть каталог</a></div></aside>
    </div>`,
    after() {
      const box = $('#videobox');
      if (!box) return;
      const start = () => { box.innerHTML = playerHTML(p); };
      const play = $('#playNow');
      if (play) play.addEventListener('click', start);
      const skip = $('#skipAd');
      if (skip) {
        let left = 5;
        const info = $('#skipInfo');
        const timer = setInterval(() => {
          if (!document.body.contains(skip)) { clearInterval(timer); return; }
          left--;
          if (left > 0) { info.textContent = 'Реклама · видео начнётся через ' + left + ' с'; return; }
          clearInterval(timer);
          info.textContent = 'Можно пропустить рекламу';
          skip.disabled = false;
        }, 1000);
        skip.addEventListener('click', start);
      }
    }
  };
});

document.addEventListener('click', ev => {
  const z = ev.target.closest('[data-zoom]');
  if (z) {
    const back = document.createElement('div');
    back.className = 'lightbox';
    back.innerHTML = `<button type="button" class="popup-close" aria-label="Закрыть">×</button><img src="${e(z.dataset.zoom)}" alt="">`;
    const close = () => { back.remove(); document.removeEventListener('keydown', onKey); };
    const onKey = k => { if (k.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    back.addEventListener('click', close);
    document.body.appendChild(back);
  }
});

/* ---------- формы-инструменты (услуги) ---------- */
const YESNO = [['no', 'Нет'], ['yes', 'Да']];
const TOOLS = {
  service: { tab: 'Стоимость услуги', title: 'Калькулятор стоимости', btn: 'Рассчитать',
    text: 'Выберите тариф и дополнительные параметры: сразу покажем итоговую цену.',
    fields: [
      { n: 'tariff', l: 'Тариф', t: 'sel', opts: [['basic', 'Базовый, 5 000 ₸'], ['standard', 'Стандарт, 10 000 ₸'], ['premium', 'Премиум, 20 000 ₸']] },
      { n: 'devices', l: 'Количество устройств', t: 'num', ph: '1–10', def: '1' },
      { n: 'urgent', l: 'Срочно (+30%)', t: 'yn' }, { n: 'visit', l: 'Выезд мастера (+5 000 ₸)', t: 'yn' }, { n: 'ext', l: 'Гарантия 12 месяцев (+10%)', t: 'yn' }] },
  tradein: { tab: 'Trade-in', title: 'Оценка старого устройства', btn: 'Оценить',
    text: 'Сдайте старое устройство и получите скидку на новое.',
    fields: [
      { n: 'device', l: 'Устройство', t: 'sel', opts: [['phone', 'Смартфон'], ['gpu', 'Видеокарта'], ['cpu', 'Процессор']] },
      { n: 'age', l: 'Возраст, лет', t: 'num', ph: '0–15' },
      { n: 'cond', l: 'Состояние', t: 'sel', opts: [['excellent', 'Отличное'], ['good', 'Хорошее'], ['bad', 'Плохое']] }] },
  warranty: { tab: 'Гарантия', title: 'Проверка гарантии', btn: 'Проверить',
    text: 'Узнайте, действует ли гарантия на ваше устройство.',
    fields: [
      { n: 'months', l: 'Месяцев с покупки', t: 'num', ph: '0–60' },
      { n: 'receipt', l: 'Есть чек или гарантийный талон', t: 'yn' }, { n: 'damaged', l: 'Есть следы падения или жидкости', t: 'yn' }] },
  return: { tab: 'Возврат', title: 'Условия возврата', btn: 'Проверить',
    text: 'Расскажите, что случилось, и мы подскажем, как вернуть товар.',
    fields: [
      { n: 'reason', l: 'Причина возврата', t: 'sel', opts: [['unfit', 'Не подошёл'], ['defect', 'Брак']] },
      { n: 'days', l: 'Дней с покупки', t: 'num', ph: '0–365' }, { n: 'used', l: 'Товар использовался', t: 'yn' }] },
  finance: { tab: 'Рассрочка', title: 'Подойдёт ли рассрочка', btn: 'Рассчитать',
    text: 'Сравним доходы, расходы и платёж по рассрочке на 12 месяцев.',
    fields: [
      { n: 'income', l: 'Доход в месяц, ₸', t: 'num', ph: 'Например, 250000' },
      { n: 'expenses', l: 'Расходы в месяц, ₸', t: 'num', ph: 'Например, 120000' },
      { n: 'price', l: 'Цена покупки, ₸', t: 'num', ph: 'Например, 300000' }] }
};

function fieldHTML(pre, f) {
  const id = pre + '-' + f.n;
  if (f.t === 'yn') {
    const v = f.def || 'no';
    return `<div class="field"><span class="lbl" id="${id}-l">${e(f.l)}</span><div class="seg" role="group" aria-labelledby="${id}-l">${YESNO.map(([val, l]) => `<button type="button" data-val="${val}" aria-pressed="${val === v}">${l}</button>`).join('')}</div><input type="hidden" name="${f.n}" value="${v}"></div>`;
  }
  if (f.t === 'sel') {
    return `<div class="field"><label class="lbl" for="${id}">${e(f.l)}</label><select id="${id}" name="${f.n}">${f.opts.map(([v, l]) => `<option value="${v}">${e(l)}</option>`).join('')}</select></div>`;
  }
  return `<div class="field"><label class="lbl" for="${id}">${e(f.l)}</label><input id="${id}" name="${f.n}" type="text" inputmode="${f.t === 'num' ? 'decimal' : 'text'}" autocomplete="off" placeholder="${e(f.ph || '')}" value="${e(f.def || '')}"></div>`;
}
function toolForm(key) {
  const t = TOOLS[key];
  return `<form class="toolform" data-tool="${key}" novalidate>
    <h3>${e(t.title)}</h3><p class="hint">${e(t.text)}</p>
    <div class="fields">${t.fields.map(f => fieldHTML(key, f)).join('')}</div>
    <button class="btn" type="submit">${e(t.btn)}</button>
    <div class="result" aria-live="polite"></div>
  </form>`;
}

document.addEventListener('click', ev => {
  const seg = ev.target.closest('.seg button');
  if (seg) {
    const wrap = seg.parentElement;
    $$('button', wrap).forEach(b => b.setAttribute('aria-pressed', b === seg));
    wrap.nextElementSibling.value = seg.dataset.val;
  }
});
document.addEventListener('submit', async ev => {
  const f = ev.target;
  if (!f.classList.contains('toolform')) return;
  ev.preventDefault();
  const data = {};
  $$('[name]', f).forEach(el => { data[el.name] = el.value; });
  const box = $('.result', f);
  try {
    const r = await POST('/tools/' + f.dataset.tool, data);
    box.innerHTML = f.dataset.tool === 'advisor' ? '' : noteHTML(r.level, r.headline, r.lines);
    if (f.dataset.tool === 'advisor') {
      box.innerHTML = noteHTML('info', 'Мы рекомендуем', [r.advice]) +
        (r.products.length ? `<h3 class="sub">Подходящие товары из каталога</h3><div class="pgrid">${r.products.map(productCard).join('')}</div>` : '<p class="hint">Подходящих товаров в этом бюджете сейчас нет. Увеличьте бюджет или загляните в каталог.</p>');
    }
  } catch (err) {
    box.innerHTML = noteHTML('bad', 'Не получилось', [err.message], '<button type="button" class="link retry-tool">Повторить ввод</button>');
  }
});
document.addEventListener('click', ev => {
  if (ev.target.classList.contains('retry-tool')) {
    const form = ev.target.closest('form');
    const first = $('input[type=text], select', form);
    if (first) { if (first.tagName === 'INPUT') first.value = ''; first.focus(); }
  }
});

/* ---------- услуги ---------- */
route('/services', async (_, q) => {
  const services = await GET('/services');
  const keys = Object.keys(TOOLS);
  const cur = keys.includes(q.tab) ? q.tab : 'service';
  return {
    title: 'Услуги',
    html: `<div class="page-head"><h1>Услуги и поддержка</h1><p>Соберём компьютер, отремонтируем телефон, оценим старое устройство и подскажем по гарантии.</p></div>
    <div class="svc">${services.map(s => `<article class="svccard"><h3>${e(s.name)}</h3><span class="from">${e(s.from)}</span><ul>${s.features.map(f => `<li>${e(f)}</li>`).join('')}</ul></article>`).join('')}</div>
    <div class="tabs" role="tablist">${keys.map(k => `<a role="tab" aria-selected="${k === cur}" class="tab ${k === cur ? 'on' : ''}" href="#/services?tab=${k}">${e(TOOLS[k].tab)}</a>`).join('')}</div>
    <div class="form-card narrow">${toolForm(cur)}</div>
    ${adSlot('side')}`
  };
});

/* ---------- подбор техники ---------- */
route('/advisor', async () => ({
  title: 'Подбор техники',
  html: `<div class="page-head"><h1>Подбор техники</h1><p>Выберите цель и бюджет: подскажем конфигурацию и покажем подходящие товары из каталога.</p></div>
  <div class="form-card narrow"><form class="toolform" data-tool="advisor" novalidate>
    <div class="fields">
      <div class="field"><label class="lbl" for="ad-goal">Для чего нужна техника</label><select id="ad-goal" name="goal"><option value="1">Игры</option><option value="2">Работа и монтаж</option><option value="3">Учёба и офис</option><option value="4">Смартфон</option></select></div>
      <div class="field"><label class="lbl" for="ad-budget">Бюджет, ₸</label><input id="ad-budget" name="budget" type="text" inputmode="decimal" autocomplete="off" placeholder="Например, 350000"></div>
    </div>
    <button class="btn" type="submit">Подобрать</button>
    <div class="result" aria-live="polite"></div>
  </form></div>`
}));

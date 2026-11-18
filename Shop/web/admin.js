/* TechParts — админ-панель: статьи, товары, реклама, заказы, пользователи, медиатека. */
'use strict';

const ADMIN_TABS = [['', 'Обзор'], ['posts', 'Статьи'], ['products', 'Товары'], ['ads', 'Реклама'], ['orders', 'Заказы'], ['users', 'Пользователи'], ['media', 'Медиатека']];
const AD_PLACES = [
  ['top', 'Баннер под шапкой (на всех страницах магазина)'],
  ['side', 'Блок сбоку (каталог, статьи)'],
  ['feed', 'Рекламный пост в ленте статей'],
  ['popup', 'Всплывающее окно (один раз за визит)'],
  ['bottom', 'Нижняя полоса с кнопкой закрытия'],
  ['video', 'Реклама перед видео в статье']
];
const AD_COLORS = [['green', 'Зелёный'], ['gold', 'Золотой'], ['blue', 'Синий'], ['red', 'Красный'], ['dark', 'Тёмный']];
const ORDER_ST = [['new', 'Принят'], ['call', 'Ждёт звонка менеджера'], ['review', 'На проверке'], ['shipped', 'Отправлен'], ['done', 'Выполнен'], ['cancelled', 'Отменён'], ['returned', 'Возврат']];

function adminShell(tab, inner) {
  const nav = ADMIN_TABS.map(([k, l]) => `<a href="#/admin${k ? '/' + k : ''}" ${k === tab ? 'aria-current="page"' : ''}>${l}</a>`).join('');
  return `<div class="page-head"><h1>Админ-панель</h1><p>Управление магазином, статьями и рекламой.</p></div>
  <div class="layout cab"><aside class="cabnav">${nav}</aside><section class="adminbody">${inner}</section></div>`;
}

/* ---------- окно редактирования ---------- */
function modal(title, bodyHTML, onSubmit, saveText) {
  const back = document.createElement('div');
  back.className = 'modal-back';
  back.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-label="${e(title)}">
    <div class="modal-head"><h2>${e(title)}</h2><button class="x" type="button" aria-label="Закрыть">×</button></div>
    <form class="modal-body" novalidate>${bodyHTML}<div class="modal-err" role="alert"></div>
      <div class="modal-foot"><button class="btn" type="submit">${e(saveText || 'Сохранить')}</button><button class="btn ghost" type="button" data-cancel>Отмена</button></div></form></div>`;
  document.body.appendChild(back);
  document.body.classList.add('noscroll');
  const form = $('form', back);
  const close = () => { back.remove(); document.body.classList.remove('noscroll'); document.removeEventListener('keydown', onKey); };
  const onKey = k => { if (k.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  $('.x', back).addEventListener('click', close);
  $('[data-cancel]', back).addEventListener('click', close);
  form.addEventListener('submit', async ev => {
    ev.preventDefault();
    const btn = $('button[type=submit]', form);
    btn.disabled = true;
    try {
      await onSubmit(form);
      close();
    } catch (err) {
      $('.modal-err', form).innerHTML = noteHTML('bad', 'Не получилось сохранить', [err.message]);
      $('.modal-err', form).scrollIntoView({ block: 'nearest' });
    } finally { btn.disabled = false; }
  });
  const first = $('input[type=text], textarea', form);
  if (first) first.focus();
  return form;
}

/* ---------- загрузка файлов ---------- */
function previewHTML(url, kind) {
  if (!url) return '<span class="noprev">Нет файла</span>';
  if (kind === 'video') return `<video src="${e(url)}" muted preload="metadata"></video>`;
  return `<img src="${e(url)}" alt="">`;
}
function uploadHTML(name, label, kind, value, hint) {
  const accept = kind === 'video' ? 'video/mp4,video/webm' : 'image/jpeg,image/png,image/gif,image/webp';
  return `<div class="field wide upl" data-kind="${kind}">
    <span class="lbl">${e(label)}</span>
    <div class="upl-row">
      <div class="upl-prev">${previewHTML(value, kind)}</div>
      <div class="upl-ctl">
        <label class="btn small ghost upl-btn">Загрузить ${kind === 'video' ? 'видео' : 'фото'}<input type="file" accept="${accept}" hidden></label>
        <input type="text" name="${name}" class="upl-url" value="${e(value || '')}" ${kind === 'video' ? 'readonly' : ''} placeholder="${kind === 'video' ? 'Файл не выбран' : 'или вставьте ссылку https://…'}" aria-label="${e(label)}">
        <button type="button" class="link danger" data-upl-clear>Убрать</button>
        <div class="progress" hidden><span></span></div>
      </div>
    </div>${hint ? `<span class="hint">${e(hint)}</span>` : ''}</div>`;
}
function uploadFile(file, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/admin/upload?name=' + encodeURIComponent(file.name));
    xhr.setRequestHeader('X-Requested-With', 'tp');
    xhr.setRequestHeader('Content-Type', 'application/octet-stream');
    xhr.upload.onprogress = ev => { if (ev.lengthComputable) onProgress(ev.loaded / ev.total); };
    xhr.onload = () => {
      let data = null;
      try { data = JSON.parse(xhr.responseText); } catch (err) { /* нет тела */ }
      if (xhr.status >= 200 && xhr.status < 300) resolve(data);
      else reject(new Error((data && data.error) || 'Не удалось загрузить файл.'));
    };
    xhr.onerror = () => reject(new Error('Загрузка прервалась. Проверьте, что сайт запущен, и повторите.'));
    xhr.send(file);
  });
}
async function uploadWithBar(file, bar) {
  bar.hidden = false;
  const span = $('span', bar);
  span.style.width = '0%';
  try {
    return await uploadFile(file, p => { span.style.width = Math.round(p * 100) + '%'; });
  } finally { setTimeout(() => { bar.hidden = true; }, 400); }
}

document.addEventListener('change', async ev => {
  const input = ev.target;
  if (!input.matches('.upl input[type=file]')) return;
  const box = input.closest('.upl');
  const file = input.files[0];
  input.value = '';
  if (!file) return;
  try {
    const r = await uploadWithBar(file, $('.progress', box));
    $('.upl-url', box).value = r.url;
    $('.upl-prev', box).innerHTML = previewHTML(r.url, box.dataset.kind);
  } catch (err) { toast(err.message, 'bad'); }
});
document.addEventListener('input', ev => {
  const t = ev.target;
  if (t.matches('.upl-url')) $('.upl-prev', t.closest('.upl')).innerHTML = previewHTML(t.value.trim(), t.closest('.upl').dataset.kind);
});
document.addEventListener('click', ev => {
  const clr = ev.target.closest('[data-upl-clear]');
  if (clr) {
    const box = clr.closest('.upl');
    $('.upl-url', box).value = '';
    $('.upl-prev', box).innerHTML = previewHTML('', box.dataset.kind);
  }
});

/* галерея статьи: несколько фото */
function galleryHTML(urls) {
  return `<div class="field wide gal"><span class="lbl">Фото в статье (галерея)</span>
    <div class="gal-list">${urls.map(galItem).join('')}</div>
    <label class="btn small ghost upl-btn">Добавить фото<input type="file" accept="image/jpeg,image/png,image/gif,image/webp" multiple hidden></label>
    <div class="progress" hidden><span></span></div></div>`;
}
const galItem = u => `<div class="gal-item"><img src="${e(u)}" alt=""><input type="hidden" name="gallery" value="${e(u)}"><button type="button" class="x" data-gal-del aria-label="Убрать фото">×</button></div>`;
document.addEventListener('change', async ev => {
  const input = ev.target;
  if (!input.matches('.gal input[type=file]')) return;
  const box = input.closest('.gal');
  const files = Array.from(input.files);
  input.value = '';
  for (const file of files) {
    try {
      const r = await uploadWithBar(file, $('.progress', box));
      $('.gal-list', box).insertAdjacentHTML('beforeend', galItem(r.url));
    } catch (err) { toast(err.message, 'bad'); }
  }
});
document.addEventListener('click', ev => {
  const del = ev.target.closest('[data-gal-del]');
  if (del) del.closest('.gal-item').remove();
});

const opt = (arr, cur) => arr.map(([v, l]) => `<option value="${e(v)}" ${String(cur) === String(v) ? 'selected' : ''}>${e(l)}</option>`).join('');
const formVal = (f, n) => (f.elements[n] ? f.elements[n].value : '');
const checked = (f, n) => !!(f.elements[n] && f.elements[n].checked);

/* ---------- обзор ---------- */
route('/admin', async () => {
  const s = await GET('/admin/stats');
  const v = s.verdict;
  return {
    title: 'Админ-панель',
    html: adminShell('', `
      ${noteHTML(v.level, v.headline, v.todo)}
      <div class="tiles">
        <div class="tile"><span>Заказы</span><b>${s.orders}</b></div>
        <div class="tile"><span>Выручка</span><b>${money(s.revenue)}</b></div>
        <div class="tile"><span>Пользователи</span><b>${s.users}</b></div>
        <div class="tile"><span>Товаров в каталоге</span><b>${s.products}</b></div>
        <div class="tile"><span>Статьи (опубликовано)</span><b>${s.posts.published} из ${s.posts.total}</b></div>
        <div class="tile"><span>Просмотры статей</span><b>${s.posts.views}</b></div>
        <div class="tile"><span>Показы рекламы</span><b>${s.ads.views}</b></div>
        <div class="tile"><span>Клики по рекламе</span><b>${s.ads.clicks} (${s.ads.ctr}%)</b></div>
      </div>
      ${s.rating ? `<p class="hint">Оценка обслуживания: ${s.rating.avg} из 100 (${e(s.rating.mark)}), оценок: ${s.rating.count}.</p>` : ''}
      ${s.lowStock.length ? `<div class="form-card"><h3>Заканчиваются на складе</h3><ul class="plain">${s.lowStock.map(p => `<li>${e(p.name)}: ${p.stock} шт. <a class="link" href="#/admin/products">Изменить</a></li>`).join('')}</ul></div>` : ''}
      <div class="form-card"><h3>Журнал решений системы</h3>
        ${s.events.length ? `<ul class="log">${s.events.map(ev => `<li><span>${fmtDateTime(ev.time)}</span>${e(ev.text)}</li>`).join('')}</ul>` : '<p class="hint">Событий пока нет.</p>'}</div>`)
  };
}, { admin: true, noAds: true });

/* ---------- статьи ---------- */
route('/admin/posts', async () => {
  const posts = await GET('/admin/posts');
  const rows = posts.map(p => `<tr>
    <td><b>${e(p.title)}</b><br><span class="hint">${e(p.category)}${p.videoType !== 'none' ? ', есть видео' : ''}${(p.gallery || []).length ? ', фото: ' + p.gallery.length : ''}</span></td>
    <td><span class="pill ${p.published ? 'active' : 'inactive'}">${p.published ? 'Опубликована' : 'Черновик'}</span></td>
    <td class="num">${p.views || 0}</td><td>${fmtDate(p.created)}</td>
    <td class="acts"><button class="link" data-edit-post="${p.id}">Изменить</button>${p.published ? `<a class="link" href="#/post/${p.id}">Открыть</a>` : ''}<button class="link danger" data-del-post="${p.id}">Удалить</button></td></tr>`).join('');
  window.__posts = posts;
  return {
    title: 'Статьи',
    html: adminShell('posts', `<div class="block-head"><h2>Статьи</h2><button class="btn" id="newPost">Новая статья</button></div>
      <table class="atable"><thead><tr><th>Заголовок</th><th>Статус</th><th class="num">Просмотры</th><th>Дата</th><th></th></tr></thead><tbody>${rows || '<tr><td colspan="5" class="hint">Статей пока нет. Нажмите «Новая статья».</td></tr>'}</tbody></table>`)
  };
}, { admin: true, noAds: true });

function postForm(p) {
  p = p || { title: '', category: 'Новости', text: '', cover: '', videoType: 'none', videoUrl: '', gallery: [], published: true };
  const vt = p.videoType || 'none';
  return `<div class="fields">
    <div class="field wide"><label class="lbl" for="pt">Заголовок</label><input id="pt" name="title" type="text" value="${e(p.title)}" maxlength="140"></div>
    <div class="field"><label class="lbl" for="pc">Рубрика</label><select id="pc" name="category">${opt(App.cfg.postCategories.map(c => [c, c]), p.category)}</select></div>
    <div class="field"><label class="lbl" for="pp">Статус</label><select id="pp" name="published"><option value="yes" ${p.published ? 'selected' : ''}>Опубликовать на сайте</option><option value="no" ${p.published ? '' : 'selected'}>Сохранить как черновик</option></select></div>
    <div class="field wide"><label class="lbl" for="px">Текст статьи</label><textarea id="px" name="text" rows="10">${e(p.text)}</textarea>
      <span class="hint">Абзацы разделяйте пустой строкой. Строка, которая начинается с «## », станет подзаголовком.</span></div>
    ${uploadHTML('cover', 'Обложка статьи', 'image', p.cover, 'Фото JPG, PNG, GIF или WEBP до 15 МБ.')}
    <div class="field wide"><label class="lbl" for="pv">Видео</label>
      <select id="pv" name="videoType"><option value="none" ${vt === 'none' ? 'selected' : ''}>Без видео</option><option value="file" ${vt === 'file' ? 'selected' : ''}>Загрузить файл (MP4 или WEBM)</option><option value="youtube" ${vt === 'youtube' ? 'selected' : ''}>Ссылка на YouTube</option></select></div>
    <div class="wide" data-vt="file" ${vt === 'file' ? '' : 'hidden'}>${uploadHTML('videoFile', 'Видеофайл', 'video', vt === 'file' ? p.videoUrl : '', 'MP4 или WEBM до 500 МБ. Загрузка большого файла займёт время.')}</div>
    <div class="field wide" data-vt="youtube" ${vt === 'youtube' ? '' : 'hidden'}><label class="lbl" for="py">Ссылка на видео YouTube</label><input id="py" name="videoYoutube" type="text" value="${vt === 'youtube' ? 'https://youtu.be/' + e(p.videoUrl) : ''}" placeholder="https://www.youtube.com/watch?v=…"></div>
    ${galleryHTML(p.gallery || [])}
  </div>`;
}
function postPayload(f) {
  const vt = formVal(f, 'videoType');
  return {
    title: formVal(f, 'title'), category: formVal(f, 'category'), text: formVal(f, 'text'), cover: formVal(f, 'cover').trim(),
    videoType: vt, videoUrl: vt === 'file' ? formVal(f, 'videoFile') : vt === 'youtube' ? formVal(f, 'videoYoutube').trim() : '',
    gallery: $$('input[name=gallery]', f).map(i => i.value), published: formVal(f, 'published') === 'yes'
  };
}
document.addEventListener('change', ev => {
  if (ev.target.name === 'videoType') {
    const f = ev.target.closest('form');
    $$('[data-vt]', f).forEach(b => { b.hidden = b.dataset.vt !== ev.target.value; });
  }
});
document.addEventListener('click', async ev => {
  if (ev.target.id === 'newPost') {
    modal('Новая статья', postForm(), async f => { await POST('/admin/posts', postPayload(f)); toast('Статья сохранена'); navigate(); });
  }
  const ed = ev.target.closest('[data-edit-post]');
  if (ed) {
    const p = (window.__posts || []).find(x => x.id === Number(ed.dataset.editPost));
    modal('Изменить статью', postForm(p), async f => { await PUT('/admin/posts/' + p.id, postPayload(f)); toast('Изменения сохранены'); navigate(); });
  }
  const del = ev.target.closest('[data-del-post]');
  if (del && confirm('Удалить статью? Это действие нельзя отменить.')) {
    try { await DEL('/admin/posts/' + del.dataset.delPost); toast('Статья удалена'); navigate(); } catch (err) { toast(err.message, 'bad'); }
  }
});

/* ---------- товары ---------- */
route('/admin/products', async () => {
  const items = await GET('/admin/products');
  window.__products = items;
  const rows = items.map(p => `<tr>
    <td><b>${e(p.name)}</b><br><span class="hint">${e(p.catName)}${p.brand ? ', ' + e(p.brand) : ''}</span></td>
    <td class="num">${money(p.price)}</td>
    <td class="num"><span class="stock s-${p.stockInfo.level}">${p.stock} шт.</span></td>
    <td>${p.featured ? 'Да' : ''}</td>
    <td class="acts"><button class="link" data-edit-prod="${p.id}">Изменить</button><a class="link" href="#/product/${p.id}">Открыть</a><button class="link danger" data-del-prod="${p.id}">Удалить</button></td></tr>`).join('');
  return {
    title: 'Товары',
    html: adminShell('products', `<div class="block-head"><h2>Товары</h2><button class="btn" id="newProd">Добавить товар</button></div>
      <table class="atable"><thead><tr><th>Название</th><th class="num">Цена</th><th class="num">Остаток</th><th>На главной</th><th></th></tr></thead><tbody>${rows}</tbody></table>`)
  };
}, { admin: true, noAds: true });

function prodForm(p) {
  p = p || { name: '', cat: 'cpu', brand: '', price: '', oldPrice: '', stock: 10, weight: '', image: '', desc: '', specs: [], featured: false };
  return `<div class="fields">
    <div class="field wide"><label class="lbl" for="gn">Название</label><input id="gn" name="name" type="text" value="${e(p.name)}"></div>
    <div class="field"><label class="lbl" for="gc">Категория</label><select id="gc" name="cat">${opt(App.cfg.categories.map(c => [c.id, c.name]), p.cat)}</select></div>
    <div class="field"><label class="lbl" for="gb">Бренд</label><input id="gb" name="brand" type="text" value="${e(p.brand)}"></div>
    <div class="field"><label class="lbl" for="gp">Цена, ₸</label><input id="gp" name="price" type="text" inputmode="decimal" value="${p.price || ''}"></div>
    <div class="field"><label class="lbl" for="go">Старая цена, ₸</label><input id="go" name="oldPrice" type="text" inputmode="decimal" value="${p.oldPrice || ''}" placeholder="Если есть скидка"></div>
    <div class="field"><label class="lbl" for="gs">Остаток на складе</label><input id="gs" name="stock" type="text" inputmode="numeric" value="${p.stock}"></div>
    <div class="field"><label class="lbl" for="gw">Вес, кг</label><input id="gw" name="weight" type="text" inputmode="decimal" value="${p.weight || ''}"></div>
    ${uploadHTML('image', 'Фото товара', 'image', p.image, 'Если фото нет, на сайте будет значок категории.')}
    <div class="field wide"><label class="lbl" for="gd">Описание</label><textarea id="gd" name="desc" rows="3">${e(p.desc)}</textarea></div>
    <div class="field wide"><label class="lbl" for="gx">Характеристики (по одной в строке)</label><textarea id="gx" name="specs" rows="4">${e((p.specs || []).join('\n'))}</textarea></div>
    <label class="check wide"><input type="checkbox" name="featured" ${p.featured ? 'checked' : ''}> Показывать на главной странице</label>
  </div>`;
}
const prodPayload = f => ({ name: formVal(f, 'name'), cat: formVal(f, 'cat'), brand: formVal(f, 'brand'), price: formVal(f, 'price'), oldPrice: formVal(f, 'oldPrice'), stock: formVal(f, 'stock'), weight: formVal(f, 'weight'), image: formVal(f, 'image').trim(), desc: formVal(f, 'desc'), specs: formVal(f, 'specs'), featured: checked(f, 'featured') });
document.addEventListener('click', async ev => {
  if (ev.target.id === 'newProd') modal('Новый товар', prodForm(), async f => { await POST('/admin/products', prodPayload(f)); toast('Товар добавлен'); navigate(); });
  const ed = ev.target.closest('[data-edit-prod]');
  if (ed) {
    const p = (window.__products || []).find(x => x.id === Number(ed.dataset.editProd));
    modal('Изменить товар', prodForm(p), async f => { await PUT('/admin/products/' + p.id, prodPayload(f)); toast('Изменения сохранены'); navigate(); });
  }
  const del = ev.target.closest('[data-del-prod]');
  if (del && confirm('Удалить товар из каталога?')) {
    try { await DEL('/admin/products/' + del.dataset.delProd); toast('Товар удалён'); navigate(); } catch (err) { toast(err.message, 'bad'); }
  }
});

/* ---------- реклама ---------- */
route('/admin/ads', async () => {
  const ads = await GET('/admin/ads');
  window.__ads = ads;
  const placeName = id => (AD_PLACES.find(p => p[0] === id) || [id, id])[1];
  const rows = ads.map(a => `<tr>
    <td><b>${e(a.title)}</b><br><span class="hint">${e(placeName(a.placement))}</span></td>
    <td><span class="pill ${a.live ? 'active' : 'inactive'}">${a.live ? 'Показывается' : (a.active ? 'Срок истёк' : 'Выключена')}</span></td>
    <td class="num">${a.views}</td><td class="num">${a.clicks}${a.views ? ' (' + (Math.round(a.clicks * 1000 / a.views) / 10) + '%)' : ''}</td>
    <td class="acts"><button class="link" data-edit-ad="${a.id}">Изменить</button><button class="link danger" data-del-ad="${a.id}">Удалить</button></td></tr>`).join('');
  return {
    title: 'Реклама',
    html: adminShell('ads', `<div class="block-head"><h2>Реклама</h2><button class="btn" id="newAd">Новая реклама</button></div>
      <p class="hint">Рекламные места: баннер под шапкой, блок сбоку, рекламный пост в ленте, всплывающее окно, нижняя полоса и реклама перед видео. Если для места включено несколько реклам, на сайте они показываются по очереди.</p>
      <table class="atable"><thead><tr><th>Реклама</th><th>Статус</th><th class="num">Показы</th><th class="num">Клики</th><th></th></tr></thead><tbody>${rows || '<tr><td colspan="5" class="hint">Рекламы пока нет.</td></tr>'}</tbody></table>`)
  };
}, { admin: true, noAds: true });

function adForm(a) {
  a = a || { placement: 'top', title: '', text: '', button: '', link: '#/catalog', image: '', color: 'green', active: true, until: '' };
  return `<div class="fields">
    <div class="field wide"><label class="lbl" for="ap">Где показывать</label><select id="ap" name="placement">${opt(AD_PLACES, a.placement)}</select></div>
    <div class="field wide"><label class="lbl" for="at">Заголовок</label><input id="at" name="title" type="text" value="${e(a.title)}" maxlength="100"></div>
    <div class="field wide"><label class="lbl" for="ax">Текст</label><input id="ax" name="text" type="text" value="${e(a.text)}" maxlength="220"></div>
    <div class="field"><label class="lbl" for="ab">Текст кнопки</label><input id="ab" name="button" type="text" value="${e(a.button)}" maxlength="30" placeholder="Например, Смотреть"></div>
    <div class="field"><label class="lbl" for="al">Ссылка</label><input id="al" name="link" type="text" value="${e(a.link)}" placeholder="#/catalog или https://…"></div>
    <div class="field"><label class="lbl" for="ac">Цвет</label><select id="ac" name="color">${opt(AD_COLORS, a.color)}</select></div>
    <div class="field"><label class="lbl" for="au">Показывать до (необязательно)</label><input id="au" name="until" type="date" value="${e(a.until)}"></div>
    ${uploadHTML('image', 'Картинка (необязательно)', 'image', a.image)}
    <label class="check wide"><input type="checkbox" name="active" ${a.active ? 'checked' : ''}> Реклама включена</label>
    <div class="field wide"><span class="lbl">Так это увидят посетители</span><div class="adpreview" id="adPreview"></div></div>
  </div>`;
}
const adPayload = f => ({ placement: formVal(f, 'placement'), title: formVal(f, 'title'), text: formVal(f, 'text'), button: formVal(f, 'button'), link: formVal(f, 'link').trim(), image: formVal(f, 'image').trim(), color: formVal(f, 'color'), until: formVal(f, 'until'), active: checked(f, 'active') });
function bindAdPreview(f) {
  const draw = () => {
    const p = adPayload(f);
    const place = p.placement === 'popup' ? 'popup' : p.placement;
    $('#adPreview', f).innerHTML = adHTML({ id: 0, ...p }, place, true);
  };
  f.addEventListener('input', draw);
  f.addEventListener('change', draw);
  draw();
}
document.addEventListener('click', async ev => {
  if (ev.target.id === 'newAd') {
    const f = modal('Новая реклама', adForm(), async f2 => { await POST('/admin/ads', adPayload(f2)); await refreshAds(); toast('Реклама сохранена'); navigate(); });
    bindAdPreview(f);
  }
  const ed = ev.target.closest('[data-edit-ad]');
  if (ed) {
    const a = (window.__ads || []).find(x => x.id === Number(ed.dataset.editAd));
    const f = modal('Изменить рекламу', adForm(a), async f2 => { await PUT('/admin/ads/' + a.id, adPayload(f2)); await refreshAds(); toast('Изменения сохранены'); navigate(); });
    bindAdPreview(f);
  }
  const del = ev.target.closest('[data-del-ad]');
  if (del && confirm('Удалить рекламу?')) {
    try { await DEL('/admin/ads/' + del.dataset.delAd); await refreshAds(); toast('Реклама удалена'); navigate(); } catch (err) { toast(err.message, 'bad'); }
  }
});
async function refreshAds() { try { App.ads = await GET('/ads'); } catch (err) { /* оставим прежние */ } }

/* ---------- заказы ---------- */
route('/admin/orders', async () => {
  const orders = await GET('/admin/orders');
  const rows = orders.map(o => `<tr>
    <td><b>№${o.id}</b><br><span class="hint">${fmtDateTime(o.created)}</span></td>
    <td>${e(o.userName)}<br><span class="hint">${e(o.phone)}</span></td>
    <td><details><summary>${o.items.length} поз., ${money(o.total)}</summary><ul class="plain">${o.items.map(i => `<li>${e(i.name)} × ${i.qty}</li>`).join('')}</ul>
      <p class="hint">${o.method === 'courier' ? 'Курьер: ' + e(o.cityName) + ', ' + e(o.address) : 'Самовывоз'}. ${e(o.paymentName)}${o.comment ? '. Комментарий: ' + e(o.comment) : ''}</p></details></td>
    <td><span class="pill risk-${e(o.risk.level)}">${{ high: 'Высокий', medium: 'Средний', low: 'Низкий' }[o.risk.level]}</span><br><span class="hint">${(o.risk.reasons || []).map(e).join(', ')}</span></td>
    <td><select class="ost" data-order="${o.id}" aria-label="Статус заказа ${o.id}" ${o.status === 'cancelled' ? 'disabled' : ''}>${opt(ORDER_ST, o.status)}</select></td></tr>`).join('');
  return {
    title: 'Заказы',
    html: adminShell('orders', `<h2>Заказы</h2><table class="atable"><thead><tr><th>Заказ</th><th>Клиент</th><th>Состав</th><th>Риск</th><th>Статус</th></tr></thead><tbody>${rows || '<tr><td colspan="5" class="hint">Заказов пока нет.</td></tr>'}</tbody></table>`)
  };
}, { admin: true, noAds: true });
document.addEventListener('change', async ev => {
  if (!ev.target.classList.contains('ost')) return;
  try {
    await POST('/admin/orders/' + ev.target.dataset.order + '/status', { status: ev.target.value });
    toast('Статус заказа обновлён');
    if (ev.target.value === 'cancelled') navigate();
  } catch (err) { toast(err.message, 'bad'); navigate(); }
});

/* ---------- пользователи ---------- */
route('/admin/users', async () => {
  const users = await GET('/admin/users');
  const rows = users.map(u => `<tr>
    <td><b>${e(u.name)}</b><br><span class="hint">${e(u.login)}${u.role === 'admin' ? ', администратор' : ''}</span></td>
    <td><span class="pill ${u.status}">${e(u.statusText)}</span><br><span class="hint">${e(u.loyalty)}${u.partner ? ', партнёр' : ''}</span></td>
    <td class="num">${u.orders}</td><td class="num">${money(u.sum)}</td>
    <td class="acts">
      <button class="link ${u.blocked ? '' : 'danger'}" data-user="${u.id}" data-act="blocked" data-val="${!u.blocked}">${u.blocked ? 'Разблокировать' : 'Заблокировать'}</button>
      <button class="link" data-user="${u.id}" data-act="partner" data-val="${!u.partner}">${u.partner ? 'Снять партнёрскую карту' : 'Выдать партнёрскую карту'}</button>
      <button class="link" data-user="${u.id}" data-act="role" data-val="${u.role === 'admin' ? 'user' : 'admin'}">${u.role === 'admin' ? 'Снять права админа' : 'Сделать админом'}</button></td></tr>`).join('');
  return {
    title: 'Пользователи',
    html: adminShell('users', `<h2>Пользователи</h2><table class="atable"><thead><tr><th>Пользователь</th><th>Статус</th><th class="num">Заказов</th><th class="num">Сумма</th><th></th></tr></thead><tbody>${rows}</tbody></table>`)
  };
}, { admin: true, noAds: true });
document.addEventListener('click', async ev => {
  const b = ev.target.closest('[data-user]');
  if (!b) return;
  const val = b.dataset.act === 'role' ? b.dataset.val : b.dataset.val === 'true';
  try { await POST('/admin/users/' + b.dataset.user, { [b.dataset.act]: val }); toast('Готово'); navigate(); } catch (err) { toast(err.message, 'bad'); }
});

/* ---------- медиатека ---------- */
route('/admin/media', async () => {
  const files = await GET('/admin/media');
  const grid = files.map(f => `<figure class="mfile">
    <div class="mprev">${previewHTML(f.url, f.type)}</div>
    <figcaption><span>${e(f.name)}</span><span class="hint">${f.type === 'video' ? 'Видео' : 'Фото'}, ${fmtSize(f.size)}</span>
      <span class="macts"><button class="link" data-copy="${e(f.url)}">Копировать ссылку</button><button class="link danger" data-del-media="${e(f.name)}">Удалить</button></span></figcaption></figure>`).join('');
  return {
    title: 'Медиатека',
    html: adminShell('media', `<div class="block-head"><h2>Медиатека</h2>
      <label class="btn upl-btn">Загрузить файлы<input type="file" id="mediaInput" accept="image/*,video/mp4,video/webm" multiple hidden></label></div>
      <div class="progress" id="mediaBar" hidden><span></span></div>
      <p class="hint">Здесь все загруженные фото и видео. Файлы можно загружать и прямо в редакторе статьи, товара или рекламы.</p>
      <div class="mgrid">${grid || '<p class="hint">Файлов пока нет.</p>'}</div>`)
  };
}, { admin: true, noAds: true });
document.addEventListener('change', async ev => {
  if (ev.target.id !== 'mediaInput') return;
  const files = Array.from(ev.target.files);
  ev.target.value = '';
  for (const file of files) {
    try { await uploadWithBar(file, $('#mediaBar')); } catch (err) { toast(err.message, 'bad'); }
  }
  navigate();
});
document.addEventListener('click', async ev => {
  const cp = ev.target.closest('[data-copy]');
  if (cp) {
    const url = location.origin + cp.dataset.copy;
    try { await navigator.clipboard.writeText(url); toast('Ссылка скопирована'); } catch (err) { toast(url); }
  }
  const del = ev.target.closest('[data-del-media]');
  if (del && confirm('Удалить файл? Если он используется на сайте, там появится пустое место.')) {
    try { await DEL('/admin/media/' + del.dataset.delMedia); toast('Файл удалён'); navigate(); } catch (err) { toast(err.message, 'bad'); }
  }
});

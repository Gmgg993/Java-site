/* TechParts — вход, регистрация и личный кабинет. */
'use strict';

function goNext(q) {
  const next = q && q.next ? decodeURIComponent(q.next) : '';
  location.hash = '#' + (next.startsWith('/') ? next : '/cabinet');
}

/* ---------- вход и регистрация ---------- */
route('/login', async (_, q) => {
  if (App.me) { goNext(q); return '<p class="boot">Переходим…</p>'; }
  return {
    title: 'Вход',
    noAds: true,
    html: `<div class="authwrap"><form class="form-card auth" id="loginForm" novalidate>
      <h1>Вход в аккаунт</h1>
      <div id="authErr" role="alert"></div>
      <div class="field"><label class="lbl" for="lg">Логин</label><input id="lg" name="login" type="text" autocomplete="username" autofocus></div>
      <div class="field"><label class="lbl" for="pw">Пароль</label><input id="pw" name="password" type="password" autocomplete="current-password"></div>
      <button class="btn wide-btn" type="submit">Войти</button>
      <p class="hint center">Нет аккаунта? <a class="link" href="#/register">Зарегистрироваться</a></p>
    </form></div>`,
    after() {
      $('#loginForm').addEventListener('submit', async ev => {
        ev.preventDefault();
        const f = ev.target;
        try {
          const r = await POST('/login', { login: f.login.value, password: f.password.value });
          App.me = r.user;
          toast('Добро пожаловать, ' + r.user.name + '!');
          goNext(q);
        } catch (err) {
          $('#authErr').innerHTML = noteHTML('bad', 'Не удалось войти', [err.message]);
          f.password.value = '';
          f.password.focus();
        }
      });
    }
  };
}, { noAds: true });

route('/register', async (_, q) => {
  if (App.me) { goNext(q); return '<p class="boot">Переходим…</p>'; }
  return {
    title: 'Регистрация',
    html: `<div class="authwrap"><form class="form-card auth" id="regForm" novalidate>
      <h1>Создать аккаунт</h1>
      <div id="authErr" role="alert"></div>
      <div class="field"><label class="lbl" for="rn">Ваше имя</label><input id="rn" name="name" type="text" autocomplete="name" autofocus></div>
      <div class="field"><label class="lbl" for="rl">Логин</label><input id="rl" name="login" type="text" autocomplete="username" placeholder="Например, name@mail.kz или nickname"></div>
      <div class="field"><label class="lbl" for="rp">Пароль</label><input id="rp" name="password" type="password" autocomplete="new-password" placeholder="Не короче 6 символов"></div>
      <div class="field"><label class="lbl" for="rp2">Повторите пароль</label><input id="rp2" name="password2" type="password" autocomplete="new-password"></div>
      <button class="btn wide-btn" type="submit">Зарегистрироваться</button>
      <p class="hint center">Уже есть аккаунт? <a class="link" href="#/login">Войти</a></p>
    </form></div>`,
    after() {
      $('#regForm').addEventListener('submit', async ev => {
        ev.preventDefault();
        const f = ev.target;
        const fail = msg => { $('#authErr').innerHTML = noteHTML('bad', 'Проверьте данные', [msg]); };
        if (f.password.value !== f.password2.value) { fail('Пароли не совпадают. Введите один и тот же пароль дважды.'); return; }
        try {
          const r = await POST('/register', { name: f.name.value, login: f.login.value, password: f.password.value });
          App.me = r.user;
          toast('Аккаунт создан. Добро пожаловать!');
          goNext(q);
        } catch (err) { fail(err.message); }
      });
    }
  };
}, { noAds: true });

async function logout() {
  try { await POST('/logout'); } catch (err) { /* уже вышли */ }
  App.me = null;
  location.hash = '#/';
  navigate();
}

/* ---------- кабинет ---------- */
const CAB_TABS = [['', 'Обзор'], ['orders', 'Заказы'], ['profile', 'Профиль'], ['security', 'Безопасность']];

function cabinetShell(tab, inner) {
  const nav = CAB_TABS.map(([k, l]) => `<a href="#/cabinet${k ? '/' + k : ''}" ${k === tab ? 'aria-current="page"' : ''}>${l}</a>`).join('');
  return `<div class="page-head"><h1>Личный кабинет</h1></div>
  <div class="layout cab"><aside class="cabnav">${nav}${App.me.role === 'admin' ? '<a href="#/admin" class="admin-link">Админ-панель</a>' : ''}<button type="button" class="link danger" id="logoutBtn">Выйти</button></aside><section>${inner}</section></div>`;
}

document.addEventListener('click', ev => { if (ev.target.id === 'logoutBtn') logout(); });

route('/cabinet', async () => {
  const d = await GET('/cabinet');
  App.me = d.user;
  const a = d.analysis;
  const u = d.user;
  const bar = Math.max(0, Math.min(100, Math.round(a.score / 11 * 100)));
  const notices = [];
  if (u.status === 'blocked') notices.push(noteHTML('bad', 'Аккаунт заблокирован', ['Оформление заказов недоступно. Обратитесь в поддержку.']));
  if (u.status === 'inactive') notices.push(noteHTML('warn', 'Давно не заходили', ['Загляните в каталог: цены и наличие обновились.']));
  if (d.ageGroup === 'child') notices.push(noteHTML('warn', 'Вам меньше 14 лет', ['Заказы оформляют родители. Вы можете смотреть каталог и статьи.']));
  if (d.ageGroup === 'senior') notices.push(noteHTML('good', 'Скидка для пенсионеров', ['К вашей скидке добавляется 5%.']));
  return {
    title: 'Личный кабинет',
    html: cabinetShell('', `
      <div class="welcome"><h2>Здравствуйте, ${e(u.name)}!</h2>
        <div class="chips2"><span class="pill ${u.status}">${e(u.statusText)}</span><span class="pill vip-${d.loyalty.status}">${e(d.loyalty.text)}</span></div></div>
      ${notices.join('')}
      <div class="cab-grid">
        <div class="form-card"><h3>Уровень клиента</h3>
          <p class="lvl lvl-${a.level}">${e(a.levelText)}</p>
          <div class="meter" role="img" aria-label="Баллы: ${a.score}"><span style="width:${bar}%"></span></div>
          <p class="hint">Баллов: ${a.score}. Высокий уровень начинается с 8 баллов.</p>
          <table class="mini">${a.parts.map(p => `<tr><td>${e(p.name)}</td><td>${e(p.note)}</td><td class="num">${p.points > 0 ? '+' : ''}${p.points}</td></tr>`).join('')}</table>
        </div>
        <div class="form-card"><h3>Ваши скидки и рассрочка</h3>
          <p>${d.loyalty.status === 'vip' ? 'Вы VIP-клиент: к скидке добавляется 5%.' : d.loyalty.status === 'regular' ? 'Вы постоянный клиент: к скидке добавляется 2%.' : 'Сделайте несколько заказов, и скидка вырастет.'}</p>
          ${d.loyalty.reasons.length ? `<p class="hint">Причина: ${d.loyalty.reasons.map(e).join('; ')}.</p>` : ''}
          ${noteHTML(d.installment.available ? 'good' : 'info', d.installment.available ? 'Рассрочка доступна' : 'Рассрочка пока недоступна', [d.installment.available ? 'Рассрочка на 12 месяцев доступна при оформлении заказа.' : d.installment.reason])}
          <h3 class="sub">Рекомендации для вас</h3>
          <ul class="recs">${a.recs.map(r => `<li>${e(r)}</li>`).join('')}</ul>
        </div>
      </div>`)
  };
}, { auth: true, noAds: true });

route('/cabinet/orders', async () => {
  const orders = await GET('/orders');
  const list = orders.length ? orders.map(o => {
    const rated = o.rating >= 0;
    const rate = o.status === 'done' ? (rated
      ? `<p class="hint">Ваша оценка обслуживания: ${o.rating} из 100.</p>`
      : `<form class="rateform" data-order="${o.id}"><label class="lbl" for="rt${o.id}">Оцените обслуживание</label><div class="rate"><input id="rt${o.id}" type="range" min="0" max="100" value="80"><output>80</output><button class="btn small" type="submit">Оценить</button></div><div class="result"></div></form>`) : '';
    return `<article class="order">
      <div class="order-head"><b>Заказ №${o.id}</b><span class="hint">${fmtDate(o.created)}</span><span class="pill st-${e(o.status)}">${e(o.statusText)}</span></div>
      <ul class="order-items">${o.items.map(i => `<li>${e(i.name)} × ${i.qty}<span>${money(i.price * i.qty)}</span></li>`).join('')}</ul>
      <div class="order-foot"><span>${o.method === 'courier' ? 'Курьер: ' + e(o.cityName) + ', ' + e(o.address) : 'Самовывоз'}. ${e(o.paymentName)}</span><b>${money(o.total)}</b></div>
      ${rate}</article>`;
  }).join('') : '<div class="empty"><b>Заказов пока нет</b><p>Когда вы что-нибудь закажете, он появится здесь.</p><a class="btn" href="#/catalog">Перейти в каталог</a></div>';
  return { title: 'Мои заказы', html: cabinetShell('orders', `<h2>Мои заказы</h2>${list}`) };
}, { auth: true, noAds: true });

document.addEventListener('input', ev => {
  if (ev.target.matches('.rate input[type=range]')) ev.target.nextElementSibling.textContent = ev.target.value;
});
document.addEventListener('submit', async ev => {
  const f = ev.target;
  if (!f.classList.contains('rateform')) return;
  ev.preventDefault();
  const box = $('.result', f);
  try {
    const r = await POST('/orders/' + f.dataset.order + '/rate', { points: $('input[type=range]', f).value });
    box.innerHTML = noteHTML(r.passed ? 'good' : 'warn', 'Спасибо за оценку! Оценка: ' + r.mark, []);
    $('.rate', f).hidden = true;
  } catch (err) {
    box.innerHTML = noteHTML('bad', 'Не получилось', [err.message]);
  }
});

route('/cabinet/profile', async () => {
  const u = await GET('/profile');
  App.me = u;
  const cities = [['', 'Не выбран'], ['astana', 'Астана'], ['almaty', 'Алматы'], ['other', 'Другой регион']];
  return {
    title: 'Профиль',
    html: cabinetShell('profile', `<form class="form-card" id="profileForm" novalidate>
      <h2>Профиль</h2>
      <p class="hint">Дата рождения и доход нужны, чтобы проверить рассрочку. Мы никому их не показываем.</p>
      <div id="profErr" role="alert"></div>
      <div class="fields">
        <div class="field"><label class="lbl" for="pn">Имя</label><input id="pn" name="name" type="text" value="${e(u.name)}"></div>
        <div class="field"><label class="lbl" for="pe">Электронная почта</label><input id="pe" name="email" type="email" value="${e(u.email)}" placeholder="name@mail.kz"></div>
        <div class="field"><label class="lbl" for="pph">Телефон</label><input id="pph" name="phone" type="tel" value="${e(u.phone)}" placeholder="+7 701 123 45 67"></div>
        <div class="field"><label class="lbl" for="pb">Дата рождения</label><input id="pb" name="birth" type="date" value="${e(u.birth)}"></div>
        <div class="field"><label class="lbl" for="pi">Доход в месяц, ₸</label><input id="pi" name="income" type="text" inputmode="decimal" value="${u.income || ''}" placeholder="Например, 200000"></div>
        <div class="field"><label class="lbl" for="pc">Город</label><select id="pc" name="city">${cities.map(([v, l]) => `<option value="${v}" ${u.city === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
        <div class="field wide"><label class="lbl" for="pa">Адрес доставки</label><input id="pa" name="address" type="text" value="${e(u.address)}" placeholder="Улица, дом, квартира"></div>
      </div>
      <button class="btn" type="submit">Сохранить</button>
    </form>`),
    after() {
      $('#profileForm').addEventListener('submit', async ev => {
        ev.preventDefault();
        const f = ev.target;
        try {
          App.me = await PUT('/profile', { name: f.name.value, email: f.email.value, phone: f.phone.value, birth: f.birth.value, income: f.income.value, city: f.city.value, address: f.address.value });
          $('#profErr').innerHTML = noteHTML('good', 'Профиль сохранён', []);
          toast('Профиль сохранён');
        } catch (err) { $('#profErr').innerHTML = noteHTML('bad', 'Не получилось сохранить', [err.message]); }
      });
    }
  };
}, { auth: true, noAds: true });

route('/cabinet/security', async () => ({
  title: 'Безопасность',
  html: cabinetShell('security', `<form class="form-card" id="pwForm" novalidate>
    <h2>Смена пароля</h2>
    <div id="pwErr" role="alert"></div>
    <div class="fields">
      <div class="field wide"><label class="lbl" for="po">Текущий пароль</label><input id="po" name="old" type="password" autocomplete="current-password"></div>
      <div class="field"><label class="lbl" for="pn1">Новый пароль</label><input id="pn1" name="n1" type="password" autocomplete="new-password" placeholder="Не короче 6 символов"></div>
      <div class="field"><label class="lbl" for="pn2">Повторите новый пароль</label><input id="pn2" name="n2" type="password" autocomplete="new-password"></div>
    </div>
    <button class="btn" type="submit">Сменить пароль</button>
  </form>`),
  after() {
    $('#pwForm').addEventListener('submit', async ev => {
      ev.preventDefault();
      const f = ev.target;
      const box = $('#pwErr');
      if (f.n1.value !== f.n2.value) { box.innerHTML = noteHTML('bad', 'Пароли не совпадают', ['Введите новый пароль дважды одинаково.']); return; }
      try {
        await POST('/password', { old: f.old.value, new: f.n1.value });
        box.innerHTML = noteHTML('good', 'Пароль изменён', []);
        f.reset();
      } catch (err) { box.innerHTML = noteHTML('bad', 'Не получилось сменить пароль', [err.message]); }
    });
  }
}), { auth: true, noAds: true });

/* TechParts — запуск сайта. */
'use strict';

(async function boot() {
  loadCart();
  try {
    const [me, cfg, ads] = await Promise.all([GET('/me'), GET('/config'), GET('/ads')]);
    App.me = me.user;
    App.cfg = cfg;
    App.ads = ads;
  } catch (err) {
    $('#app').innerHTML = `<section class="empty-page"><h1>Сайт не отвечает</h1><p>${e(err.message)}</p></section>`;
    return;
  }
  window.addEventListener('hashchange', navigate);
  navigate();
})();

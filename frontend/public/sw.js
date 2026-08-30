// CEO AI 2.0 service worker — push com botões de ação (v2)
self.addEventListener('push', (event) => {
  let data = { title: 'CEO AI 2.0', body: '', url: '/' };
  try { data = event.data ? event.data.json() : data; } catch (e) {}
  const options = {
    body: data.body || '',
    icon: '/logo192.png',
    badge: '/logo192.png',
    data: { url: data.url || '/', notif_id: data.notif_id || null },
    actions: Array.isArray(data.actions) ? data.actions : [],
  };
  event.waitUntil(self.registration.showNotification(data.title || 'CEO AI 2.0', options));
});

self.addEventListener('notificationclick', (event) => {
  const d = event.notification.data || {};
  const action = event.action;
  event.notification.close();

  if (action === 'snooze' && d.notif_id) {
    // Trata em segundo plano, sem abrir a app
    event.waitUntil(fetch('/api/crm/notifications/' + d.notif_id + '/snooze', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ days: 1 }),
    }).catch(() => {}));
    return;
  }

  // "approve" ou clique normal -> abre a app no módulo certo (aprovação primeiro)
  const target = (d.url || '/') + '?notif=' + (d.notif_id || '');
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) { if ('focus' in c) { c.navigate(target); return c.focus(); } }
      if (clients.openWindow) return clients.openWindow(target);
    })
  );
});

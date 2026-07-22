self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});

self.addEventListener('push', (event) => {
  let data;
  try {
    data = event.data ? event.data.json() : { title: 'mePOS Stock', body: '' };
  } catch {
    data = { title: 'mePOS Stock', body: event.data ? event.data.text() : '' };
  }

  const options = {
    body: data.body || '',
    icon: data.icon || '/favicon.svg',
    badge: data.badge || '/favicon.svg',
    data: data.data || {},
    tag: data.tag || 'default',
    vibrate: [200, 100, 200],
  };

  event.waitUntil(self.registration.showNotification(data.title || 'mePOS Stock', options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const actionUrl = event.notification.data?.actionUrl;
  const urlToOpen = actionUrl || '/app';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url.startsWith(self.location.origin) && 'focus' in client) {
          client.postMessage({ type: 'notification-click', data: event.notification.data });
          return client.focus();
        }
      }
      return clients.openWindow(urlToOpen);
    })
  );
});

// Service worker mínimo: só cuida do toque na notificação. Sem cache, sem fetch, sem push.
self.addEventListener("notificationclick", (evento) => {
  evento.notification.close();
  evento.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((janelas) => {
      for (const j of janelas) {
        if ("focus" in j) return j.focus();
      }
      return self.clients.openWindow("/");
    }),
  );
});

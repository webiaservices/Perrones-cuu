/*
 * Service worker de Perrones Cuu. SOLO sirve para los avisos al celular.
 *
 * A propósito NO maneja "fetch" ni guarda nada en caché: así el panel nunca
 * se muestra viejo y un error aquí no puede tumbar el sitio.
 */

self.addEventListener("install", () => self.skipWaiting())
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()))

self.addEventListener("push", (event) => {
  let datos = {}
  try {
    datos = event.data ? event.data.json() : {}
  } catch {
    datos = { cuerpo: event.data ? event.data.text() : "" }
  }
  event.waitUntil(
    self.registration.showNotification(datos.titulo || "Perrones Cuu", {
      body: datos.cuerpo || "",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      tag: datos.etiqueta || undefined,
      data: { url: datos.url || "/panel" },
    }),
  )
})

self.addEventListener("notificationclick", (event) => {
  event.notification.close()
  const destino = new URL((event.notification.data && event.notification.data.url) || "/panel", self.location.origin)
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((ventanas) => {
      // Si el panel ya está abierto, se enfoca y se recarga ahí mismo
      for (const v of ventanas) {
        if (new URL(v.url).origin === destino.origin && "focus" in v) {
          if ("navigate" in v) v.navigate(destino.href)
          return v.focus()
        }
      }
      return self.clients.openWindow(destino.href)
    }),
  )
})

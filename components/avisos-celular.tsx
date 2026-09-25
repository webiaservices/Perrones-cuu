"use client"

import { useEffect, useState } from "react"
import { Bell, BellOff, Share } from "lucide-react"
import { Button } from "@/components/ui/button"

/**
 * Tarjeta para que el paseador active los avisos de paseos nuevos en su
 * celular. Son gratis (a diferencia del WhatsApp), llegan al instante y al
 * tocarlos abren su panel.
 *
 * Nunca se queda muda: si el teléfono no puede, o el permiso está bloqueado,
 * dice exactamente qué hacer.
 */

type Estado =
  | "cargando"
  | "apagado"
  | "activo"
  | "bloqueado" // el usuario negó el permiso en el navegador
  | "ios-instalar" // iPhone en Safari: solo funciona desde el ícono en inicio
  | "otro-navegador" // navegador dentro de Facebook/Instagram, etc.
  | "no-soportado" // computadora: la tarjeta es para el teléfono

const CLAVE_PUBLICA = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? ""

function base64aBytes(b64: string) {
  const relleno = "=".repeat((4 - (b64.length % 4)) % 4)
  const crudo = atob((b64 + relleno).replace(/-/g, "+").replace(/_/g, "/"))
  return Uint8Array.from(crudo, (c) => c.charCodeAt(0))
}

function esIphone() {
  // El iPad con Safari se presenta como "Macintosh": se distingue por la pantalla táctil
  return /iphone|ipad|ipod/i.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1)
}
function esCelular() {
  return esIphone() || /android|mobile/i.test(navigator.userAgent)
}
function instaladaEnInicio() {
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

async function guardarEnServidor(sub: PushSubscription) {
  const res = await fetch("/api/push", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(sub.toJSON()),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error ?? "No se pudieron activar los avisos.")
  }
}

export function AvisosCelular() {
  const [estado, setEstado] = useState<Estado>("cargando")
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let vivo = true
    ;(async () => {
      // En la computadora no se ofrece: una laptop cerrada "recibe" el aviso
      // igual y el paseador se quedaría sin su WhatsApp
      if (!esCelular()) {
        if (vivo) setEstado("no-soportado")
        return
      }
      // Si el servidor todavía no puede guardar suscripciones, no se ofrece
      const disponible = await fetch("/api/push", { cache: "no-store" })
        .then((r) => r.json())
        .then((d) => d.disponible === true)
        .catch(() => false)
      if (!disponible) {
        if (vivo) setEstado("no-soportado")
        return
      }
      const soporta = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window
      if (!soporta) {
        if (vivo) setEstado(esIphone() && !instaladaEnInicio() ? "ios-instalar" : "otro-navegador")
        return
      }
      if (Notification.permission === "denied") {
        if (vivo) setEstado("bloqueado")
        return
      }
      try {
        const reg = await navigator.serviceWorker.register("/sw.js")
        const sub = await reg.pushManager.getSubscription()
        if (sub) {
          // Se vuelve a guardar por si la base la borró (teléfono cambiado, etc.)
          guardarEnServidor(sub).catch(() => {})
          if (vivo) setEstado("activo")
        } else if (vivo) setEstado("apagado")
      } catch {
        if (vivo) setEstado("apagado")
      }
    })()
    // Si lo desbloqueó en Ajustes y volvió a la app, la tarjeta se entera
    const alVolver = () => {
      if (document.visibilityState === "visible" && "Notification" in window && Notification.permission !== "denied") {
        setEstado((e) => (e === "bloqueado" ? "apagado" : e))
      }
    }
    document.addEventListener("visibilitychange", alVolver)
    return () => {
      vivo = false
      document.removeEventListener("visibilitychange", alVolver)
    }
  }, [])

  const activar = async () => {
    setError(null)
    setOcupado(true)
    try {
      const permiso = await Notification.requestPermission()
      if (permiso !== "granted") {
        setEstado(permiso === "denied" ? "bloqueado" : "apagado")
        if (permiso !== "denied") setError("No se dio el permiso. Vuelve a tocar el botón y elige «Permitir».")
        return
      }
      const reg = await navigator.serviceWorker.register("/sw.js")
      await navigator.serviceWorker.ready
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64aBytes(CLAVE_PUBLICA) }))
      await guardarEnServidor(sub)
      setEstado("activo")
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudieron activar los avisos. Inténtalo otra vez.")
    } finally {
      setOcupado(false)
    }
  }

  const apagar = async () => {
    setError(null)
    setOcupado(true)
    try {
      const reg = await navigator.serviceWorker.getRegistration("/sw.js")
      const sub = await reg?.pushManager.getSubscription()
      if (sub) {
        await fetch("/api/push", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        })
        await sub.unsubscribe()
      }
      setEstado("apagado")
    } catch {
      setError("No se pudieron apagar los avisos. Inténtalo otra vez.")
    } finally {
      setOcupado(false)
    }
  }

  // Sin la llave pública configurada no hay nada que ofrecer
  if (!CLAVE_PUBLICA || estado === "cargando" || estado === "no-soportado") return null

  if (estado === "activo") {
    return (
      <div className="mb-6 flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
        <span className="flex items-center gap-2 font-semibold">
          <Bell className="h-4 w-4" /> Los paseos nuevos te avisan en este teléfono.
        </span>
        <button onClick={apagar} disabled={ocupado} className="text-xs font-semibold underline disabled:opacity-50">
          {ocupado ? "Apagando…" : "Apagar"}
        </button>
        {error && <p className="w-full text-xs text-rose-700">{error}</p>}
      </div>
    )
  }

  return (
    <div className="mb-6 rounded-3xl border-2 border-primary/30 bg-background p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <Bell className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
        <div className="flex-1">
          <p className="font-display text-lg font-extrabold">Entérate primero de los paseos nuevos</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Activa los avisos y te llega una notificación a este teléfono en cuanto se abre un paseo. Al tocarla
            entras directo a tomarlo.
          </p>

          {estado === "apagado" && (
            <Button onClick={activar} disabled={ocupado} className="mt-3 rounded-full font-bold">
              {ocupado ? "Activando…" : "Activar avisos en este teléfono"}
            </Button>
          )}

          {estado === "bloqueado" && (
            <p className="mt-3 flex items-start gap-2 rounded-2xl bg-amber-50 p-3 text-sm text-amber-900">
              <BellOff className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                {instaladaEnInicio()
                  ? esIphone()
                    ? "Los avisos están bloqueados. Actívalos en Ajustes → Notificaciones → Perrones, y vuelve a la app."
                    : "Los avisos están bloqueados. Mantén presionado el ícono de Perrones → Información de la app → Notificaciones → Permitir, y vuelve a la app."
                  : "Los avisos están bloqueados para este sitio. Toca el candado junto a la dirección → Notificaciones → Permitir, y vuelve a esta página."}
              </span>
            </p>
          )}

          {estado === "otro-navegador" && (
            <p className="mt-3 rounded-2xl bg-secondary/60 p-3 text-sm">
              Este navegador no puede recibir avisos (pasa con el que se abre dentro de Facebook o Instagram). Abre{" "}
              <b>perronescuu.com/panel</b> en <b>Chrome</b> y actívalos desde ahí.
            </p>
          )}

          {estado === "ios-instalar" && (
            <div className="mt-3 rounded-2xl bg-secondary/60 p-3 text-sm">
              <p className="font-semibold">En iPhone se activan desde el ícono en tu pantalla de inicio:</p>
              <ol className="mt-1 list-decimal space-y-0.5 pl-5">
                <li>
                  Abre esta página en <b>Safari</b> y toca <Share className="inline h-4 w-4 align-text-bottom" />{" "}
                  (Compartir).
                </li>
                <li>
                  Elige <b>Agregar a inicio</b>.
                </li>
                <li>Abre Perrones desde ese ícono, entra con tu cuenta y vuelve a esta tarjeta.</li>
              </ol>
            </div>
          )}

          {error && <p className="mt-2 text-sm font-semibold text-rose-700">{error}</p>}
        </div>
      </div>
    </div>
  )
}

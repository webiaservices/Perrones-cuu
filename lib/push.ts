import webpush from "web-push"
import type { SupabaseClient } from "@supabase/supabase-js"
import { notificacionesSimuladas } from "./wa-envios"

/**
 * Avisos al celular (web push). Son GRATIS e ilimitados: los servicios de
 * push de Google, Apple y Mozilla no cobran por mensaje. Por eso son el canal
 * principal para anunciar vacantes, y WhatsApp —que sí se paga— queda de
 * respaldo para quien no los activó.
 *
 * Requiere en Vercel:
 *   NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (mailto:)
 * Sin ellas todo esto es no-op: nadie se queda sin aviso, solo se paga
 * WhatsApp como antes.
 */

type Admin = SupabaseClient

export type AvisoPush = {
  titulo: string
  cuerpo: string
  /** A dónde lleva al tocarlo. */
  url: string
  /** Avisos con la misma etiqueta se reemplazan en vez de amontonarse. */
  etiqueta?: string
  /** Segundos que el servicio de push lo guarda si el teléfono está apagado. */
  vigenciaSeg?: number
}

let configurado: boolean | null = null

export function pushConfigurado(): boolean {
  if (configurado !== null) return configurado
  const publica = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim()
  const privada = process.env.VAPID_PRIVATE_KEY?.trim()
  let sujeto = (process.env.VAPID_SUBJECT ?? "mailto:perronescuu@gmail.com").trim()
  if (!/^(mailto:|https:)/.test(sujeto)) sujeto = `mailto:${sujeto}`
  if (!publica || !privada) {
    configurado = false
    return false
  }
  try {
    webpush.setVapidDetails(sujeto, publica, privada)
    configurado = true
  } catch (e) {
    // Una llave mal pegada apaga el push, pero nunca tumba el anuncio: la ola
    // sigue con WhatsApp y correo
    console.error("[push] llaves VAPID inválidas:", e instanceof Error ? e.message : e)
    configurado = false
  }
  return configurado
}

/** Solo un celular cuenta como "ya se enteró": una laptop cerrada acepta el
 *  push igual y dejaría al paseador sin su WhatsApp. */
function esCelular(userAgent: string | null) {
  return /android|iphone|ipad|ipod|mobile/i.test(userAgent ?? "")
}

/**
 * Manda el aviso a todos los teléfonos suscritos de esos perfiles.
 * Devuelve los perfiles a los que les llegó en AL MENOS un teléfono: a esos
 * ya no hace falta pagarles un WhatsApp.
 *
 * "Llegó" = el servicio de push lo aceptó (201). Eso no garantiza que la
 * persona lo vio, igual que un WhatsApp entregado.
 */
export async function enviarPush(admin: Admin, profileIds: string[], aviso: AvisoPush): Promise<Set<string>> {
  const alcanzados = new Set<string>()
  if (profileIds.length === 0) return alcanzados

  const { data: subs, error } = await admin
    .from("push_suscripciones")
    .select("id, profile_id, endpoint, p256dh, auth, fallas, user_agent")
    .in("profile_id", profileIds)
  if (error || !subs || subs.length === 0) return alcanzados

  if (notificacionesSimuladas()) {
    for (const s of subs) if (esCelular(s.user_agent as string | null)) alcanzados.add(s.profile_id as string)
    return alcanzados
  }
  if (!pushConfigurado()) return alcanzados

  const payload = JSON.stringify({
    titulo: aviso.titulo,
    cuerpo: aviso.cuerpo,
    url: aviso.url,
    etiqueta: aviso.etiqueta,
  })

  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint as string, keys: { p256dh: s.p256dh as string, auth: s.auth as string } },
          payload,
          {
            TTL: aviso.vigenciaSeg ?? 6 * 3600,
            urgency: "high",
            // El topic solo acepta base64 URL-safe y máximo 32 caracteres
            topic: aviso.etiqueta?.replace(/[^A-Za-z0-9_-]/g, "").slice(-32) || undefined,
            // Un servicio de push lento no puede detener el WhatsApp de la ola
            timeout: 10000,
          },
        )
        if (esCelular(s.user_agent as string | null)) alcanzados.add(s.profile_id as string)
        await admin
          .from("push_suscripciones")
          .update({ ultimo_ok_at: new Date().toISOString(), fallas: 0 })
          .eq("id", s.id)
      } catch (e: unknown) {
        const status = (e as { statusCode?: number })?.statusCode
        if (status === 404 || status === 410) {
          // El teléfono se dio de baja (borró la app, revocó el permiso): fuera
          await admin.from("push_suscripciones").delete().eq("id", s.id)
        } else {
          const fallas = ((s.fallas as number) ?? 0) + 1
          // Cinco fallas seguidas = suscripción muerta; no se le sigue intentando
          if (fallas >= 5) await admin.from("push_suscripciones").delete().eq("id", s.id)
          else await admin.from("push_suscripciones").update({ fallas }).eq("id", s.id)
        }
      }
    }),
  )
  return alcanzados
}

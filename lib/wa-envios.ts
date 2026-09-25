import type { SupabaseClient } from "@supabase/supabase-js"
import { sendWhatsAppTemplate } from "./whatsapp"

/**
 * TODO WhatsApp automático pasa por aquí.
 *
 * Antes cada ruta llamaba a sendWhatsAppTemplate por su cuenta y no quedaba
 * registro de nada: no se sabía cuánto se mandaba, a quién, ni cuánto costaba,
 * y nada impedía mandar lo mismo dos veces (bastaba con volver a llamar la
 * ruta). Este envoltorio hace tres cosas antes de gastar un mensaje:
 *
 *   1. Si el perfil ya rebotó dos veces, no manda (antes solo lo respetaba el
 *      aviso de vacantes; los otros 8 avisos le seguían insistiendo).
 *   2. Candado por `clave`: con la misma clave no sale dos veces. El candado
 *      es un índice único en la base, así que ni dos llamadas al mismo tiempo
 *      lo brincan.
 *   3. Deja el envío en la bitácora `wa_envios`, que es de donde sale el
 *      medidor de consumo.
 *
 * Si la bitácora no existe (migración 0026 sin correr) el mensaje sale igual:
 * un aviso no se puede quedar sin mandar por culpa del registro.
 */

type Admin = SupabaseClient

export type EnvioWhatsApp = {
  plantilla: string
  telefono: string
  variables: string[]
  /** Candado: con la misma clave no sale dos veces. */
  clave?: string | null
  /** Para qué se manda, en palabras (se ve en la bitácora). */
  motivo?: string
  profileId?: string | null
  reservationId?: string | null
  /** false si quien llama ya filtró los números silenciados. */
  revisarRebotes?: boolean
}

export type ResultadoEnvio = {
  enviado: boolean
  /** true si NOTIFICACIONES_SIMULADAS=1: se registró pero no salió nada. */
  simulado?: boolean
  motivo: string
  sid?: string
}

export const soloDigitos = (t: string | null | undefined) => String(t ?? "").replace(/\D/g, "")
/** Últimos 10 dígitos: en la base hay teléfonos con +52, 52, 521 y pelones. */
export const tel10 = (t: string | null | undefined) => soloDigitos(t).slice(-10)

/**
 * Modo de prueba: registra todo como si saliera pero no manda ni un mensaje,
 * ni push, ni correo. Las pruebas locales corren contra la base de producción,
 * así que sin esto una prueba le llegaría a paseadores de verdad.
 */
export function notificacionesSimuladas() {
  return process.env.NOTIFICACIONES_SIMULADAS === "1"
}

export async function enviarWhatsApp(admin: Admin, e: EnvioWhatsApp): Promise<ResultadoEnvio> {
  const telefono = soloDigitos(e.telefono)
  if (telefono.length < 10) return { enviado: false, motivo: `número inválido: ${e.telefono}` }

  // 1. Número silenciado por rebotes
  if (e.profileId && e.revisarRebotes !== false) {
    const { data: perfil } = await admin
      .from("profiles")
      .select("wa_rebotes")
      .eq("id", e.profileId)
      .maybeSingle()
    if ((perfil?.wa_rebotes ?? 0) >= 2) {
      await registrar(admin, e, telefono, "saltado", "número silenciado por rebotes")
      return { enviado: false, motivo: "número silenciado por rebotes" }
    }
  }

  const simulado = notificacionesSimuladas()
  // En modo prueba la clave lleva prefijo: una prueba nunca puede "gastar" el
  // candado de un aviso real (p.ej. dejar a un cliente sin su reseña).
  const clave = e.clave ? (simulado ? `sim|${e.clave}` : e.clave) : null

  // 2. Candado + bitácora en un solo paso
  const insertar = () =>
    admin
      .from("wa_envios")
      .insert({
        plantilla: e.plantilla,
        telefono,
        profile_id: e.profileId ?? null,
        reservation_id: e.reservationId ?? null,
        clave,
        motivo: e.motivo ?? null,
        resultado: simulado ? "simulado" : "pendiente",
      })
      .select("id")
      .single()
  let { data: fila, error } = await insertar()

  if (error?.code === "23505" && clave) {
    // Otra llamada ya lo mandó, o lo está mandando, con esta misma clave.
    const { data: vivo } = await admin
      .from("wa_envios")
      .select("id, resultado, created_at")
      .eq("clave", clave)
      .in("resultado", ["pendiente", "enviado", "simulado"])
      .maybeSingle()
    if (vivo && vivo.resultado !== "pendiente") return { enviado: false, motivo: "ya se había mandado" }
    // Un 'pendiente' de hace más de 10 min es un envío que murió a medias (la
    // función se cortó): se suelta y se intenta una vez más. Si es reciente,
    // otra corrida lo está mandando AHORA y todavía no se sabe si saldrá.
    const viejo = !vivo || Date.now() - new Date(vivo.created_at as string).getTime() > 10 * 60000
    if (!viejo) return { enviado: false, motivo: "otro proceso lo está mandando" }
    await admin
      .from("wa_envios")
      .update({ resultado: "error", detalle: "se quedó a medias; se reintentó" })
      .eq("id", vivo!.id)
      .eq("resultado", "pendiente")
    ;({ data: fila, error } = await insertar())
    if (error?.code === "23505") return { enviado: false, motivo: "otro proceso lo está mandando" }
  }
  const filaId: string | null = error ? null : (fila?.id as string)

  if (simulado) return { enviado: true, simulado: true, motivo: "simulado" }

  // 3. El envío de verdad
  const res = await sendWhatsAppTemplate(e.plantilla, telefono, e.variables)
  if ("ok" in res && res.ok) {
    if (filaId) {
      await admin
        .from("wa_envios")
        .update({ resultado: "enviado", message_sid: res.messageId || null })
        .eq("id", filaId)
    }
    return { enviado: true, motivo: "enviado", sid: res.messageId }
  }

  const saltado = "skipped" in res && res.skipped
  const detalle = "reason" in res ? res.reason : "error" in res ? res.error : "error desconocido"
  if (filaId) {
    // 'error' y 'saltado' sueltan el candado: el siguiente intento sí puede mandar
    await admin
      .from("wa_envios")
      .update({ resultado: saltado ? "saltado" : "error", detalle: String(detalle).slice(0, 300) })
      .eq("id", filaId)
  }
  return { enviado: false, motivo: String(detalle) }
}

/** Deja constancia de un envío que no salió (sin tocar el candado). */
async function registrar(admin: Admin, e: EnvioWhatsApp, telefono: string, resultado: "saltado", detalle: string) {
  await admin
    .from("wa_envios")
    .insert({
      plantilla: e.plantilla,
      telefono,
      profile_id: e.profileId ?? null,
      reservation_id: e.reservationId ?? null,
      motivo: e.motivo ?? null,
      resultado,
      detalle,
    })
    .then(() => {}, () => {})
}

/** Pausa entre mensajes. Una ráfaga de decenas en el mismo segundo es lo que
 *  hizo que Meta tumbara la cuenta el 19 de agosto. */
export const pausa = (ms: number) => new Promise((r) => setTimeout(r, ms))

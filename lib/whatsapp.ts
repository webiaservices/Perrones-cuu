/**
 * Cliente de WhatsApp Cloud API (Meta directa).
 * Manda mensajes usando templates pre-aprobados.
 *
 * Env vars requeridas:
 *   WHATSAPP_PHONE_NUMBER_ID   — del Paso 3 del setup de Meta
 *   WHATSAPP_ACCESS_TOKEN      — del Paso 5 del setup de Meta
 *
 * Si las env vars no están, las llamadas son no-op (no fallan, solo
 * regresan { skipped: true }). Eso permite que el código corra en local
 * sin WhatsApp configurado.
 */

const GRAPH_VERSION = "v21.0"
const API_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`

/** Limpia el número: solo dígitos, sin +, sin espacios, sin guiones */
function cleanNumber(num: string): string {
  return num.replace(/\D/g, "")
}

/** Asegura que el número tenga código de país (52 para MX si no lo tiene) */
function ensureCountryCode(num: string): string {
  const clean = cleanNumber(num)
  // Si ya viene con 52 al inicio (mx), está bien
  if (clean.startsWith("52") && clean.length >= 12) return clean
  // Si tiene 10 dígitos (sin código), le agregamos 52
  if (clean.length === 10) return `52${clean}`
  return clean
}

type WhatsAppResponse =
  | { ok: true; messageId: string }
  | { ok: false; skipped: true; reason: string }
  | { ok: false; error: string }

/**
 * Manda un mensaje usando un template pre-aprobado.
 * Los templates deben estar creados y aprobados en Meta antes de usarlos.
 *
 * @param template  Nombre del template (ej. "paseo_confirmado")
 * @param to        Número del destinatario con o sin lada (52614...)
 * @param vars      Variables del template en orden ({{1}}, {{2}}, ...)
 * @param lang      Idioma del template (default "es_MX")
 */
export async function sendWhatsAppTemplate(
  template: string,
  to: string,
  vars: string[],
  lang = "es_MX",
): Promise<WhatsAppResponse> {
  const PHONE_ID = process.env.WHATSAPP_PHONE_NUMBER_ID
  const TOKEN = process.env.WHATSAPP_ACCESS_TOKEN

  if (!PHONE_ID || !TOKEN) {
    return { ok: false, skipped: true, reason: "WhatsApp no configurado (faltan env vars)" }
  }

  const cleaned = ensureCountryCode(to)
  if (cleaned.length < 10) {
    return { ok: false, skipped: true, reason: `Número inválido: ${to}` }
  }

  try {
    const res = await fetch(`${API_BASE}/${PHONE_ID}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: cleaned,
        type: "template",
        template: {
          name: template,
          language: { code: lang },
          components: vars.length > 0
            ? [
                {
                  type: "body",
                  parameters: vars.map((v) => ({ type: "text", text: String(v) })),
                },
              ]
            : [],
        },
      }),
    })

    const data = await res.json()
    if (!res.ok) {
      console.error("[WhatsApp] error:", data)
      return { ok: false, error: data?.error?.message ?? "Error desconocido" }
    }
    return { ok: true, messageId: data?.messages?.[0]?.id ?? "" }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Error de red"
    console.error("[WhatsApp] exception:", msg)
    return { ok: false, error: msg }
  }
}

/**
 * Manda un mensaje de texto libre (solo funciona si el cliente te escribió
 * en las últimas 24h — fuera de eso Meta exige templates pre-aprobados).
 */
/** Plantillas que la plataforma necesita tener aprobadas en Meta */
export const PLANTILLAS_REQUERIDAS = [
  { name: "paseo_confirmado", desc: "Al cliente cuando agenda su paseo" },
  { name: "paseador_asignado", desc: "Al cliente cuando un paseador acepta" },
  { name: "paseo_disponible", desc: "A los paseadores cuando hay paseo nuevo" },
  { name: "recordatorio_pago", desc: "Al cliente cuando el paseo se completa" },
]

export type WhatsAppStatus = {
  configurado: boolean
  conectado: boolean
  /** Mensaje en español explicando qué pasa y qué hacer */
  mensaje: string
  numero?: string
  nombreNegocio?: string
  calidad?: string
  plantillas: { name: string; desc: string; estado: string }[]
}

/**
 * Revisa el estado real de la conexión con Meta: si el token sirve, qué número
 * está conectado y cuáles plantillas están aprobadas. Sirve para que el admin
 * vea de un vistazo por qué no salen los mensajes (token vencido, plantilla sin
 * aprobar, etc.) en vez de quedarse a ciegas.
 */
export async function checkWhatsAppStatus(): Promise<WhatsAppStatus> {
  const PHONE_ID = process.env.WHATSAPP_PHONE_NUMBER_ID
  const TOKEN = process.env.WHATSAPP_ACCESS_TOKEN
  const WABA_ID = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID

  const sinPlantillas = PLANTILLAS_REQUERIDAS.map((p) => ({ ...p, estado: "desconocido" }))

  if (!PHONE_ID || !TOKEN) {
    return {
      configurado: false,
      conectado: false,
      mensaje:
        "WhatsApp no está conectado todavía. Faltan las credenciales de Meta (WHATSAPP_PHONE_NUMBER_ID y WHATSAPP_ACCESS_TOKEN) en la configuración del sitio.",
      plantillas: sinPlantillas,
    }
  }

  // 1. ¿El token sirve y a qué número apunta?
  try {
    const res = await fetch(
      `${API_BASE}/${PHONE_ID}?fields=display_phone_number,verified_name,quality_rating`,
      { headers: { Authorization: `Bearer ${TOKEN}` }, cache: "no-store" },
    )
    const data = await res.json()

    if (!res.ok) {
      const err = data?.error ?? {}
      const code = err.code
      let mensaje = err.message ?? "Meta rechazó la conexión."
      // Traduce los errores más comunes a algo accionable
      if (code === 190) {
        mensaje =
          "El token de Meta venció o fue revocado. Hay que generar uno NUEVO y permanente (System User token) en Meta Business y actualizarlo en la configuración del sitio. Los tokens temporales caducan a las 24 horas."
      } else if (code === 100) {
        mensaje =
          "El ID del número de WhatsApp no es válido. Revisa que WHATSAPP_PHONE_NUMBER_ID sea el 'Phone number ID' que aparece en el panel de Meta (no el número telefónico)."
      } else if (code === 10 || code === 200) {
        mensaje =
          "Al token le faltan permisos. Necesita los permisos whatsapp_business_messaging y whatsapp_business_management."
      }
      return { configurado: true, conectado: false, mensaje, plantillas: sinPlantillas }
    }

    // 2. ¿Qué plantillas están aprobadas?
    let plantillas = sinPlantillas
    if (WABA_ID) {
      try {
        const rt = await fetch(
          `${API_BASE}/${WABA_ID}/message_templates?fields=name,status&limit=100`,
          { headers: { Authorization: `Bearer ${TOKEN}` }, cache: "no-store" },
        )
        const td = await rt.json()
        if (rt.ok && Array.isArray(td?.data)) {
          const porNombre: Record<string, string> = {}
          for (const t of td.data) porNombre[t.name] = String(t.status ?? "").toUpperCase()
          plantillas = PLANTILLAS_REQUERIDAS.map((p) => ({
            ...p,
            estado: porNombre[p.name] ?? "no existe",
          }))
        }
      } catch {
        /* si falla, dejamos "desconocido" */
      }
    }

    return {
      configurado: true,
      conectado: true,
      mensaje: "WhatsApp está conectado y funcionando.",
      numero: data?.display_phone_number,
      nombreNegocio: data?.verified_name,
      calidad: data?.quality_rating,
      plantillas,
    }
  } catch (e: unknown) {
    return {
      configurado: true,
      conectado: false,
      mensaje: `No se pudo contactar a Meta: ${e instanceof Error ? e.message : "error de red"}`,
      plantillas: sinPlantillas,
    }
  }
}

export async function sendWhatsAppText(to: string, text: string): Promise<WhatsAppResponse> {
  const PHONE_ID = process.env.WHATSAPP_PHONE_NUMBER_ID
  const TOKEN = process.env.WHATSAPP_ACCESS_TOKEN
  if (!PHONE_ID || !TOKEN) return { ok: false, skipped: true, reason: "WhatsApp no configurado" }
  const cleaned = ensureCountryCode(to)

  try {
    const res = await fetch(`${API_BASE}/${PHONE_ID}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: cleaned,
        type: "text",
        text: { body: text },
      }),
    })
    const data = await res.json()
    if (!res.ok) return { ok: false, error: data?.error?.message ?? "Error" }
    return { ok: true, messageId: data?.messages?.[0]?.id ?? "" }
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : "Error" }
  }
}

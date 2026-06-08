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

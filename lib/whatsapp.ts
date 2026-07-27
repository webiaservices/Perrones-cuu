/**
 * Cliente de WhatsApp. Soporta TRES proveedores; se elige solo según qué env
 * vars existan, en este orden:
 *
 * 1) TWILIO (RECOMENDADO — sin mensualidad, credenciales que no caducan):
 *      TWILIO_ACCOUNT_SID
 *      TWILIO_AUTH_TOKEN
 *      TWILIO_WHATSAPP_FROM        — número emisor (ej. +5216145948513)
 *      TWILIO_TPL_<PLANTILLA>      — Content SID (HX...) de cada plantilla
 *
 * 2) 360dialog (fácil de dar de alta, pero ~€49/mes):
 *      WHATSAPP_360_API_KEY
 *
 * 3) Meta Cloud API directa (gratis, pero el token hay que renovarlo bien):
 *      WHATSAPP_PHONE_NUMBER_ID
 *      WHATSAPP_ACCESS_TOKEN
 *      WHATSAPP_BUSINESS_ACCOUNT_ID  (para leer el estado de las plantillas)
 *
 * Si no hay ninguna, las llamadas son no-op ({ skipped: true }) para que el
 * código corra en local sin WhatsApp configurado.
 *
 * Meta y 360dialog comparten formato (Cloud API); Twilio tiene el suyo
 * (form-encoded y plantillas por Content SID en vez de por nombre).
 */

const GRAPH_VERSION = "v21.0"
const API_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`
const D360_BASE = "https://waba-v2.360dialog.io"

const TWILIO_BASE = "https://api.twilio.com/2010-04-01"

type Proveedor = "twilio" | "360dialog" | "meta"

type Conexion = {
  proveedor: Proveedor
  /** URL para mandar mensajes */
  urlMensajes: string
  /** Headers de autenticación */
  headers: Record<string, string>
  /** Solo Twilio: número desde el que se manda (formato whatsapp:+52...) */
  from?: string
}

/**
 * En Twilio las plantillas no van por nombre sino por "Content SID" (HX...).
 * Cada plantilla aprobada tiene el suyo; se configuran con env vars:
 *   TWILIO_TPL_PASEO_CONFIRMADO, TWILIO_TPL_PASEADOR_ASIGNADO,
 *   TWILIO_TPL_PASEO_DISPONIBLE, TWILIO_TPL_RECORDATORIO_PAGO
 */
function twilioContentSid(template: string): string | undefined {
  return process.env[`TWILIO_TPL_${template.toUpperCase()}`]
}

/** Decide con cuál proveedor conectarse según las env vars disponibles. */
function getConexion(): Conexion | null {
  // 1. Twilio (sin mensualidad, credenciales que no caducan)
  const TW_SID = process.env.TWILIO_ACCOUNT_SID
  const TW_TOKEN = process.env.TWILIO_AUTH_TOKEN
  const TW_FROM = process.env.TWILIO_WHATSAPP_FROM
  if (TW_SID && TW_TOKEN && TW_FROM) {
    const auth = Buffer.from(`${TW_SID}:${TW_TOKEN}`).toString("base64")
    return {
      proveedor: "twilio",
      urlMensajes: `${TWILIO_BASE}/Accounts/${TW_SID}/Messages.json`,
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      // ensureCountryCode y no cleanNumber: si el número viene a 10 dígitos hay
      // que anteponerle el 52, si no Twilio lo rechaza
      from: TW_FROM.startsWith("whatsapp:") ? TW_FROM : `whatsapp:+${ensureCountryCode(TW_FROM)}`,
    }
  }
  // 2. 360dialog
  const D360_KEY = process.env.WHATSAPP_360_API_KEY
  if (D360_KEY) {
    return {
      proveedor: "360dialog",
      urlMensajes: `${D360_BASE}/messages`,
      headers: { "D360-API-KEY": D360_KEY, "Content-Type": "application/json" },
    }
  }
  // 3. Meta directa
  const PHONE_ID = process.env.WHATSAPP_PHONE_NUMBER_ID
  const TOKEN = process.env.WHATSAPP_ACCESS_TOKEN
  if (PHONE_ID && TOKEN) {
    return {
      proveedor: "meta",
      urlMensajes: `${API_BASE}/${PHONE_ID}/messages`,
      headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    }
  }
  return null
}

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
  const con = getConexion()
  if (!con) {
    return { ok: false, skipped: true, reason: "WhatsApp no configurado (faltan credenciales)" }
  }

  const cleaned = ensureCountryCode(to)
  if (cleaned.length < 10) {
    return { ok: false, skipped: true, reason: `Número inválido: ${to}` }
  }

  // --- Twilio: formato propio (form-encoded + Content SID por plantilla) ---
  if (con.proveedor === "twilio") {
    const contentSid = twilioContentSid(template)
    if (!contentSid) {
      return {
        ok: false,
        skipped: true,
        reason: `Falta configurar el Content SID de la plantilla "${template}" (env TWILIO_TPL_${template.toUpperCase()})`,
      }
    }
    // Twilio numera las variables desde "1"
    const twVars: Record<string, string> = {}
    vars.forEach((v, i) => { twVars[String(i + 1)] = String(v) })

    try {
      const body = new URLSearchParams({
        To: `whatsapp:+${cleaned}`,
        From: con.from!,
        ContentSid: contentSid,
        ContentVariables: JSON.stringify(twVars),
      })
      const res = await fetch(con.urlMensajes, { method: "POST", headers: con.headers, body })
      const data = await res.json()
      if (!res.ok) {
        console.error("[WhatsApp/Twilio] error:", data)
        return { ok: false, error: data?.message ?? "Error desconocido" }
      }
      return { ok: true, messageId: data?.sid ?? "" }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Error de red"
      console.error("[WhatsApp/Twilio] exception:", msg)
      return { ok: false, error: msg }
    }
  }

  // --- Meta / 360dialog: mismo formato (Cloud API) ---
  try {
    const res = await fetch(con.urlMensajes, {
      method: "POST",
      headers: con.headers,
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
  proveedor?: "twilio" | "360dialog" | "meta"
  numero?: string
  nombreNegocio?: string
  calidad?: string
  plantillas: { name: string; desc: string; estado: string }[]
}

/**
 * Revisa el estado real de la conexión: si las credenciales sirven, qué número
 * está conectado y cuáles plantillas están aprobadas. Sirve para que el admin
 * vea de un vistazo por qué no salen los mensajes (credencial vencida, plantilla
 * sin aprobar, etc.) en vez de quedarse a ciegas.
 */
export async function checkWhatsAppStatus(): Promise<WhatsAppStatus> {
  const sinPlantillas = PLANTILLAS_REQUERIDAS.map((p) => ({ ...p, estado: "desconocido" }))
  const con = getConexion()

  if (!con) {
    return {
      configurado: false,
      conectado: false,
      mensaje:
        "WhatsApp no está conectado todavía. Falta configurar las credenciales del proveedor de mensajes en el sitio.",
      plantillas: sinPlantillas,
    }
  }

  // --- Twilio: valida las credenciales contra la cuenta y revisa los Content SID ---
  if (con.proveedor === "twilio") {
    const plantillasTwilio = PLANTILLAS_REQUERIDAS.map((p) => ({
      ...p,
      estado: twilioContentSid(p.name) ? "configurada" : "falta su Content SID",
    }))
    try {
      const SID = process.env.TWILIO_ACCOUNT_SID!
      const res = await fetch(`${TWILIO_BASE}/Accounts/${SID}.json`, {
        headers: { Authorization: con.headers.Authorization },
        cache: "no-store",
      })
      const data = await res.json()
      if (!res.ok) {
        return {
          configurado: true,
          conectado: false,
          proveedor: "twilio",
          mensaje:
            res.status === 401
              ? "Las credenciales de Twilio no son válidas. Revisa el Account SID y el Auth Token en el panel de Twilio."
              : `Twilio respondió un error: ${data?.message ?? res.status}`,
          plantillas: plantillasTwilio,
        }
      }
      const faltantes = plantillasTwilio.filter((p) => p.estado !== "configurada").length
      return {
        configurado: true,
        conectado: true,
        proveedor: "twilio",
        mensaje: faltantes
          ? `Twilio conectado, pero faltan ${faltantes} plantilla(s) por configurar su Content SID.`
          : "WhatsApp está conectado por Twilio y funcionando.",
        numero: con.from?.replace("whatsapp:", ""),
        nombreNegocio: data?.friendly_name,
        plantillas: plantillasTwilio,
      }
    } catch (e: unknown) {
      return {
        configurado: true,
        conectado: false,
        proveedor: "twilio",
        mensaje: `No se pudo contactar a Twilio: ${e instanceof Error ? e.message : "error de red"}`,
        plantillas: plantillasTwilio,
      }
    }
  }

  // --- 360dialog: la API key valida contra su endpoint de plantillas ---
  if (con.proveedor === "360dialog") {
    try {
      const res = await fetch(`${D360_BASE}/v1/configs/templates`, {
        headers: con.headers,
        cache: "no-store",
      })
      const data = await res.json()
      if (!res.ok) {
        return {
          configurado: true,
          conectado: false,
          proveedor: "360dialog",
          mensaje:
            res.status === 401 || res.status === 403
              ? "La API key de 360dialog no es válida o fue reemplazada. Genera una nueva en tu panel de 360dialog y actualízala aquí (solo la más reciente funciona)."
              : `360dialog respondió un error: ${data?.message ?? res.status}`,
          plantillas: sinPlantillas,
        }
      }
      const lista: { name?: string; status?: string }[] = data?.waba_templates ?? data?.data ?? []
      const porNombre: Record<string, string> = {}
      for (const t of lista) if (t?.name) porNombre[t.name] = String(t.status ?? "").toUpperCase()
      return {
        configurado: true,
        conectado: true,
        proveedor: "360dialog",
        mensaje: "WhatsApp está conectado por 360dialog y funcionando.",
        plantillas: PLANTILLAS_REQUERIDAS.map((p) => ({
          ...p,
          estado: porNombre[p.name] ?? "no existe",
        })),
      }
    } catch (e: unknown) {
      return {
        configurado: true,
        conectado: false,
        proveedor: "360dialog",
        mensaje: `No se pudo contactar a 360dialog: ${e instanceof Error ? e.message : "error de red"}`,
        plantillas: sinPlantillas,
      }
    }
  }

  // --- Meta directa ---
  const PHONE_ID = process.env.WHATSAPP_PHONE_NUMBER_ID
  const TOKEN = process.env.WHATSAPP_ACCESS_TOKEN
  const WABA_ID = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID

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
      return { configurado: true, conectado: false, proveedor: "meta", mensaje, plantillas: sinPlantillas }
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
      proveedor: "meta",
      mensaje: "WhatsApp está conectado por Meta y funcionando.",
      numero: data?.display_phone_number,
      nombreNegocio: data?.verified_name,
      calidad: data?.quality_rating,
      plantillas,
    }
  } catch (e: unknown) {
    return {
      configurado: true,
      conectado: false,
      proveedor: "meta",
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

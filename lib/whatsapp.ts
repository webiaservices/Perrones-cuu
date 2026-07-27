/**
 * Cliente de WhatsApp. Soporta DOS formas de conectarse:
 *
 * A) 360dialog (RECOMENDADO — la fácil, sin pelearse con tokens de Meta):
 *      WHATSAPP_360_API_KEY   — la API key que te da 360dialog
 *    Te registras en 360dialog entrando con Facebook, ellos hacen el trámite
 *    técnico con Meta y te dan una API key que no caduca.
 *
 * B) Meta Cloud API directa (la difícil — token que caduca):
 *      WHATSAPP_PHONE_NUMBER_ID
 *      WHATSAPP_ACCESS_TOKEN
 *      WHATSAPP_BUSINESS_ACCOUNT_ID  (para leer el estado de las plantillas)
 *
 * Si hay API key de 360dialog se usa esa; si no, se intenta con Meta. Si no
 * hay ninguna, las llamadas son no-op ({ skipped: true }) para que el código
 * corra en local sin WhatsApp configurado.
 *
 * El formato de los mensajes es idéntico en ambos, solo cambia la URL y cómo
 * se autentica — por eso el resto del código no se entera de cuál se usa.
 */

const GRAPH_VERSION = "v21.0"
const API_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`
const D360_BASE = "https://waba-v2.360dialog.io"

type Conexion = {
  proveedor: "360dialog" | "meta"
  /** URL para mandar mensajes */
  urlMensajes: string
  /** Headers de autenticación */
  headers: Record<string, string>
}

/** Decide con cuál proveedor conectarse según las env vars disponibles. */
function getConexion(): Conexion | null {
  const D360_KEY = process.env.WHATSAPP_360_API_KEY
  if (D360_KEY) {
    return {
      proveedor: "360dialog",
      urlMensajes: `${D360_BASE}/messages`,
      headers: { "D360-API-KEY": D360_KEY, "Content-Type": "application/json" },
    }
  }
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
  proveedor?: "360dialog" | "meta"
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
        "WhatsApp no está conectado todavía. La forma más fácil es crear una cuenta en 360dialog (entras con Facebook, ellos hacen el trámite con Meta) y pegar aquí la API key que te dan.",
      plantillas: sinPlantillas,
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

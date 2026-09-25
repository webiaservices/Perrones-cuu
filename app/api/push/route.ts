import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { getCaller } from "@/lib/api-auth"
import { parse as parseUrlViejo } from "node:url"

/**
 * Alta y baja de los avisos al celular del usuario que llama.
 *
 * POST   { endpoint, keys: { p256dh, auth } }  → activa en este teléfono
 * DELETE { endpoint }                           → los apaga en este teléfono
 *
 * Pasa por aquí (service role) y no directo a la tabla para que nadie pueda
 * dar de alta un teléfono a nombre de otra persona.
 */
/**
 * GET → ¿se pueden activar avisos? La tarjeta del panel pregunta antes de
 * mostrarse: sin la tabla (migración 0026) o sin llaves, un botón que siempre
 * falla sería peor que no mostrar nada.
 */
export async function GET() {
  if (!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
    return NextResponse.json({ disponible: false })
  }
  const admin = createAdminClient()
  // OJO: con { head: true } supabase-js NO reporta error si la tabla no
  // existe (responde 204 vacío). Por eso va una consulta normal.
  const { error } = await admin.from("push_suscripciones").select("id").limit(1)
  return NextResponse.json({ disponible: !error })
}

export async function POST(req: NextRequest) {
  const caller = await getCaller()
  if (!caller) return NextResponse.json({ error: "Tu sesión venció. Vuelve a entrar." }, { status: 401 })
  // Hoy los avisos al celular son solo para paseadores (vacantes)
  if (caller.role !== "paseador") {
    return NextResponse.json({ error: "Los avisos al celular son para paseadores." }, { status: 403 })
  }

  const body = await req.json().catch(() => null)
  const endpoint = typeof body?.endpoint === "string" ? body.endpoint : ""
  const p256dh = typeof body?.keys?.p256dh === "string" ? body.keys.p256dh : ""
  const auth = typeof body?.keys?.auth === "string" ? body.keys.auth : ""
  // Solo servicios de push reales (Google, Apple, Mozilla, Microsoft): evita
  // que alguien guarde una URL cualquiera y el servidor le haga peticiones.
  // Las llaves tienen tamaño fijo (65 y 16 bytes en base64url).
  if (
    !esServicioDePush(endpoint) ||
    endpoint.length > 1000 ||
    !/^[A-Za-z0-9_-]{86,88}=?$/.test(p256dh) ||
    !/^[A-Za-z0-9_-]{21,24}=?=?$/.test(auth)
  ) {
    return NextResponse.json({ error: "Suscripción inválida" }, { status: 400 })
  }

  const admin = createAdminClient()
  const { error } = await admin.from("push_suscripciones").upsert(
    {
      profile_id: caller.id,
      endpoint,
      p256dh,
      auth,
      user_agent: (req.headers.get("user-agent") ?? "").slice(0, 300),
      fallas: 0,
    },
    { onConflict: "endpoint" },
  )
  if (error) {
    return NextResponse.json(
      { error: "No se pudieron activar los avisos. Inténtalo en un momento." },
      { status: 500 },
    )
  }
  // Máximo 5 teléfonos por persona: se quedan los más recientes
  const { data: suyas } = await admin
    .from("push_suscripciones")
    .select("id")
    .eq("profile_id", caller.id)
    .order("created_at", { ascending: false })
  const sobran = (suyas ?? []).slice(5).map((x) => x.id as string)
  if (sobran.length) await admin.from("push_suscripciones").delete().in("id", sobran)
  return NextResponse.json({ ok: true })
}

const HOSTS_DE_PUSH = [
  /^fcm\.googleapis\.com$/, // Chrome, Edge y Samsung en Android
  /^updates\.push\.services\.mozilla\.com$/, // Firefox
  /^web\.push\.apple\.com$/, // Safari / iPhone
  /^[a-z0-9-]+\.notify\.windows\.com$/, // Edge en Windows
]
function esServicioDePush(endpoint: string): boolean {
  try {
    const u = new URL(endpoint)
    // web-push arma la petición con el parser viejo de Node (url.parse). Si
    // los dos parsers no leen el MISMO host, la URL es tramposa: se rechaza.
    const viejo = parseUrlViejo(endpoint)
    return (
      u.protocol === "https:" &&
      /^[a-z0-9.-]+$/.test(u.hostname) &&
      viejo.hostname === u.hostname &&
      !u.port &&
      !u.username &&
      !u.password &&
      HOSTS_DE_PUSH.some((re) => re.test(u.hostname))
    )
  } catch {
    return false
  }
}

export async function DELETE(req: NextRequest) {
  const caller = await getCaller()
  if (!caller) return NextResponse.json({ error: "Tu sesión venció. Vuelve a entrar." }, { status: 401 })
  const body = await req.json().catch(() => null)
  const endpoint = typeof body?.endpoint === "string" ? body.endpoint : ""
  if (!endpoint) return NextResponse.json({ error: "Falta el endpoint" }, { status: 400 })

  const admin = createAdminClient()
  await admin.from("push_suscripciones").delete().eq("endpoint", endpoint).eq("profile_id", caller.id)
  return NextResponse.json({ ok: true })
}

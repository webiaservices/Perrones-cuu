import type { SupabaseClient } from "@supabase/supabase-js"
import { BRAND, walkerPayoutFor } from "@/lib/constants"
import { EMAIL_LOGO_IMG } from "@/lib/email-brand"
import { MANUAL_VERSION } from "@/lib/manual-paseadores"
import { enviarPush } from "@/lib/push"
import { enviarWhatsApp, notificacionesSimuladas, pausa, tel10 } from "@/lib/wa-envios"
import { elegirCorreo, elegirPush, elegirWhatsApp, type Contexto, type Paseador } from "@/lib/vacantes-seleccion"

/**
 * Anuncio de vacantes a paseadores, por OLEADAS.
 *
 * Antes: cada vez que Endy hacía público un paseo salían ~62 WhatsApp pagados
 * en el mismo segundo, a todos los paseadores de las dos ciudades, y se
 * repetían completos si lo volvía a publicar. Era el 93% del gasto.
 *
 * Ahora:
 *   Ola 1 (al publicar)
 *     · aviso gratis al celular a TODOS los paseadores de la ciudad que lo
 *       activaron;
 *     · WhatsApp solo a los 5 con más probabilidad de tomarlo que no tengan
 *       el aviso gratis (quien sí toma paseos, de la misma zona, con manual);
 *     · correo a unos cuantos más (con tope: la cuenta de correo se comparte).
 *   Ola 2 (el reloj, si en 45 min nadie la tomó)
 *     · WhatsApp a los 10 siguientes y correo a otros tantos.
 *   Después de eso no se manda nada automático: la vacante sigue en el panel
 *   de todos y, si llega a 2 h sin paseador, el cliente recibe paseo_sin_cubrir
 *   como siempre.
 *
 * A nadie se le avisa dos veces de la misma vacante por el mismo canal
 * dentro de un mismo CICLO. Un ciclo nuevo empieza cuando la vacante se vuelve
 * a abrir: el paseador que la tomó la soltó (el reloj lo detecta solo), o Endy
 * la vuelve a publicar después de 45 minutos.
 */

type Admin = SupabaseClient

/** WhatsApp pagados por ola. La suma es el máximo por vacante. */
export const CUPO_WHATSAPP_POR_OLA = [5, 10]
export const CUPO_CORREO_POR_OLA = [15, 15]
export const MINUTOS_ENTRE_OLAS = 45
export const MAX_OLAS = CUPO_WHATSAPP_POR_OLA.length

export type ResumenOla = {
  ola: number
  push: number
  whatsapp: number
  correo: number
  motivo?: string
  simulado?: boolean
}

type Vacante = {
  id: string
  status: string
  visibility: string | null
  walker_id: string | null
  city: string | null
  zone: string | null
  price_mxn: number | null
  admin_fee_mxn: number | null
  scheduled_at: string | null
  package_id: string | null
  package_index: number | null
  package_total: number | null
  dog_name: string | null
  dog_size: string | null
}

const CAMPOS =
  "id, status, visibility, walker_id, city, zone, price_mxn, admin_fee_mxn, scheduled_at, package_id, package_index, package_total, dog_name, dog_size"

function tablaNoExiste(e: { code?: string; message?: string }) {
  return e.code === "42P01" || e.code === "PGRST205" || /schema cache|does not exist/i.test(e.message ?? "")
}

/** La fila que representa a la vacante: el paseo 1 del paquete (el que carga el precio). */
async function vacanteDe(admin: Admin, reservationId: string): Promise<Vacante | null> {
  const { data: r } = await admin.from("reservations").select(CAMPOS).eq("id", reservationId).maybeSingle()
  if (!r) return null
  if (r.package_id && (r.package_index ?? 1) > 1) {
    const { data: primero } = await admin
      .from("reservations")
      .select(CAMPOS)
      .eq("package_id", r.package_id)
      .eq("package_index", 1)
      .maybeSingle()
    return (primero as Vacante | null) ?? (r as Vacante)
  }
  return r as Vacante
}

/** ¿Sigue siendo una vacante que vale la pena anunciar? */
async function sigueAbierta(admin: Admin, v: Vacante): Promise<string | null> {
  if (v.status !== "buscando_paseador") return "ya no busca paseador"
  if (v.visibility !== "public") return "el paseo aún es privado"
  if (v.walker_id) return "ya tiene paseador"
  // En paquetes se mira la ÚLTIMA fecha: sigue abierta mientras quede un día futuro
  let ultima = v.scheduled_at
  if (v.package_id) {
    const { data } = await admin
      .from("reservations")
      .select("scheduled_at")
      .eq("package_id", v.package_id)
      .order("scheduled_at", { ascending: false })
      .limit(1)
    ultima = data?.[0]?.scheduled_at ?? ultima
  }
  if (ultima && new Date(ultima).getTime() < Date.now()) return "la fecha ya pasó"
  return null
}

type Apartado = { ola: number; ciclo: number; sinCandado?: boolean } | { motivo: string }

/**
 * Aparta la siguiente ola de forma atómica (dos clics o dos relojes al mismo
 * tiempo no mandan dos veces).
 *   modo "publicar": el botón de Endy. Arranca la ola 1; si la vacante ya se
 *                    anunció hace más de 45 min, empieza un ciclo nuevo.
 *   modo "reloj":    la siguiente ola del ciclo actual, si ya pasaron 45 min.
 *   modo "reabrir":  el reloj vio que alguien la soltó: ciclo nuevo.
 */
async function apartarOla(admin: Admin, vacanteId: string, modo: "publicar" | "reloj" | "reabrir"): Promise<Apartado> {
  const ahora = new Date().toISOString()
  const { data: nueva, error } = await admin
    .from("vacante_avisos")
    .upsert(
      { reservation_id: vacanteId, ciclo: 1, ola: 1, ultima_ola_at: ahora },
      { onConflict: "reservation_id", ignoreDuplicates: true },
    )
    .select("ola, ciclo")
  if (error) {
    // Sin la migración 0026 no se puede dejar la vacante sin anunciar: sale la
    // ola 1 chica, sin candado. PostgREST responde PGRST205 ("no está en el
    // schema cache"), no el 42P01 de Postgres. Cualquier OTRO error no manda
    // nada: mandar sin candado por un tropiezo pasajero duplicaría avisos.
    if (tablaNoExiste(error)) return modo === "publicar" ? { ola: 1, ciclo: 1, sinCandado: true } : { motivo: "sin tabla" }
    console.error("[vacantes] no se pudo apartar la ola:", error.message)
    return { motivo: "no se pudo registrar el anuncio (error de la base); inténtalo otra vez en un momento" }
  }
  if (nueva && nueva.length > 0) return { ola: 1, ciclo: 1 }

  const { data: actual } = await admin
    .from("vacante_avisos")
    .select("ola, ciclo, ultima_ola_at")
    .eq("reservation_id", vacanteId)
    .maybeSingle()
  if (!actual) return { motivo: "no se pudo leer el anuncio de esta vacante" }
  const reciente =
    !!actual.ultima_ola_at && Date.now() - new Date(actual.ultima_ola_at).getTime() < MINUTOS_ENTRE_OLAS * 60000

  if (modo === "reloj") {
    if (actual.ola >= MAX_OLAS || reciente) return { motivo: "no toca ola todavía" }
    const { data: tomada } = await admin
      .from("vacante_avisos")
      .update({ ola: actual.ola + 1, ultima_ola_at: ahora })
      .eq("reservation_id", vacanteId)
      .eq("ciclo", actual.ciclo)
      .eq("ola", actual.ola)
      .select("ola, ciclo")
    return tomada && tomada.length > 0 ? { ola: tomada[0].ola as number, ciclo: tomada[0].ciclo as number } : { motivo: "otra corrida ya la tomó" }
  }

  if (modo === "publicar" && reciente) {
    return { motivo: `ya se anunció hace menos de ${MINUTOS_ENTRE_OLAS} minutos; si nadie la toma, la siguiente oleada sale sola` }
  }

  // Ciclo nuevo: se vale volver a avisarle a todos
  const { data: tomada } = await admin
    .from("vacante_avisos")
    .update({ ciclo: actual.ciclo + 1, ola: 1, ultima_ola_at: ahora, tomada_at: null })
    .eq("reservation_id", vacanteId)
    .eq("ciclo", actual.ciclo)
    .select("ola, ciclo")
  if (!tomada || tomada.length === 0) return { motivo: "otra publicación se adelantó" }
  await admin.from("vacante_notificados").delete().eq("reservation_id", vacanteId)
  return { ola: 1, ciclo: tomada[0].ciclo as number }
}

/** Ya no hay nada que anunciar en este ciclo: el reloj no la vuelve a revisar. */
async function cerrarCiclo(admin: Admin, vacanteId: string, tomada: boolean) {
  await admin
    .from("vacante_avisos")
    .update(tomada ? { ola: MAX_OLAS, tomada_at: new Date().toISOString() } : { ola: MAX_OLAS })
    .eq("reservation_id", vacanteId)
    .then(() => {}, () => {})
}

/**
 * Manda la siguiente ola de una vacante, si toca.
 * @param primera true desde el botón "Hacer público"; false desde el reloj.
 */
export async function anunciarVacante(
  admin: Admin,
  reservationId: string,
  modo: "publicar" | "reloj" | "reabrir",
): Promise<ResumenOla> {
  const vacia = (motivo: string, ola = 0): ResumenOla => ({ ola, push: 0, whatsapp: 0, correo: 0, motivo })

  const v = await vacanteDe(admin, reservationId)
  if (!v) return vacia("la reserva no existe")
  const cerrada = await sigueAbierta(admin, v)
  if (cerrada) {
    // Desde el reloj, una vacante que ya no aplica se cierra para que no
    // ocupe lugar en las siguientes revisiones
    if (modo !== "publicar") await cerrarCiclo(admin, v.id, !!v.walker_id)
    return vacia(cerrada)
  }

  const apartada = await apartarOla(admin, v.id, modo)
  if ("motivo" in apartada) return vacia(apartada.motivo)
  const { ola, ciclo } = apartada
  const ciudad = v.city ?? "chihuahua"

  // ---- Quiénes ----
  const { data: filas } = await admin
    .from("profiles")
    .select("id, full_name, phone, email, zone, city, banned, wa_rebotes, manual_accepted_at, manual_version, created_at")
    .eq("role", "paseador")
  const paseadores: Paseador[] = (filas ?? []).map((p) => ({
    id: p.id as string,
    full_name: (p.full_name as string | null) ?? null,
    phone: (p.phone as string | null) ?? null,
    email: (p.email as string | null) ?? null,
    zone: (p.zone as string | null) ?? null,
    city: (p.city as string | null) ?? null,
    banned: (p.banned as boolean | null) ?? null,
    wa_rebotes: (p.wa_rebotes as number | null) ?? 0,
    manual_ok: !!p.manual_accepted_at && p.manual_version === MANUAL_VERSION,
    created_at: (p.created_at as string | null) ?? null,
  }))

  // Paseos tomados en 60 días (un paquete cuenta como uno)
  const hace60 = new Date(Date.now() - 60 * 24 * 3600 * 1000).toISOString()
  const { data: tomas } = await admin
    .from("reservations")
    .select("walker_id, package_id, id")
    .not("walker_id", "is", null)
    .gte("created_at", hace60)
  const porPaseador = new Map<string, Set<string>>()
  for (const t of tomas ?? []) {
    const w = t.walker_id as string
    if (!porPaseador.has(w)) porPaseador.set(w, new Set())
    porPaseador.get(w)!.add((t.package_id as string | null) ?? (t.id as string))
  }
  const tomados: Record<string, number> = {}
  porPaseador.forEach((s, w) => { tomados[w] = s.size })

  const { data: previos } = await admin
    .from("vacante_notificados")
    .select("profile_id, canal, ok")
    .eq("reservation_id", v.id)
  const yaAvisados = { push: new Set<string>(), whatsapp: new Set<string>(), correo: new Set<string>() }
  for (const n of previos ?? []) {
    if (n.ok) yaAvisados[n.canal as "push" | "whatsapp" | "correo"]?.add(n.profile_id as string)
  }
  const ctx: Contexto = { ciudad, zona: v.zone, tomados, yaAvisados }

  if (!paseadores.some((p) => !p.banned && (p.city ?? "chihuahua") === ciudad)) {
    return { ...vacia(`no hay paseadores registrados en ${ciudad}`, ola) }
  }

  const ganancia = walkerPayoutFor(Number(v.price_mxn ?? 0), v.admin_fee_mxn)
  const walks = v.package_total ?? 1
  const cuando = v.scheduled_at
    ? new Date(v.scheduled_at).toLocaleString("es-MX", {
        weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: "America/Chihuahua",
      })
    : "Por confirmar"
  const alcanzados = new Set<string>()
  const anotar = async (profileId: string, canal: "push" | "whatsapp" | "correo") => {
    const { error } = await admin
      .from("vacante_notificados")
      .insert({ reservation_id: v.id, profile_id: profileId, canal, ola })
    // 23505 = ya estaba: otra corrida se le adelantó, no se le vuelve a mandar.
    // Cualquier otro error (p.ej. tabla sin crear) no frena el aviso.
    return !error || error.code !== "23505"
  }

  // ---- 1. Aviso gratis al celular ----
  let nPush = 0
  if (ola === 1) {
    const paraPush = elegirPush(paseadores, ctx).map((p) => p.id)
    // Si el push truena (llaves mal puestas, servicio caído) la ola sigue con
    // WhatsApp y correo: el canal gratis nunca puede frenar al que sí llega.
    const llegaron = await enviarPush(admin, paraPush, {
      titulo: `🐶 Paseo disponible en ${v.zone ?? "tu ciudad"}`,
      cuerpo: `${v.dog_name ?? "Un perrito"} · ${cuando}${walks > 1 ? ` · paquete de ${walks} paseos` : ""} · Pago: MX$${ganancia.toLocaleString("es-MX")}. Tócalo para tomarlo.`,
      url: "/panel",
      etiqueta: `vacante-${v.id}`,
    }).catch((e: unknown) => {
      console.error("[vacantes] push:", e instanceof Error ? e.message : e)
      return new Set<string>()
    })
    for (const id of llegaron) {
      if (await anotar(id, "push")) {
        alcanzados.add(id)
        ctx.yaAvisados.push.add(id)
        nPush++
      }
    }
  }

  // ---- 2. WhatsApp, solo a los pocos que más probablemente la tomen ----
  const prefijoClave = `paseo_disponible|${v.id}|c${ciclo}|`
  const { data: telsPrevios } = await admin
    .from("wa_envios")
    .select("telefono")
    .like("clave", `${prefijoClave}%`)
    .in("resultado", ["enviado", "simulado", "pendiente"])
  const telefonosYa = new Set((telsPrevios ?? []).map((t) => tel10(t.telefono as string)))
  // Las cuentas de paseador de Endy tienen el número de atención del negocio.
  // Como es quien más paseos toma, quedaba primero en la fila y se le pagaba
  // un WhatsApp avisándole de la vacante que él mismo acababa de publicar.
  telefonosYa.add(tel10(BRAND.whatsapp))
  const cupoWa = CUPO_WHATSAPP_POR_OLA[ola - 1] ?? 0
  let nWa = 0
  // Los que se enteraron gratis en esta ola ocupan su lugar en el cupo
  const gratisEnEstaOla = new Set([...alcanzados])
  for (const p of elegirWhatsApp(paseadores, ctx, cupoWa, telefonosYa, gratisEnEstaOla)) {
    if (!(await anotar(p.id, "whatsapp"))) continue
    // paseo_disponible: {{1}} paseador · {{2}} zona · {{3}} PAGO SEMANAL.
    // La 3ª va como pago y no como fecha a petición de Endy: sin la etiqueta,
    // un paseador dividió el monto entre los perros y creyó que era una miseria.
    const r = await enviarWhatsApp(admin, {
      plantilla: "paseo_disponible",
      telefono: p.phone!,
      variables: [p.full_name ?? "", v.zone ?? "", `MX$${ganancia.toLocaleString("es-MX")}`],
      clave: `${prefijoClave}${tel10(p.phone)}`,
      motivo: `vacante ola ${ola}${ciclo > 1 ? ` (ciclo ${ciclo})` : ""}`,
      profileId: p.id,
      reservationId: v.id,
    })
    if (r.enviado) {
      nWa++
      alcanzados.add(p.id)
    } else {
      // No salió: se suelta para que la siguiente ola pueda intentarlo
      await admin
        .from("vacante_notificados")
        .delete()
        .eq("reservation_id", v.id)
        .eq("profile_id", p.id)
        .eq("canal", "whatsapp")
    }
    await pausa(300)
  }

  // ---- 3. Correo, con tope ----
  let nCorreo = 0
  const cupoCorreo = CUPO_CORREO_POR_OLA[ola - 1] ?? 0
  const paraCorreo = elegirCorreo(paseadores, ctx, cupoCorreo, alcanzados)
  if (paraCorreo.length > 0) {
    const ok = await mandarCorreos(
      paraCorreo.map((p) => ({ email: p.email!, name: p.full_name })),
      { zone: v.zone ?? "", dogName: v.dog_name ?? "Un perrito", dogSize: v.dog_size ?? "", scheduledLabel: cuando, ganancia, walks },
    )
    if (ok) {
      for (const p of paraCorreo) if (await anotar(p.id, "correo")) nCorreo++
    }
  }

  return { ola, push: nPush, whatsapp: nWa, correo: nCorreo, simulado: notificacionesSimuladas() || undefined }
}

/**
 * Lo que hace el reloj con las vacantes en cada corrida:
 *   1. Anota las que alguien tomó (para saber después si la soltó).
 *   2. Las que alguien soltó y siguen públicas: ciclo nuevo de avisos.
 *   3. Las que siguen abiertas y ya pasaron 45 min: la siguiente ola.
 * Antes solo existía el paso 3, sin orden y sin filtrar las ya cerradas: con
 * unas 20 vacantes tomadas rápido, la consulta devolvía siempre esas mismas y
 * la segunda ola dejaba de salir para siempre, sin ningún error.
 */
/** Nombre de cliente que llevan las reservas de las pruebas automáticas. */
export const CLIENTE_DE_PRUEBA = "PRUEBA WEBIA - BORRAR"

export async function mantenimientoDeVacantes(
  admin: Admin,
  /** Modo de prueba: solo toca reservas de prueba, nunca las reales. */
  opciones: { soloPrueba?: boolean } = {},
): Promise<ResumenOla[]> {
  const resultados: ResumenOla[] = []
  // Los tipos de supabase-js se ahogan con un genérico aquí; va sin tipo
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const acotar = (q: any) => (opciones.soloPrueba ? q.eq("reservations.manual_client_name", CLIENTE_DE_PRUEBA) : q)

  // 1. Tomadas: se cierra el ciclo y se anota cuándo
  const { data: tomadas, error: e1 } = await acotar(
    admin
      .from("vacante_avisos")
      .select("reservation_id, reservations!inner(walker_id, manual_client_name)")
      .is("tomada_at", null)
      .not("reservations.walker_id", "is", null),
  ).limit(100)
  if (e1) return resultados // sin migración 0026: nada que mantener
  for (const t of tomadas ?? []) await cerrarCiclo(admin, t.reservation_id as string, true)

  // 2. Soltadas: estaban tomadas y hoy vuelven a buscar paseador en público
  const { data: soltadas } = await acotar(
    admin
      .from("vacante_avisos")
      .select("reservation_id, reservations!inner(status, visibility, walker_id, manual_client_name)")
      .not("tomada_at", "is", null)
      .eq("reservations.status", "buscando_paseador")
      .eq("reservations.visibility", "public")
      .is("reservations.walker_id", null),
  ).limit(20)
  for (const r of soltadas ?? []) resultados.push(await anunciarVacante(admin, r.reservation_id as string, "reabrir"))

  // 3. Siguiente ola, de la más vieja a la más nueva, solo de las abiertas
  const limite = new Date(Date.now() - MINUTOS_ENTRE_OLAS * 60000).toISOString()
  const { data: pendientes } = await acotar(
    admin
      .from("vacante_avisos")
      .select("reservation_id, reservations!inner(status, visibility, walker_id, manual_client_name)")
      .lt("ola", MAX_OLAS)
      .is("tomada_at", null)
      .lte("ultima_ola_at", limite)
      .eq("reservations.status", "buscando_paseador")
      .eq("reservations.visibility", "public")
      .is("reservations.walker_id", null),
  )
    .order("ultima_ola_at", { ascending: true })
    .limit(20)
  for (const r of pendientes ?? []) resultados.push(await anunciarVacante(admin, r.reservation_id as string, "reloj"))

  return resultados
}

/**
 * Manda los correos en UNA sola petición (lote de Resend).
 * Antes se lanzaban 93 peticiones al mismo tiempo; Resend acepta 10 por
 * segundo y regresaba 429 al resto, que el código contaba como enviados: en
 * la práctica solo salían 10 por vacante y el reporte decía 93.
 */
async function mandarCorreos(
  destinatarios: { email: string; name: string | null }[],
  datos: { zone: string; dogName: string; dogSize: string; scheduledLabel: string; ganancia: number; walks: number },
): Promise<boolean> {
  if (notificacionesSimuladas()) return true
  const KEY = process.env.RESEND_API_KEY
  const FROM = process.env.RESEND_FROM ?? "Perrones Cuu <onboarding@resend.dev>"
  if (!KEY) return false
  try {
    const res = await fetch("https://api.resend.com/emails/batch", {
      method: "POST",
      headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify(
        destinatarios.map((d) => ({
          from: FROM,
          to: [d.email],
          subject: `🐶 Nuevo paseo disponible en ${datos.zone.replace(/[\r\n<>]/g, " ").slice(0, 80)}`,
          html: correoVacanteHtml({ ...datos, name: d.name }),
        })),
      ),
    })
    if (!res.ok) console.error("[vacantes] Resend respondió", res.status, await res.text().catch(() => ""))
    return res.ok
  } catch (e) {
    console.error("[vacantes] correo:", e instanceof Error ? e.message : e)
    return false
  }
}

function correoVacanteHtml(params: {
  name: string | null
  zone: string
  dogName: string
  dogSize: string
  scheduledLabel: string
  ganancia: number
  walks: number
}) {
  // Todo lo que viene del cliente se escapa: el nombre del perro o la colonia
  // no pueden meter un enlace en un correo que sale con el remitente del negocio
  const esc = (t: string | null) =>
    String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!)
  const name = params.name ? esc(params.name) : null
  const zone = esc(params.zone)
  const dogName = esc(params.dogName)
  const dogSize = esc(params.dogSize)
  const scheduledLabel = esc(params.scheduledLabel)
  const ganancia = params.ganancia
  const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://perronescuu.com"
  return `
<!DOCTYPE html>
<html>
  <head><meta charset="utf-8" /><title>Nuevo paseo disponible</title></head>
  <body style="margin:0;background:#f6fbfb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#0d3333;">
    <div style="max-width:560px;margin:0 auto;padding:32px 20px;">
      <div style="background:#fff;border-radius:28px;border:1px solid #d5ebe8;overflow:hidden;">
        <div style="background:#3DCABD;padding:24px;text-align:center;color:#fff;">
          ${EMAIL_LOGO_IMG}
          <p style="margin:0;font-size:14px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;">${BRAND.name}</p>
          <h1 style="margin:8px 0 0;font-size:24px;font-weight:800;">🐶 Tienes un paseo disponible</h1>
        </div>
        <div style="padding:28px 24px;">
          <p style="margin:0 0 16px;font-size:16px;line-height:1.5;">
            Hola${name ? ` ${name}` : ""}, hay un nuevo paseo esperando que lo tomes.
          </p>
          <div style="background:#f0fafa;border-radius:16px;padding:16px 18px;margin-bottom:20px;">
            <p style="margin:0 0 6px;font-size:12px;font-weight:700;color:#5a8080;text-transform:uppercase;letter-spacing:0.04em;">Detalles</p>
            <p style="margin:4px 0;font-size:15px;"><b>Perro:</b> ${dogName}${dogSize ? ` · ${dogSize}` : ""}</p>
            <p style="margin:4px 0;font-size:15px;"><b>Zona:</b> ${zone}</p>
            <p style="margin:4px 0;font-size:15px;"><b>Cuándo:</b> ${scheduledLabel}</p>
            ${params.walks > 1 ? `<p style="margin:4px 0;font-size:15px;"><b>Paquete:</b> ${params.walks} paseos (al aceptar te quedas con todos)</p>` : ""}
            <p style="margin:4px 0;font-size:15px;"><b>Tu ganancia:</b> MX$${ganancia}${params.walks > 1 ? " (paquete completo)" : ""}</p>
          </div>
          <p style="margin:0 0 24px;font-size:15px;line-height:1.5;">
            Entra a tu panel para aceptarlo antes que otro paseador.
          </p>
          <div style="text-align:center;">
            <a href="${SITE}/panel"
               style="display:inline-block;background:#3DCABD;color:#fff;text-decoration:none;padding:14px 28px;border-radius:999px;font-weight:800;font-size:15px;">
              Ver el paseo →
            </a>
          </div>
        </div>
        <div style="background:#f0fafa;padding:16px;text-align:center;font-size:12px;color:#5a8080;">
          Este correo se te envió porque eres paseador registrado en ${BRAND.name}. Si no esperabas este mensaje, ignóralo.
        </div>
      </div>
    </div>
  </body>
</html>
  `.trim()
}

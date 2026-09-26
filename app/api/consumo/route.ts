import { NextRequest, NextResponse } from "next/server"
import crypto from "node:crypto"
import { createAdminClient } from "@/lib/supabase/admin"
import { categoriasDePlantillas, fechasDePlantillas } from "@/lib/whatsapp"
import { alarmaDeSaldo, saldoTwilio } from "@/lib/saldo"

/**
 * Medidor de consumo de WhatsApp. SOLO para Diego (Webia), no para el panel
 * del cliente: se abre con la llave CONSUMO_LLAVE que vive en Vercel.
 *
 *   GET /api/consumo?llave=...            → página legible
 *   GET /api/consumo?llave=...&json=1     → los mismos datos en JSON
 *   &mes=anterior                         → el mes pasado
 *
 * Dos fuentes:
 *   · Twilio (Usage Records): lo que de verdad se va a cobrar, en USD.
 *   · La bitácora propia (wa_envios): qué aviso gastó cada mensaje.
 */

// Tarifas de México vigentes desde el 1-oct-2026 (Meta) + la cuota de Twilio.
// Fuente: developers.facebook.com/documentation/business-messaging/whatsapp/pricing
// y twilio.com/en-us/whatsapp/pricing (verificadas el 24-sep-2026).
const USD = { utility: 0.0085, marketing: 0.0397, authentication: 0.0085, twilio: 0.005 }

function llaveValida(dada: string | null): boolean {
  const real = process.env.CONSUMO_LLAVE
  if (!real || !dada) return false
  const a = Buffer.from(dada)
  const b = Buffer.from(real)
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

/** Trae TODAS las filas de a 1000: PostgREST corta en 1000 sin avisar y los
 *  conteos saldrían bajos justo en el medidor que existe para comprobarlos. */
async function todas<T>(
  pagina: (desde: number, hasta: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>,
): Promise<{ data: T[]; error: { message: string } | null }> {
  const filas: T[] = []
  for (let i = 0; i < 200000; i += 1000) {
    const { data, error } = await pagina(i, i + 999)
    if (error) return { data: filas, error }
    filas.push(...((data ?? []) as T[]))
    if (!data || data.length < 1000) break
  }
  return { data: filas, error: null }
}

/** Primer día del mes en Chihuahua (UTC-6 fijo), en ISO. */
function inicioDeMes(offsetMeses: number) {
  const ahora = new Date(Date.now() - 6 * 3600 * 1000)
  const d = new Date(Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth() + offsetMeses, 1, 6, 0, 0))
  return d
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  if (!llaveValida(url.searchParams.get("llave"))) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }
  const anterior = url.searchParams.get("mes") === "anterior"
  const desde = inicioDeMes(anterior ? -1 : 0)
  const hasta = inicioDeMes(anterior ? 0 : 1)

  // ---------- 1. Twilio: el dinero de verdad ----------
  let twilio: { categoria: string; cantidad: number; usd: number }[] = []
  let twilioTotalUsd: number | null = null
  let twilioError: string | null = null
  const SID = process.env.TWILIO_ACCOUNT_SID
  const TOKEN = process.env.TWILIO_AUTH_TOKEN
  if (SID && TOKEN) {
    try {
      const sub = anterior ? "LastMonth" : "ThisMonth"
      const res = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${SID}/Usage/Records/${sub}.json?PageSize=1000`,
        { headers: { Authorization: `Basic ${Buffer.from(`${SID}:${TOKEN}`).toString("base64")}` }, cache: "no-store" },
      )
      const data = await res.json()
      if (!res.ok) twilioError = data?.message ?? `Twilio respondió ${res.status}`
      else {
        const registros = (data?.usage_records ?? []) as { category: string; count: string; price: string }[]
        const interesan = (c: string) =>
          c.startsWith("channels-whatsapp") ||
          c === "channels-messaging-outbound" ||
          c === "channels-messaging-inbound" ||
          c === "failed-message-processing-fee"
        const presentes = registros.map((r) => r.category)
        // Twilio manda también categorías que SON la suma de otras (p.ej.
        // "channels-whatsapp" = marketing + utility + ...). Si se sumaran, el
        // total saldría doble: se quita toda categoría que tenga subcategorías.
        const esSuma = (c: string) => presentes.some((o) => o !== c && o.startsWith(`${c}-`))
        twilio = registros
          .filter((r) => interesan(r.category) && !esSuma(r.category) && (Number(r.count) > 0 || Number(r.price) > 0))
          .map((r) => ({ categoria: r.category, cantidad: Number(r.count), usd: Math.abs(Number(r.price)) }))
          .sort((a, b) => b.usd - a.usd)
        twilioTotalUsd = Number(twilio.reduce((s, r) => s + r.usd, 0).toFixed(4))
      }
    } catch (e) {
      twilioError = e instanceof Error ? e.message : "error de red"
    }
  } else {
    twilioError = "Sin credenciales de Twilio en este entorno"
  }

  // Saldo que le queda a la cuenta de Twilio (de ahí sale TODO: Meta + Twilio).
  // &probar_alarma=1 corre la alarma de saldo bajo en el momento (solo avisa
  // si de verdad está por debajo del mínimo).
  const saldo = await saldoTwilio()
  const alarma = url.searchParams.get("probar_alarma") === "1" ? await alarmaDeSaldo() : null

  // ---------- 2. Bitácora: qué aviso gastó cada mensaje ----------
  const admin = createAdminClient()
  const { data: envios, error: errBit } = await todas<{ plantilla: string; resultado: string; estado: string | null; message_sid: string | null }>(
    (a, b) =>
      admin
        .from("wa_envios")
        .select("plantilla, resultado, estado, message_sid")
        .gte("created_at", desde.toISOString())
        .lt("created_at", hasta.toISOString())
        .order("created_at")
        .range(a, b),
  )

  const categorias = await categoriasDePlantillas().catch(() => ({}) as Record<string, string | null>)
  type Fila = { plantilla: string; salieron: number; entregados: number; fallidos: number; saltados: number; categoria: string; usdEstimado: number }
  const porPlantilla = new Map<string, Fila>()
  for (const e of envios ?? []) {
    const nombre = e.plantilla as string
    if (!porPlantilla.has(nombre)) {
      const cat = (categorias[nombre] ?? "UTILITY (supuesta)") as string
      porPlantilla.set(nombre, { plantilla: nombre, salieron: 0, entregados: 0, fallidos: 0, saltados: 0, categoria: cat, usdEstimado: 0 })
    }
    const f = porPlantilla.get(nombre)!
    // "Salió" = Twilio lo aceptó (tiene SID), aunque después haya rebotado
    if (e.message_sid) f.salieron++
    else if (e.resultado === "saltado" || e.resultado === "error") f.saltados++
    if (e.estado === "delivered" || e.estado === "read") f.entregados++
    if (e.estado === "failed" || e.estado === "undelivered") f.fallidos++
  }
  for (const f of porPlantilla.values()) {
    // Meta cobra lo ENTREGADO; Twilio cobra lo que sale. Si aún no llega el
    // aviso de entrega, se cuenta como entregado para no subestimar.
    const cobrables = Math.max(f.entregados, f.salieron - f.fallidos)
    const meta = f.categoria.startsWith("MARKETING") ? USD.marketing : USD.utility
    f.usdEstimado = Number((cobrables * meta + f.salieron * USD.twilio).toFixed(4))
  }
  const plantillas = [...porPlantilla.values()].sort((a, b) => b.usdEstimado - a.usdEstimado)

  // ---------- 3. Vacantes: el aviso que antes era el 93% ----------
  const { data: notificados } = await todas<{ reservation_id: string; canal: string }>((a, b) =>
    admin
      .from("vacante_notificados")
      .select("reservation_id, canal")
      .gte("created_at", desde.toISOString())
      .lt("created_at", hasta.toISOString())
      .order("created_at")
      .range(a, b),
  )
  const vacantes = new Set((notificados ?? []).map((n) => n.reservation_id as string))
  const porCanal = { push: 0, whatsapp: 0, correo: 0 }
  for (const n of notificados ?? []) porCanal[n.canal as keyof typeof porCanal]++

  const { count: suscritos } = await admin.from("push_suscripciones").select("id", { count: "exact", head: true })

  const resumen = {
    periodo: { desde: desde.toISOString(), hasta: hasta.toISOString(), mes: anterior ? "anterior" : "actual" },
    twilio: { totalUsd: twilioTotalUsd, detalle: twilio, error: twilioError, saldo },
    alarma,
    bitacora: errBit ? { error: `La bitácora no existe todavía (${errBit.message})` } : { plantillas },
    vacantes: {
      anunciadas: vacantes.size,
      avisosPorCanal: porCanal,
      whatsappPorVacante: vacantes.size ? Number((porCanal.whatsapp / vacantes.size).toFixed(1)) : 0,
      paseadoresConAvisoGratis: suscritos ?? 0,
    },
    tarifasUsd: USD,
    // La categoría que Meta le puso a cada plantilla (marketing cuesta ~3 veces
    // más que utility y además Meta limita cuántos de marketing recibe cada
    // persona). Solo lo ve Webia.
    categoriasMeta: categorias,
    plantillasCreadas: await fechasDePlantillas().catch(() => ({})),
  }

  // &telefonos=1 → historial de entrega por número desde que se prendió el
  // WhatsApp (25-ago). Sirve para encontrar los números a los que NUNCA les
  // llega nada. Solo cuentas y los últimos 4 dígitos.
  if (url.searchParams.get("telefonos") === "1" && SID && TOKEN) {
    const auth = `Basic ${Buffer.from(`${SID}:${TOKEN}`).toString("base64")}`
    const desde = url.searchParams.get("desde") ?? "2026-08-25"
    const porTel = new Map<string, { enviados: number; entregados: number; leidos: number; fallidos: number; codigos: Record<string, number>; ultimo: string }>()
    let siguiente: string | null =
      `/2010-04-01/Accounts/${SID}/Messages.json?PageSize=1000&DateSent%3E=${desde}`
    let paginas = 0
    while (siguiente && paginas < 20) {
      paginas++
      const r = await fetch(`https://api.twilio.com${siguiente}`, { headers: { Authorization: auth }, cache: "no-store" })
      const d = await r.json()
      if (!r.ok) break
      for (const m of d.messages ?? []) {
        if (!String(m.direction).startsWith("outbound")) continue
        const t = String(m.to ?? "").replace(/\D/g, "").slice(-10)
        if (!t) continue
        const f = porTel.get(t) ?? { enviados: 0, entregados: 0, leidos: 0, fallidos: 0, codigos: {}, ultimo: "" }
        f.enviados++
        if (m.status === "delivered" || m.status === "read") f.entregados++
        if (m.status === "read") f.leidos++
        if (m.status === "failed" || m.status === "undelivered") {
          f.fallidos++
          const c = String(m.error_code ?? "?")
          f.codigos[c] = (f.codigos[c] ?? 0) + 1
        }
        if (String(m.date_sent) > f.ultimo) f.ultimo = String(m.date_sent)
        porTel.set(t, f)
      }
      siguiente = d.next_page_uri ?? null
    }
    // Cruce con los perfiles de paseador
    const { data: perfiles } = await admin.from("profiles").select("id, phone, role, wa_rebotes").eq("role", "paseador")
    const idPorTel = new Map<string, string[]>()
    for (const p of perfiles ?? []) {
      const t = String(p.phone ?? "").replace(/\D/g, "").slice(-10)
      if (t) idPorTel.set(t, [...(idPorTel.get(t) ?? []), p.id as string])
    }
    const filas = [...porTel.entries()]
      .filter(([t]) => idPorTel.has(t))
      .map(([t, f]) => ({ tel: `…${t.slice(-4)}`, perfiles: idPorTel.get(t)!, ...f }))
    return NextResponse.json({ paginas, numeros: filas.length, filas })
  }

  if (url.searchParams.get("json") === "1") return NextResponse.json(resumen)
  return new NextResponse(html(resumen), { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } })
}

function html(r: {
  periodo: { desde: string; mes: string }
  twilio: { totalUsd: number | null; detalle: { categoria: string; cantidad: number; usd: number }[]; error: string | null }
  bitacora: { plantillas?: { plantilla: string; salieron: number; entregados: number; fallidos: number; saltados: number; categoria: string; usdEstimado: number }[]; error?: string }
  vacantes: { anunciadas: number; avisosPorCanal: { push: number; whatsapp: number; correo: number }; whatsappPorVacante: number; paseadoresConAvisoGratis: number }
}) {
  const esc = (s: string | number) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!)
  const mes = new Date(r.periodo.desde).toLocaleDateString("es-MX", { month: "long", year: "numeric", timeZone: "America/Chihuahua" })
  const filasTw = r.twilio.detalle.map((t) => `<tr><td>${esc(t.categoria)}</td><td>${t.cantidad}</td><td>$${t.usd.toFixed(4)}</td></tr>`).join("")
  const filasPl = (r.bitacora.plantillas ?? [])
    .map((p) => `<tr><td>${esc(p.plantilla)}</td><td>${esc(p.categoria)}</td><td>${p.salieron}</td><td>${p.entregados}</td><td>${p.fallidos}</td><td>${p.saltados}</td><td>$${p.usdEstimado.toFixed(4)}</td></tr>`)
    .join("")
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Consumo WhatsApp · Perrones</title>
<style>body{font-family:-apple-system,system-ui,sans-serif;max-width:860px;margin:0 auto;padding:20px 16px;color:#0d3333;background:#f6fbfb}h1{font-size:22px}h2{font-size:16px;margin-top:28px}.big{font-size:34px;font-weight:800}table{width:100%;border-collapse:collapse;font-size:14px;background:#fff}td,th{padding:6px 8px;border-bottom:1px solid #d5ebe8;text-align:left}th{font-size:12px;text-transform:uppercase;color:#5a8080}.nota{color:#5a8080;font-size:13px}.err{color:#b33b3b}.wrap{overflow-x:auto}</style></head><body>
<h1>Consumo de WhatsApp — ${esc(mes)}</h1>
<p class="nota">Solo para Webia. Lo cobra Twilio en dólares; no incluye IVA ni tipo de cambio.</p>
<h2>Lo que va a cobrar Twilio este periodo</h2>
${r.twilio.totalUsd !== null ? `<p class="big">$${r.twilio.totalUsd.toFixed(2)} USD</p>` : `<p class="err">${esc(r.twilio.error ?? "sin datos")}</p>`}
${filasTw ? `<div class="wrap"><table><tr><th>Concepto</th><th>Mensajes</th><th>USD</th></tr>${filasTw}</table></div>` : ""}
<h2>Qué aviso gastó cada mensaje (bitácora)</h2>
${r.bitacora.error ? `<p class="err">${esc(r.bitacora.error)}</p>` : `<div class="wrap"><table><tr><th>Aviso</th><th>Categoría</th><th>Salieron</th><th>Entregados</th><th>Fallidos</th><th>No salieron</th><th>USD aprox.</th></tr>${filasPl || `<tr><td colspan="7">Sin envíos en el periodo</td></tr>`}</table></div>`}
<h2>Vacantes</h2>
<p>${r.vacantes.anunciadas} vacantes anunciadas · ${r.vacantes.avisosPorCanal.push} avisos gratis al celular · ${r.vacantes.avisosPorCanal.whatsapp} WhatsApp (${r.vacantes.whatsappPorVacante} por vacante; antes eran ~62) · ${r.vacantes.avisosPorCanal.correo} correos</p>
<p>${r.vacantes.paseadoresConAvisoGratis} teléfonos con el aviso gratis activado.</p>
</body></html>`
}

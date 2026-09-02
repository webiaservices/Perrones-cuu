import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { sendWhatsAppTemplate } from "@/lib/whatsapp"

/**
 * Cron de avisos por tiempo. Corre cada 15 minutos.
 *
 * Resuelve las cuatro plantillas que dependen del reloj y no de una acción
 * del usuario:
 *   1. paseo_sin_cubrir      — 2 h antes y sigue sin paseador
 *   2. recordatorio_paseador — 2 h antes de su primer paseo del día
 *   3. pago_vencido          — 3 días sin pago marcado (repite a los 7)
 *   4. solicitud_resena      — 1 día después del último paseo, cliente nuevo
 *
 * POR QUÉ GITHUB ACTIONS Y NO VERCEL CRON: el plan Hobby de Vercel solo
 * permite crons de una vez al día, con ±59 min de imprecisión. "2 horas
 * antes" es imposible ahí. El reloj vive en .github/workflows/avisos.yml
 * y solo pega a este endpoint.
 *
 * IDEMPOTENCIA: cada aviso escribe su timestamp en la reserva ANTES de
 * contar como enviado, y la consulta filtra por ese campo. Sin eso, correr
 * cada 15 min mandaría el mismo mensaje 8 veces por hora.
 */

const TZ = "America/Chihuahua"
const HORAS_ANTES = 2
/** Ventana de tolerancia: el cron corre cada 15 min y GitHub Actions se retrasa. */
const VENTANA_MIN = 45

function fmtHora(iso: string) {
  return new Date(iso).toLocaleTimeString("es-MX", {
    hour: "2-digit", minute: "2-digit", timeZone: TZ,
  })
}
function fmtFechaHora(iso: string) {
  return new Date(iso).toLocaleString("es-MX", {
    weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: TZ,
  })
}
function fmtFecha(iso: string) {
  return new Date(iso).toLocaleDateString("es-MX", {
    day: "numeric", month: "long", timeZone: TZ,
  })
}

type Resultado = { enviados: number; errores: string[] }

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  const authHeader = req.headers.get("authorization")
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  // Freno de mano. Mientras Meta tenga tumbada la cuenta de WhatsApp, cada
  // corrida gasta mensajes que nunca llegan (error 63112) y ensucia la
  // reputación del número. Se prende poniendo AVISOS_PAUSADOS=1 en Vercel y
  // se apaga borrando la variable — sin tocar código ni el workflow.
  if (process.env.AVISOS_PAUSADOS === "1") {
    return NextResponse.json({
      ok: true,
      pausado: true,
      motivo: "AVISOS_PAUSADOS=1 — el cron no manda nada hasta que se quite la variable",
    })
  }

  const admin = createAdminClient()
  const ahora = new Date()

  // Red de seguridad contra el mensaje doble: hay personas con dos cuentas y
  // el mismo teléfono, así que "una vez por usuario" no basta — tiene que ser
  // una vez por NÚMERO. Se comparan los últimos 10 dígitos porque en la base
  // los teléfonos están guardados de varias formas.
  const yaEnviado = new Set<string>()
  const esRepetido = (plantilla: string, tel: string) => {
    const clave = `${plantilla}|${tel.replace(/\D/g, "").slice(-10)}`
    if (yaEnviado.has(clave)) return true
    yaEnviado.add(clave)
    return false
  }

  const resumen: Record<string, Resultado> = {
    paseo_sin_cubrir: { enviados: 0, errores: [] },
    recordatorio_paseador: { enviados: 0, errores: [] },
    pago_vencido: { enviados: 0, errores: [] },
    solicitud_resena: { enviados: 0, errores: [] },
  }

  // ============================================================
  // 1. paseo_sin_cubrir — 2 h antes y nadie lo tomó
  // ============================================================
  {
    const desde = new Date(ahora.getTime() + (HORAS_ANTES * 60 - VENTANA_MIN) * 60000)
    const hasta = new Date(ahora.getTime() + HORAS_ANTES * 60 * 60000)

    const { data: paseos, error: qErr } = await admin
      .from("reservations")
      .select("id, user_id, scheduled_at, manual_client_phone")
      .eq("status", "buscando_paseador")
      .is("walker_id", null)
      .is("sin_cubrir_avisado_at", null)
      .gte("scheduled_at", desde.toISOString())
      .lte("scheduled_at", hasta.toISOString())

        // Si la consulta falla (p. ej. la migración 0022 no se ha corrido), hay
    // que gritarlo: reportar "0 enviados" haría creer que no había nada que
    // avisar cuando en realidad el cron está ciego.
    if (qErr) resumen.paseo_sin_cubrir.errores.push(`consulta: ${qErr.message}`)

    for (const p of paseos ?? []) {
      if (!p.scheduled_at) continue
      // Se marca ANTES de enviar: si el envío falla, preferimos no avisar a
      // avisar ocho veces. El admin lo ve igual en su panel.
      const { error: marcaErr } = await admin
        .from("reservations")
        .update({ sin_cubrir_avisado_at: ahora.toISOString() })
        .eq("id", p.id)
        .is("sin_cubrir_avisado_at", null)
      if (marcaErr) { resumen.paseo_sin_cubrir.errores.push(marcaErr.message); continue }

      const tel = p.manual_client_phone ?? (await telefonoDe(admin, p.user_id))
      if (!tel) continue
      if (esRepetido("paseo_sin_cubrir", tel)) continue
      const res = await sendWhatsAppTemplate("paseo_sin_cubrir", tel, [fmtHora(p.scheduled_at)])
      if ("ok" in res && res.ok) resumen.paseo_sin_cubrir.enviados++
      else {
        resumen.paseo_sin_cubrir.errores.push(motivo(res))
        // No salió: se devuelve la marca para que el siguiente intento lo tome
        await admin.from("reservations").update({ sin_cubrir_avisado_at: null }).eq("id", p.id)
      }
    }
  }

  // ============================================================
  // 2. recordatorio_paseador — 2 h antes de su PRIMER paseo del día
  // ============================================================
  {
    const desde = new Date(ahora.getTime() + (HORAS_ANTES * 60 - VENTANA_MIN) * 60000)
    const hasta = new Date(ahora.getTime() + HORAS_ANTES * 60 * 60000)

    const { data: paseos, error: qErr } = await admin
      .from("reservations")
      .select("id, walker_id, scheduled_at, pickup_address")
      .in("status", ["confirmada", "en_curso"])
      .not("walker_id", "is", null)
      .is("recordatorio_paseador_at", null)
      .gte("scheduled_at", desde.toISOString())
      .lte("scheduled_at", hasta.toISOString())
      .order("scheduled_at", { ascending: true })

    // "Primer paseo del día": si un paseador trae varios, solo el más temprano.
    const yaAvisado = new Set<string>()
        // Si la consulta falla (p. ej. la migración 0022 no se ha corrido), hay
    // que gritarlo: reportar "0 enviados" haría creer que no había nada que
    // avisar cuando en realidad el cron está ciego.
    if (qErr) resumen.recordatorio_paseador.errores.push(`consulta: ${qErr.message}`)

    for (const p of paseos ?? []) {
      if (!p.scheduled_at || !p.walker_id) continue
      const clave = `${p.walker_id}|${new Date(p.scheduled_at).toLocaleDateString("es-MX", { timeZone: TZ })}`
      if (yaAvisado.has(clave)) continue
      yaAvisado.add(clave)

      const { error: marcaErr } = await admin
        .from("reservations")
        .update({ recordatorio_paseador_at: ahora.toISOString() })
        .eq("id", p.id)
        .is("recordatorio_paseador_at", null)
      if (marcaErr) { resumen.recordatorio_paseador.errores.push(marcaErr.message); continue }

      const { data: w } = await admin
        .from("profiles").select("full_name, phone").eq("id", p.walker_id).single()
      if (!w?.phone) continue
      if (esRepetido("recordatorio_paseador", w.phone)) continue
      const res = await sendWhatsAppTemplate("recordatorio_paseador", w.phone, [
        w.full_name ?? "",
        fmtHora(p.scheduled_at),
        p.pickup_address ?? "Ver en tu panel",
      ])
      if ("ok" in res && res.ok) resumen.recordatorio_paseador.enviados++
      else {
        resumen.recordatorio_paseador.errores.push(motivo(res))
        await admin.from("reservations").update({ recordatorio_paseador_at: null }).eq("id", p.id)
      }
    }
  }

  // ============================================================
  // 3. pago_vencido — 3 días después sin pago marcado (repite a los 7)
  // ============================================================
  {
    const hace3 = new Date(ahora.getTime() - 3 * 24 * 60 * 60000)
    const { data: paseos, error: qErr } = await admin
      .from("reservations")
      .select("id, user_id, scheduled_at, price_mxn, manual_client_phone, pago_vencido_avisos, pago_vencido_ultimo_at")
      .eq("status", "completada")
      .eq("payment_status", "pendiente")
      .gt("price_mxn", 0)
      .lte("scheduled_at", hace3.toISOString())
      .lt("pago_vencido_avisos", 2)

        // Si la consulta falla (p. ej. la migración 0022 no se ha corrido), hay
    // que gritarlo: reportar "0 enviados" haría creer que no había nada que
    // avisar cuando en realidad el cron está ciego.
    if (qErr) resumen.pago_vencido.errores.push(`consulta: ${qErr.message}`)

    // Un cliente con tres paseos sin pagar recibía tres cobros seguidos.
    // Se junta todo lo suyo en un solo mensaje con el total y la fecha del
    // paseo más viejo, y se marcan todas sus reservas de esa tanda.
    type Deuda = { ids: string[]; total: number; masViejo: string; tel: string | null }
    const porCliente = new Map<string, Deuda>()

    for (const p of paseos ?? []) {
      if (!p.scheduled_at) continue
      // El segundo aviso va a los 7 días del paseo, no a los 7 del primero.
      if (p.pago_vencido_avisos >= 1) {
        const hace7 = new Date(ahora.getTime() - 7 * 24 * 60 * 60000)
        if (new Date(p.scheduled_at) > hace7) continue
      }

      const tel = p.manual_client_phone ?? (await telefonoDe(admin, p.user_id))
      if (!tel) continue

      const previo = porCliente.get(tel)
      if (previo) {
        previo.ids.push(p.id)
        previo.total += p.price_mxn ?? 0
        if (p.scheduled_at < previo.masViejo) previo.masViejo = p.scheduled_at
      } else {
        porCliente.set(tel, {
          ids: [p.id],
          total: p.price_mxn ?? 0,
          masViejo: p.scheduled_at,
          tel,
        })
      }
    }

    for (const [tel, deuda] of porCliente) {
      // Se marca ANTES de enviar para no cobrarle ocho veces al mismo cliente
      // si algo truena a media corrida; si el envío falla, se devuelve abajo.
      const antes = new Map<string, { avisos: number; ultimo: string | null }>()
      let falloMarca = false
      for (const id of deuda.ids) {
        const fila = (paseos ?? []).find((x) => x.id === id)
        const original = fila?.pago_vencido_avisos ?? 0
        const { error: marcaErr } = await admin
          .from("reservations")
          .update({
            pago_vencido_avisos: original + 1,
            pago_vencido_ultimo_at: ahora.toISOString(),
          })
          .eq("id", id)
          .eq("pago_vencido_avisos", original)
        if (marcaErr) {
          resumen.pago_vencido.errores.push(marcaErr.message)
          falloMarca = true
          break
        }
        antes.set(id, { avisos: original, ultimo: fila?.pago_vencido_ultimo_at ?? null })
      }
      if (falloMarca) continue

      if (esRepetido("pago_vencido", tel)) continue
      const res = await sendWhatsAppTemplate("pago_vencido", tel, [
        `MX$${deuda.total}`,
        fmtFecha(deuda.masViejo),
      ])
      if ("ok" in res && res.ok) resumen.pago_vencido.enviados++
      else {
        resumen.pago_vencido.errores.push(motivo(res))
        // Se deja como estaba: si ya traía un aviso previo, su fecha se respeta
        for (const [id, previo] of antes) {
          await admin
            .from("reservations")
            .update({ pago_vencido_avisos: previo.avisos, pago_vencido_ultimo_at: previo.ultimo })
            .eq("id", id)
        }
      }
    }
  }

  // ============================================================
  // 4. solicitud_resena — 1 día después, SOLO clientes nuevos
  // ============================================================
  {
    const hace1 = new Date(ahora.getTime() - 24 * 60 * 60000)
    const hace3 = new Date(ahora.getTime() - 3 * 24 * 60 * 60000)

    const { data: paseos, error: qErr } = await admin
      .from("reservations")
      .select("id, user_id, scheduled_at")
      .eq("status", "completada")
      .is("resena_solicitada_at", null)
      .not("user_id", "is", null)
      .lte("scheduled_at", hace1.toISOString())
      .gte("scheduled_at", hace3.toISOString())

        // Si la consulta falla (p. ej. la migración 0022 no se ha corrido), hay
    // que gritarlo: reportar "0 enviados" haría creer que no había nada que
    // avisar cuando en realidad el cron está ciego.
    if (qErr) resumen.solicitud_resena.errores.push(`consulta: ${qErr.message}`)

    for (const p of paseos ?? []) {
      // Cliente nuevo = nunca se le ha pedido reseña en NINGÚN paseo suyo.
      // Se consulta por user_id, no por reserva: así un cliente recurrente
      // no recibe la petición otra vez aunque sea otro paquete.
      const { count: yaPedidas } = await admin
        .from("reservations")
        .select("id", { count: "exact", head: true })
        .eq("user_id", p.user_id)
        .not("resena_solicitada_at", "is", null)
      if ((yaPedidas ?? 0) > 0) {
        await admin.from("reservations").update({ resena_solicitada_at: ahora.toISOString() }).eq("id", p.id)
        continue
      }

      const { error: marcaErr } = await admin
        .from("reservations")
        .update({ resena_solicitada_at: ahora.toISOString() })
        .eq("id", p.id)
        .is("resena_solicitada_at", null)
      if (marcaErr) { resumen.solicitud_resena.errores.push(marcaErr.message); continue }

      const tel = await telefonoDe(admin, p.user_id)
      if (!tel) continue
      if (esRepetido("solicitud_resena", tel)) continue
      const res = await sendWhatsAppTemplate("solicitud_resena", tel, [])
      if ("ok" in res && res.ok) resumen.solicitud_resena.enviados++
      else {
        resumen.solicitud_resena.errores.push(motivo(res))
        await admin.from("reservations").update({ resena_solicitada_at: null }).eq("id", p.id)
      }
    }
  }

  return NextResponse.json({ ok: true, corridoEn: ahora.toISOString(), resumen })
}

async function telefonoDe(
  admin: ReturnType<typeof createAdminClient>,
  userId: string | null,
): Promise<string | null> {
  if (!userId) return null
  const { data } = await admin.from("profiles").select("phone").eq("id", userId).single()
  return data?.phone ?? null
}

function motivo(res: unknown): string {
  if (typeof res === "object" && res !== null) {
    const r = res as Record<string, unknown>
    if (typeof r.error === "string") return r.error
    if (typeof r.reason === "string") return r.reason
  }
  return "error desconocido"
}

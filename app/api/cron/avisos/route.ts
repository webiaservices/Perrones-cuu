import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { enviarWhatsApp, type ResultadoEnvio } from "@/lib/wa-envios"
import { mantenimientoDeVacantes, type ResumenOla } from "@/lib/vacantes"

// Anunciar una vacante a ~80 paseadores tarda más que los 10 s por omisión
export const maxDuration = 60

/**
 * Cron de avisos por tiempo. Corre cada 15 minutos.
 *
 * Resuelve las cuatro plantillas que dependen del reloj y no de una acción
 * del usuario:
 *   1. paseo_sin_cubrir      — 2 h antes y sigue sin paseador
 *   2. recordatorio_paseador — 2 h antes de su primer paseo del día
 *   3. pago_vencido          — 3 días sin pago marcado (repite a los 7)
 *   4. solicitud_resena      — 1 día después del último paseo, cliente nuevo
 *   5. vacantes              — 2ª ola si nadie la tomó, y ciclo nuevo si alguien
 *                              la soltó (lib/vacantes)
 *
 * DOS RELOJES: GitHub Actions (que en la práctica corre cada ~2.8 h, no cada
 * 15 min) y pg_cron dentro de Supabase (migración 0026). Pueden encimarse, así
 * que cada candado revisa cuántas filas marcó: si otra corrida ya la marcó,
 * esta no manda. Y wa_envios tiene su propio candado por clave.
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

/** El envío "cuenta" si salió o si se simuló (modo prueba). */
const salio = (r: ResultadoEnvio) => r.enviado
/** No salió y no va a salir en el siguiente intento: no se devuelve la marca,
 *  o cada corrida dentro de la ventana volvería a intentarlo. */
const esDefinitivo = (r: ResultadoEnvio) => /^número (silenciado|inválido)/.test(r.motivo)

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  const authHeader = req.headers.get("authorization") ?? ""
  const llave = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : ""
  const esGitHub = !!cronSecret && llave === cronSecret
  // pg_cron manda una llave que vive solo dentro de la base; se valida
  // preguntándole a la base (avisos_llave_valida, migración 0026)
  let esPgCron = false
  if (!esGitHub && llave) {
    const { data } = await createAdminClient().rpc("avisos_llave_valida", { llave })
    esPgCron = data === true
  }
  if (cronSecret && !esGitHub && !esPgCron) {
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

  // En modo prueba los avisos por tiempo NO corren: sus marcas se escriben en
  // reservas REALES y dejarían sin su aviso de verdad a clientes y
  // paseadores. Solo corren las oleadas, y solo sobre reservas de prueba.
  if (process.env.NOTIFICACIONES_SIMULADAS === "1") {
    const vacantes = await mantenimientoDeVacantes(createAdminClient(), { soloPrueba: true })
    return NextResponse.json({ ok: true, simulado: true, motivo: "modo de prueba: solo oleadas de reservas de prueba", vacantes })
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
      const { data: marcadas, error: marcaErr } = await admin
        .from("reservations")
        .update({ sin_cubrir_avisado_at: ahora.toISOString() })
        .eq("id", p.id)
        .is("sin_cubrir_avisado_at", null)
        .select("id")
      if (marcaErr) { resumen.paseo_sin_cubrir.errores.push(marcaErr.message); continue }
      if (!marcadas || marcadas.length === 0) continue // otra corrida ya lo tomó

      const tel = p.manual_client_phone ?? (await telefonoDe(admin, p.user_id))
      if (!tel) continue
      if (esRepetido("paseo_sin_cubrir", tel)) continue
      const res = await enviarWhatsApp(admin, {
        plantilla: "paseo_sin_cubrir",
        telefono: tel,
        variables: [fmtHora(p.scheduled_at)],
        clave: `paseo_sin_cubrir|${p.id}`,
        motivo: "2 h antes sin paseador",
        profileId: p.manual_client_phone ? null : p.user_id,
        reservationId: p.id,
      })
      if (salio(res)) resumen.paseo_sin_cubrir.enviados++
      else if (res.motivo === "ya se había mandado" || esDefinitivo(res)) continue
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
      const dia = new Date(p.scheduled_at).toLocaleDateString("es-MX", { timeZone: TZ })
      const clave = `${p.walker_id}|${dia}`

      // Se marca TAMBIÉN el paseo que se salta por no ser el primero del día.
      // Antes quedaba sin marca y la corrida siguiente (15 min después, aún
      // dentro de la ventana) le mandaba su propio recordatorio: salía uno por
      // paseo en vez de uno por paseador por día.
      const { data: marcadas, error: marcaErr } = await admin
        .from("reservations")
        .update({ recordatorio_paseador_at: ahora.toISOString() })
        .eq("id", p.id)
        .is("recordatorio_paseador_at", null)
        .select("id")
      if (marcaErr) { resumen.recordatorio_paseador.errores.push(marcaErr.message); continue }
      if (!marcadas || marcadas.length === 0) continue // otra corrida ya lo tomó
      if (yaAvisado.has(clave)) continue
      yaAvisado.add(clave)

      const { data: w } = await admin
        .from("profiles").select("full_name, phone").eq("id", p.walker_id).single()
      if (!w?.phone) continue
      if (esRepetido("recordatorio_paseador", w.phone)) continue
      const res = await enviarWhatsApp(admin, {
        plantilla: "recordatorio_paseador",
        telefono: w.phone,
        variables: [w.full_name ?? "", fmtHora(p.scheduled_at), p.pickup_address ?? "Ver en tu panel"],
        // Uno por paseador por día, aunque dos corridas se encimen
        clave: `recordatorio_paseador|${p.walker_id}|${dia}`,
        motivo: "2 h antes de su primer paseo del día",
        profileId: p.walker_id,
        reservationId: p.id,
      })
      if (salio(res)) resumen.recordatorio_paseador.enviados++
      else if (res.motivo === "ya se había mandado" || esDefinitivo(res)) continue
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
      .select("id, user_id, scheduled_at, price_mxn, manual_client_phone, pago_vencido_avisos, pago_vencido_ultimo_at, package_id")
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
    type Deuda = { ids: string[]; total: number; masViejo: string; tel: string | null; userId: string | null; aviso: number }
    const porCliente = new Map<string, Deuda>()
    const hace7 = new Date(ahora.getTime() - 7 * 24 * 60 * 60000)

    for (const p of paseos ?? []) {
      if (!p.scheduled_at) continue
      // El precio vive en el paseo 1 del paquete, pero la deuda empieza cuando
      // TERMINA el paquete. Antes se contaba desde el día 1 y al cliente de
      // una semana le llegaba "pago pendiente" a media semana.
      const fin = await finDelPaquete(admin, p.package_id, p.scheduled_at)
      if (new Date(fin) > hace3) continue
      if (p.pago_vencido_avisos >= 1) {
        // El segundo aviso: a los 7 días del fin y al menos 3 después del
        // primero. Antes, en un paseo ya viejo, los dos salían el mismo día.
        if (new Date(fin) > hace7) continue
        const hace3Aviso = new Date(ahora.getTime() - 3 * 24 * 60 * 60000)
        if (p.pago_vencido_ultimo_at && new Date(p.pago_vencido_ultimo_at) > hace3Aviso) continue
      }

      const tel = p.manual_client_phone ?? (await telefonoDe(admin, p.user_id))
      if (!tel) continue

      const previo = porCliente.get(tel)
      if (previo) {
        previo.ids.push(p.id)
        previo.total += p.price_mxn ?? 0
        if (p.scheduled_at < previo.masViejo) previo.masViejo = p.scheduled_at
        previo.aviso = Math.max(previo.aviso, p.pago_vencido_avisos + 1)
      } else {
        porCliente.set(tel, {
          ids: [p.id],
          total: p.price_mxn ?? 0,
          masViejo: p.scheduled_at,
          tel,
          userId: p.manual_client_phone ? null : p.user_id,
          aviso: p.pago_vencido_avisos + 1,
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
        const { data: marcadas, error: marcaErr } = await admin
          .from("reservations")
          .update({
            pago_vencido_avisos: original + 1,
            pago_vencido_ultimo_at: ahora.toISOString(),
          })
          .eq("id", id)
          .eq("pago_vencido_avisos", original)
          .select("id")
        if (marcaErr || !marcadas || marcadas.length === 0) {
          // Error, u otra corrida ya lo marcó: esta no cobra
          if (marcaErr) resumen.pago_vencido.errores.push(marcaErr.message)
          falloMarca = true
          break
        }
        antes.set(id, { avisos: original, ultimo: fila?.pago_vencido_ultimo_at ?? null })
      }
      if (falloMarca) {
        for (const [id, previo] of antes) {
          await admin
            .from("reservations")
            .update({ pago_vencido_avisos: previo.avisos, pago_vencido_ultimo_at: previo.ultimo })
            .eq("id", id)
        }
        continue
      }

      if (esRepetido("pago_vencido", tel)) continue
      const res = await enviarWhatsApp(admin, {
        plantilla: "pago_vencido",
        telefono: tel,
        variables: [`MX$${deuda.total}`, fmtFecha(deuda.masViejo)],
        clave: `pago_vencido|${[...deuda.ids].sort().join(",")}|${deuda.aviso}`,
        motivo: `pago vencido, aviso ${deuda.aviso}`,
        profileId: deuda.userId,
        reservationId: deuda.ids[0],
      })
      if (salio(res)) resumen.pago_vencido.enviados++
      // Número silenciado, o ya salió antes: la marca se queda (si se
      // devolviera, cada corrida lo volvería a intentar)
      else if (res.motivo === "ya se había mandado" || esDefinitivo(res)) continue
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
      .select("id, user_id, scheduled_at, package_id")
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
      // En paquetes, solo cuenta el ÚLTIMO día: antes la petición salía un día
      // después del día 1, con la semana a medias.
      if (p.package_id && p.scheduled_at) {
        const fin = await finDelPaquete(admin, p.package_id, p.scheduled_at)
        if (fin !== p.scheduled_at) continue
      }
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

      const { data: marcadas, error: marcaErr } = await admin
        .from("reservations")
        .update({ resena_solicitada_at: ahora.toISOString() })
        .eq("id", p.id)
        .is("resena_solicitada_at", null)
        .select("id")
      if (marcaErr) { resumen.solicitud_resena.errores.push(marcaErr.message); continue }
      if (!marcadas || marcadas.length === 0) continue // otra corrida ya lo tomó

      const tel = await telefonoDe(admin, p.user_id)
      if (!tel) continue
      if (esRepetido("solicitud_resena", tel)) continue
      const res = await enviarWhatsApp(admin, {
        plantilla: "solicitud_resena",
        telefono: tel,
        variables: [],
        // Una por cliente, para siempre
        clave: `solicitud_resena|${p.user_id}`,
        motivo: "reseña, cliente nuevo",
        profileId: p.user_id,
        reservationId: p.id,
      })
      if (salio(res)) resumen.solicitud_resena.enviados++
      else if (res.motivo === "ya se había mandado" || esDefinitivo(res)) continue
      else {
        resumen.solicitud_resena.errores.push(motivo(res))
        await admin.from("reservations").update({ resena_solicitada_at: null }).eq("id", p.id)
      }
    }
  }

  // ============================================================
  // 5. vacantes — la siguiente ola si nadie tomó el paseo
  // ============================================================
  let vacantes: ResumenOla[] = []
  try {
    vacantes = await mantenimientoDeVacantes(admin)
  } catch (e) {
    console.error("[cron/avisos] olas:", e instanceof Error ? e.message : e)
  }

  return NextResponse.json({
    ok: true,
    corridoEn: ahora.toISOString(),
    reloj: esGitHub ? "github" : esPgCron ? "pg_cron" : "sin llave",
    resumen,
    vacantes,
  })
}

/** Fecha del último día del paquete (o la del paseo, si es suelto). */
async function finDelPaquete(
  admin: ReturnType<typeof createAdminClient>,
  packageId: string | null,
  scheduledAt: string,
): Promise<string> {
  if (!packageId) return scheduledAt
  const { data } = await admin
    .from("reservations")
    .select("scheduled_at")
    .eq("package_id", packageId)
    .neq("status", "cancelada")
    .order("scheduled_at", { ascending: false })
    .limit(1)
  return (data?.[0]?.scheduled_at as string | undefined) ?? scheduledAt
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
    if (typeof r.motivo === "string") return r.motivo
    if (typeof r.error === "string") return r.error
    if (typeof r.reason === "string") return r.reason
  }
  return "error desconocido"
}

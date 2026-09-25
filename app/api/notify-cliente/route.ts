import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { getCaller } from "@/lib/api-auth"
import { BRAND } from "@/lib/constants"
import { EMAIL_LOGO_IMG } from "@/lib/email-brand"
import { enviarWhatsApp } from "@/lib/wa-envios"

/**
 * Avisa al cliente (correo + WhatsApp) y, al asignar, al paseador.
 * Se llama en 2 momentos:
 *   - kind=reservada: cuando el dueño confirma la reserva
 *   - kind=asignada: cuando un paseador acepta el paseo o el admin lo asigna
 *
 * Cada WhatsApp lleva candado (clave) en lib/wa-envios: antes el dueño o el
 * paseador podían volver a llamar esta ruta y cada llamada eran 2 mensajes
 * pagados más. Ahora el mismo aviso del mismo paquete sale una sola vez.
 */
export async function POST(req: NextRequest) {
  const RESEND_API_KEY = process.env.RESEND_API_KEY
  const RESEND_FROM = process.env.RESEND_FROM ?? "Perrones Cuu <onboarding@resend.dev>"
  const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://v0-perrones-landing-page.vercel.app"

  try {
    const { reservationId, kind } = await req.json()
    if (!reservationId || !kind) {
      return NextResponse.json({ error: "reservationId y kind requeridos" }, { status: 400 })
    }

    const caller = await getCaller()
    if (!caller) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

    const admin = createAdminClient()

    const { data: reservation, error: resErr } = await admin
      .from("reservations")
      .select("id, plan_name, dogs_count, price_mxn, status, scheduled_at, zone, pickup_address, dog_name, dog_size, user_id, walker_id, package_id, manual_client_name, manual_client_phone")
      .eq("id", reservationId)
      .single()

    if (resErr || !reservation) {
      return NextResponse.json({ error: "Reserva no encontrada" }, { status: 404 })
    }

    // Solo el dueño, el paseador asignado o un admin pueden disparar este aviso
    if (!caller.isAdmin && reservation.user_id !== caller.id && reservation.walker_id !== caller.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 })
    }

    const isAssigned = kind === "asignada"
    // Cliente manual (sin cuenta): el user_id es el del ADMIN. Antes el
    // paseador recibía el nombre y el teléfono del admin como si fuera el
    // cliente, y el correo "tu paseador aceptó" le llegaba a Endy.
    const esManual = !!reservation.manual_client_name

    // Nombre y teléfono del cliente
    let clienteNombre: string | null = null
    let clienteTelefono: string | null = null
    if (esManual) {
      clienteNombre = reservation.manual_client_name
      clienteTelefono = reservation.manual_client_phone ?? null
    } else {
      const { data: profile } = await admin
        .from("profiles")
        .select("full_name, phone")
        .eq("id", reservation.user_id)
        .single()
      clienteNombre = profile?.full_name ?? null
      clienteTelefono = profile?.phone ?? null
    }

    // Nombre del paseador si ya está asignado
    let walkerName: string | null = null
    let walkerPhone: string | null = null
    if (reservation.walker_id) {
      const { data: w } = await admin
        .from("profiles")
        .select("full_name, phone")
        .eq("id", reservation.walker_id)
        .single()
      walkerName = w?.full_name ?? null
      walkerPhone = w?.phone ?? null
    }

    const scheduledLabel = reservation.scheduled_at
      ? new Date(reservation.scheduled_at).toLocaleString("es-MX", {
          weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit",
          timeZone: "America/Chihuahua",
        })
      : "Por confirmar"

    // ---------- Correo al cliente (solo clientes con cuenta) ----------
    // Ya no condiciona al WhatsApp: antes, sin correo o sin Resend, la ruta
    // regresaba antes y el WhatsApp tampoco salía, sin avisar a nadie.
    let correoEnviado = false
    if (!esManual && RESEND_API_KEY) {
      const { data: u } = await admin.auth.admin.getUserById(reservation.user_id)
      const clienteEmail = u?.user?.email
      if (clienteEmail) {
        const subject = isAssigned
          ? `✅ ${walkerName ?? "Un paseador"} aceptó el paseo de ${reservation.dog_name ?? "tu perrito"}`
          : `🐶 Recibimos tu reserva en ${BRAND.name}`
        const html = isAssigned
          ? buildAsignadaHtml({ clienteNombre, walkerName, reservation, scheduledLabel, site: SITE })
          : buildReservadaHtml({ clienteNombre, reservation, scheduledLabel, site: SITE })
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({ from: RESEND_FROM, to: [clienteEmail], subject, html }),
        }).catch(() => null)
        correoEnviado = !!res?.ok
      }
    }

    // ---------- WhatsApp ----------
    // Los textos y el orden de variables están en lib/whatsapp-plantillas.ts.
    const paquete = reservation.package_id ?? reservation.id
    let waResult: unknown = { skipped: true, reason: esManual ? "cliente manual" : "sin teléfono" }
    if (clienteTelefono && !esManual) {
      if (isAssigned) {
        // paseador_asignado: {{1}} paseador · {{2}} fecha y hora
        waResult = await enviarWhatsApp(admin, {
          plantilla: "paseador_asignado",
          telefono: clienteTelefono,
          variables: [walkerName ?? "Su paseador", scheduledLabel],
          clave: `paseador_asignado|${paquete}|${reservation.walker_id ?? "-"}`,
          motivo: "paseador asignado",
          profileId: reservation.user_id,
          reservationId: reservation.id,
        })
      } else {
        // paseo_confirmado: {{1}} nombre · {{2}} LISTA de fechas, una por renglón.
        // Endy la pidió así porque un paquete son varios días y mandar solo la
        // primera fecha hacía que el cliente creyera que era un paseo suelto.
        waResult = await enviarWhatsApp(admin, {
          plantilla: "paseo_confirmado",
          telefono: clienteTelefono,
          variables: [clienteNombre ?? "", await listaDeFechas(admin, reservation)],
          clave: `paseo_confirmado|${paquete}`,
          motivo: "reserva recibida",
          profileId: reservation.user_id,
          reservationId: reservation.id,
        })
      }
    }

    // paseador_acepta: al PASEADOR, con los datos del dueño y el manual.
    // Solo al aceptar — nunca a quien apenas vio el paseo disponible.
    // Es el ÚNICO WhatsApp que recibe el paseador al quedar asignado (antes el
    // admin le mandaba además un "se abrió una vacante" que ya era suyo).
    let waPaseador: unknown = { skipped: true, reason: "no aplica" }
    if (isAssigned && walkerPhone && reservation.walker_id) {
      waPaseador = await enviarWhatsApp(admin, {
        plantilla: "paseador_acepta",
        telefono: walkerPhone,
        variables: [
          walkerName ?? "",
          clienteNombre ?? "Cliente",
          clienteTelefono ?? "Ver en el panel",
          reservation.pickup_address ?? "Ver en el panel",
          await listaDeFechas(admin, reservation),
        ],
        clave: `paseador_acepta|${paquete}|${reservation.walker_id}`,
        motivo: "paseo asignado al paseador",
        profileId: reservation.walker_id,
        reservationId: reservation.id,
      })
    }

    return NextResponse.json({ ok: true, sent: correoEnviado, kind, whatsapp: waResult, whatsappPaseador: waPaseador })
  } catch (e: unknown) {
    console.error("notify-cliente error:", e)
    const msg = e instanceof Error ? e.message : "Error"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

type Reservation = {
  plan_name: string | null
  dogs_count: number
  price_mxn: number
  zone: string | null
  pickup_address: string | null
  dog_name: string | null
  dog_size: string | null
}

function emailShell(title: string, headline: string, bodyHtml: string, site: string) {
  return `
<!DOCTYPE html>
<html><body style="margin:0;background:#f6fbfb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#0d3333;">
  <div style="max-width:560px;margin:0 auto;padding:32px 20px;">
    <div style="background:#fff;border-radius:28px;border:1px solid #d5ebe8;overflow:hidden;">
      <div style="background:#3DCABD;padding:24px;text-align:center;color:#fff;">
        ${EMAIL_LOGO_IMG}
        <p style="margin:0;font-size:14px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;">${BRAND.name}</p>
        <h1 style="margin:8px 0 0;font-size:24px;font-weight:800;">${title}</h1>
      </div>
      <div style="padding:28px 24px;">
        <p style="margin:0 0 16px;font-size:16px;line-height:1.5;"><b>${headline}</b></p>
        ${bodyHtml}
        <div style="text-align:center;margin-top:24px;">
          <a href="${site}/panel" style="display:inline-block;background:#3DCABD;color:#fff;text-decoration:none;padding:14px 28px;border-radius:999px;font-weight:800;font-size:15px;">
            Ir a mi panel →
          </a>
        </div>
      </div>
      <div style="background:#f0fafa;padding:16px;text-align:center;font-size:12px;color:#5a8080;">
        Cualquier duda escríbenos por WhatsApp al +52 614 594 8513.
      </div>
    </div>
  </div>
</body></html>
  `.trim()
}

function buildReservadaHtml({
  clienteNombre,
  reservation,
  scheduledLabel,
  site,
}: {
  clienteNombre: string | null
  reservation: Reservation
  scheduledLabel: string
  site: string
}) {
  const body = `
    <div style="background:#f0fafa;border-radius:16px;padding:16px 18px;margin-bottom:20px;">
      <p style="margin:0 0 6px;font-size:12px;font-weight:700;color:#5a8080;text-transform:uppercase;letter-spacing:0.04em;">Detalles de tu paseo</p>
      <p style="margin:4px 0;font-size:15px;"><b>Plan:</b> ${reservation.plan_name ?? ""}</p>
      <p style="margin:4px 0;font-size:15px;"><b>Perrito:</b> ${reservation.dog_name ?? ""}${reservation.dog_size ? ` (${reservation.dog_size})` : ""}</p>
      <p style="margin:4px 0;font-size:15px;"><b>Cuándo:</b> ${scheduledLabel}</p>
      <p style="margin:4px 0;font-size:15px;"><b>Zona:</b> ${reservation.zone ?? ""}</p>
      ${reservation.pickup_address ? `<p style="margin:4px 0;font-size:15px;"><b>Dirección:</b> ${reservation.pickup_address}</p>` : ""}
      <p style="margin:4px 0;font-size:15px;"><b>Total:</b> MX$${reservation.price_mxn}</p>
    </div>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.5;">
      Estamos buscando al paseador ideal para tu perrito en tu zona. Te avisamos en cuanto alguien acepte (suele tardar pocos minutos).
    </p>
  `
  return emailShell(
    "🐶 Reserva recibida",
    `Hola${clienteNombre ? ` ${clienteNombre}` : ""}, ¡tu paseo está agendado!`,
    body,
    site,
  )
}

function buildAsignadaHtml({
  clienteNombre,
  walkerName,
  reservation,
  scheduledLabel,
  site,
}: {
  clienteNombre: string | null
  walkerName: string | null
  reservation: Reservation
  scheduledLabel: string
  site: string
}) {
  const body = `
    <div style="background:#f0fafa;border-radius:16px;padding:16px 18px;margin-bottom:20px;">
      <p style="margin:0 0 6px;font-size:12px;font-weight:700;color:#5a8080;text-transform:uppercase;letter-spacing:0.04em;">Tu paseo</p>
      <p style="margin:4px 0;font-size:15px;"><b>Paseador:</b> ${walkerName ?? "Asignado"}</p>
      <p style="margin:4px 0;font-size:15px;"><b>Perrito:</b> ${reservation.dog_name ?? ""}${reservation.dog_size ? ` (${reservation.dog_size})` : ""}</p>
      <p style="margin:4px 0;font-size:15px;"><b>Cuándo:</b> ${scheduledLabel}</p>
      <p style="margin:4px 0;font-size:15px;"><b>Dirección:</b> ${reservation.pickup_address ?? ""}</p>
    </div>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.5;">
      ¡Listo! <b>${walkerName ?? "Tu paseador asignado"}</b> tomó tu paseo y llegará en la fecha y hora acordadas. Tu perrito está incluido en nuestro seguro mientras el paseo se gestione en Perrones.
    </p>
  `
  return emailShell(
    "✅ Paseador confirmado",
    `Hola${clienteNombre ? ` ${clienteNombre}` : ""}, ya tienes paseador.`,
    body,
    site,
  )
}

/**
 * Las fechas de un paquete, una por renglón: "Lunes 25 de agosto · 6:00 pm".
 * Si es un paseo suelto devuelve solo esa fecha.
 */
async function listaDeFechas(
  admin: ReturnType<typeof createAdminClient>,
  reservation: { scheduled_at: string | null; package_id?: string | null },
): Promise<string> {
  const fmt = (iso: string) =>
    new Date(iso).toLocaleString("es-MX", {
      weekday: "long", day: "numeric", month: "long",
      hour: "2-digit", minute: "2-digit", timeZone: "America/Chihuahua",
    })

  if (!reservation.package_id) {
    return reservation.scheduled_at ? fmt(reservation.scheduled_at) : "Por confirmar"
  }

  const { data: dias } = await admin
    .from("reservations")
    .select("scheduled_at")
    .eq("package_id", reservation.package_id)
    .order("scheduled_at", { ascending: true })

  const fechas = (dias ?? [])
    .map((d) => d.scheduled_at)
    .filter((f): f is string => Boolean(f))
    .map(fmt)

  return fechas.length > 0
    ? fechas.join("\n")
    : reservation.scheduled_at
      ? fmt(reservation.scheduled_at)
      : "Por confirmar"
}

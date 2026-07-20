import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { BRAND, STATUS_LABELS, walkerPayoutFor } from "@/lib/constants"
import { sendWhatsAppTemplate } from "@/lib/whatsapp"
import { getCaller } from "@/lib/api-auth"

/**
 * Notifica por correo a los paseadores cuya `zone` coincide con la reserva.
 * Llamado desde el cliente justo después de crear la reserva.
 *
 * Requiere env var RESEND_API_KEY. Si no está, hace no-op silencioso.
 */
export async function POST(req: NextRequest) {
  const RESEND_API_KEY = process.env.RESEND_API_KEY
  const RESEND_FROM = process.env.RESEND_FROM ?? "Perrones Cuu <onboarding@resend.dev>"

  try {
    const { reservationId } = await req.json()
    if (!reservationId) {
      return NextResponse.json({ error: "reservationId requerido" }, { status: 400 })
    }

    const admin = createAdminClient()

    // 1. Obtén la reserva con todos los datos para el correo
    const { data: reservation, error: resErr } = await admin
      .from("reservations")
      .select("id, user_id, plan_name, dogs_count, price_mxn, status, scheduled_at, scheduled_until, zone, dog_name, dog_size, package_id, package_index, package_total, admin_fee_mxn")
      .eq("id", reservationId)
      .single()

    const caller = await getCaller()
    if (!caller) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

    if (resErr || !reservation) {
      return NextResponse.json({ error: "Reserva no encontrada" }, { status: 404 })
    }

    // Solo el dueño de la reserva o un admin pueden disparar el blast a paseadores
    if (!caller.isAdmin && reservation.user_id !== caller.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 })
    }

    if (reservation.status !== "buscando_paseador") {
      return NextResponse.json({ notified: 0, reason: "no necesita notificación" })
    }

    // Paquetes: solo el paseo 1 dispara el correo (uno por paquete, no N).
    // El correo ya describe el paquete completo y la ganancia total.
    if (reservation.package_index && reservation.package_index > 1) {
      return NextResponse.json({ notified: 0, reason: "paseo secundario de paquete" })
    }

    // 2. Encuentra paseadores en esa zona
    const { data: profiles } = await admin
      .from("profiles")
      .select("id, full_name, phone")
      .eq("role", "paseador")
      .eq("zone", reservation.zone)

    if (!profiles || profiles.length === 0) {
      return NextResponse.json({ notified: 0, reason: "sin paseadores en la zona" })
    }

    // 3. Resuelve emails desde auth.users (no están en profiles)
    const paseadorIds = profiles.map((p) => p.id)
    const emails: { email: string; name: string | null }[] = []
    for (const id of paseadorIds) {
      const { data: u } = await admin.auth.admin.getUserById(id)
      const userEmail = u?.user?.email
      if (userEmail) {
        const name = profiles.find((p) => p.id === id)?.full_name ?? null
        emails.push({ email: userEmail, name })
      }
    }

    if (emails.length === 0) {
      return NextResponse.json({ notified: 0, reason: "paseadores sin email" })
    }

    if (!RESEND_API_KEY) {
      console.warn("[notify-paseadores] RESEND_API_KEY no configurada — saltando envío")
      return NextResponse.json({ notified: 0, skipped: true, reason: "RESEND_API_KEY no configurada" })
    }

    // 4. Genera el correo
    const scheduledLabel = reservation.scheduled_at
      ? new Date(reservation.scheduled_at).toLocaleString("es-MX", {
          weekday: "long",
          day: "numeric",
          month: "long",
          hour: "2-digit",
          minute: "2-digit",
          timeZone: "America/Chihuahua",
        })
      : "Por confirmar"

    // Misma fórmula que los paneles: precio − comisión admin (30% default o fee en pesos)
    const ganancia = walkerPayoutFor(Number(reservation.price_mxn), reservation.admin_fee_mxn)

    // 5. Manda correo a cada paseador via Resend
    const results = await Promise.allSettled(
      emails.map(({ email, name }) =>
        fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${RESEND_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: RESEND_FROM,
            to: [email],
            subject: `🐶 Nuevo paseo disponible en ${reservation.zone}`,
            html: buildEmailHtml({
              name,
              zone: reservation.zone ?? "",
              dogName: reservation.dog_name ?? "Un perrito",
              dogSize: reservation.dog_size ?? "",
              scheduledLabel,
              ganancia,
              walks: reservation.package_total ?? 1,
              status: STATUS_LABELS[reservation.status] ?? reservation.status,
            }),
          }),
        }),
      ),
    )

    const sent = results.filter((r) => r.status === "fulfilled").length

    // WhatsApp automático a paseadores con teléfono
    const waResults = await Promise.allSettled(
      (profiles ?? [])
        .filter((p) => p.phone)
        .map((p) =>
          sendWhatsAppTemplate("paseo_disponible", p.phone!, [
            p.full_name ?? "",
            reservation.zone ?? "",
            scheduledLabel,
          ]),
        ),
    )
    const waSent = waResults.filter((r) => r.status === "fulfilled").length

    return NextResponse.json({ notified: sent, total: emails.length, zone: reservation.zone, whatsapp: waSent })
  } catch (e: unknown) {
    console.error("notify-paseadores error:", e)
    const msg = e instanceof Error ? e.message : "Error desconocido"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

function buildEmailHtml(params: {
  name: string | null
  zone: string
  dogName: string
  dogSize: string
  scheduledLabel: string
  ganancia: number
  walks: number
  status: string
}) {
  const { name, zone, dogName, dogSize, scheduledLabel, ganancia } = params
  return `
<!DOCTYPE html>
<html>
  <head><meta charset="utf-8" /><title>Nuevo paseo disponible</title></head>
  <body style="margin:0;background:#f6fbfb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#0d3333;">
    <div style="max-width:560px;margin:0 auto;padding:32px 20px;">
      <div style="background:#fff;border-radius:28px;border:1px solid #d5ebe8;overflow:hidden;">
        <div style="background:#3DCABD;padding:24px;text-align:center;color:#fff;">
          <p style="margin:0;font-size:14px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;">${BRAND.name}</p>
          <h1 style="margin:8px 0 0;font-size:24px;font-weight:800;">🐶 Tienes un paseo disponible</h1>
        </div>
        <div style="padding:28px 24px;">
          <p style="margin:0 0 16px;font-size:16px;line-height:1.5;">
            Hola${name ? ` ${name}` : ""}, hay un nuevo paseo en tu zona esperando que lo tomes.
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
            <a href="${process.env.NEXT_PUBLIC_SITE_URL ?? "https://v0-perrones-landing-page.vercel.app"}/panel"
               style="display:inline-block;background:#3DCABD;color:#fff;text-decoration:none;padding:14px 28px;border-radius:999px;font-weight:800;font-size:15px;">
              Ver el paseo →
            </a>
          </div>
        </div>
        <div style="background:#f0fafa;padding:16px;text-align:center;font-size:12px;color:#5a8080;">
          Este correo se te envió porque eres paseador registrado en ${zone}. Si no esperabas este mensaje, ignóralo.
        </div>
      </div>
    </div>
  </body>
</html>
  `.trim()
}

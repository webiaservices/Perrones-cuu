import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { BRAND } from "@/lib/constants"
import { EMAIL_LOGO_IMG } from "@/lib/email-brand"
import { getCaller } from "@/lib/api-auth"

/**
 * Notifica al paseador asignado cuando el dueño cancela una reserva confirmada.
 */
export async function POST(req: NextRequest) {
  const RESEND_API_KEY = process.env.RESEND_API_KEY
  const RESEND_FROM = process.env.RESEND_FROM ?? "Perrones Cuu <onboarding@resend.dev>"

  try {
    const { reservationId, kind, walkerId } = await req.json()
    if (!reservationId) return NextResponse.json({ error: "reservationId requerido" }, { status: 400 })
    // kind "reasignado": el admin le quitó el paseo al paseador (no es que el
    // dueño lo haya cancelado). Se avisa igual, pero con otro texto. Como el
    // walker_id ya se limpió en la base, viene en walkerId.
    const reasignado = kind === "reasignado"

    // Auth PRIMERO (antes de tocar la base)
    const caller = await getCaller()
    if (!caller) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

    const admin = createAdminClient()
    const { data: r } = await admin
      .from("reservations")
      .select("id, user_id, walker_id, dog_name, scheduled_at, zone, status, package_id, package_total")
      .eq("id", reservationId)
      .single()

    if (!r) return NextResponse.json({ skipped: true })

    // Solo el dueño de la reserva o un admin pueden disparar este correo
    if (!caller.isAdmin && r.user_id !== caller.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 })
    }

    // A quién le avisamos: normalmente el paseador de la reserva; en una
    // reasignación ya se limpió, así que usamos el que manda el admin.
    const destinatarioId = r.walker_id ?? (reasignado ? walkerId : null)
    if (!destinatarioId) return NextResponse.json({ skipped: true, reason: "sin paseador" })

    // Cuántos paseos del paquete se cancelaron (para el texto del correo).
    // Ojo: en un paquete la fila que dispara esto es el paseo 1, que puede
    // seguir "completada" mientras los días 2..N sí quedaron cancelados —
    // por eso NO basta con mirar r.status; contamos las filas canceladas.
    let cancelledCount = r.status === "cancelada" ? 1 : 0
    let packageTotal = r.package_total ?? 1
    if (r.package_id) {
      const { data: pkg } = await admin
        .from("reservations")
        .select("status")
        .eq("package_id", r.package_id)
      cancelledCount = (pkg ?? []).filter((x) => x.status === "cancelada").length
      packageTotal = (pkg ?? []).length || packageTotal
    }

    // Solo mandar si de verdad hay algo cancelado (evita correos falsos).
    // En una reasignación el paseo NO se cancela, así que no aplica.
    if (!reasignado && cancelledCount === 0) {
      return NextResponse.json({ skipped: true, reason: "no hay paseos cancelados" })
    }
    // Reasignar es cosa del admin
    if (reasignado && !caller.isAdmin) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 })
    }
    const partial = r.package_id && cancelledCount < packageTotal

    const { data: u } = await admin.auth.admin.getUserById(destinatarioId)
    const email = u?.user?.email
    if (!email) return NextResponse.json({ skipped: true, reason: "sin email" })

    if (!RESEND_API_KEY) return NextResponse.json({ skipped: true, reason: "sin Resend" })

    const when = r.scheduled_at ? new Date(r.scheduled_at).toLocaleString("es-MX", { timeZone: "America/Chihuahua" }) : "—"
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: RESEND_FROM,
        to: [email],
        subject: reasignado
          ? `ℹ️ Ya no tienes asignado el paseo de ${r.dog_name ?? "un perrito"} (${r.zone ?? ""})`
          : `❌ Paseo cancelado — ${r.dog_name ?? "Perrito"} (${r.zone ?? ""})`,
        html: `
<!DOCTYPE html>
<html><body style="margin:0;background:#f6fbfb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#0d3333;">
  <div style="max-width:560px;margin:0 auto;padding:32px 20px;">
    <div style="background:#fff;border-radius:28px;border:1px solid #d5ebe8;overflow:hidden;">
      <div style="background:#e76f51;padding:24px;text-align:center;color:#fff;">
        ${EMAIL_LOGO_IMG}
        <p style="margin:0;font-size:14px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;">${BRAND.name}</p>
        <h1 style="margin:8px 0 0;font-size:24px;font-weight:800;">${reasignado ? "ℹ️ Ya no tienes este paseo" : "❌ El dueño canceló el paseo"}</h1>
      </div>
      <div style="padding:28px 24px;">
        ${
          reasignado
            ? `<p style="margin:0 0 16px;font-size:16px;">El paseo de <b>${r.dog_name ?? "el perrito"}</b> de <b>${r.zone ?? ""}</b> del <b>${when}</b> ya no está asignado a ti — el admin lo liberó para reasignarlo.</p>
               <p style="margin:0 0 16px;font-size:15px;">Esa hora queda libre en tu agenda. Si crees que fue un error, escríbele al admin por WhatsApp.</p>`
            : `<p style="margin:0 0 16px;font-size:16px;">El paseo de <b>${r.dog_name ?? "el perrito"}</b> de <b>${r.zone ?? ""}</b> fue cancelado por el dueño.</p>
               ${
                 r.package_id && cancelledCount > 1
                   ? `<p style="margin:0 0 16px;font-size:15px;font-weight:700;">⚠️ Se cancelaron <b>${cancelledCount}${partial ? ` de los ${packageTotal}` : ""} paseos del paquete</b>${partial ? " (los que faltaban)" : ""}. Revisa tu agenda: esas fechas quedan libres.</p>`
                   : `<p style="margin:0 0 16px;font-size:15px;">Era el paseo del <b>${when}</b>. Esa hora queda libre en tu agenda.</p>`
               }
               <p style="margin:0 0 16px;font-size:15px;">No tienes que hacer nada.</p>`
        }
      </div>
    </div>
  </div>
</body></html>
        `.trim(),
      }),
    })

    return NextResponse.json({ ok: true })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error" }, { status: 500 })
  }
}

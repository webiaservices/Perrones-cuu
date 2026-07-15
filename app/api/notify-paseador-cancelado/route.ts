import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { BRAND } from "@/lib/constants"
import { getCaller } from "@/lib/api-auth"

/**
 * Notifica al paseador asignado cuando el dueño cancela una reserva confirmada.
 */
export async function POST(req: NextRequest) {
  const RESEND_API_KEY = process.env.RESEND_API_KEY
  const RESEND_FROM = process.env.RESEND_FROM ?? "Perrones Cuu <onboarding@resend.dev>"

  try {
    const { reservationId } = await req.json()
    if (!reservationId) return NextResponse.json({ error: "reservationId requerido" }, { status: 400 })

    // Auth PRIMERO (antes de tocar la base)
    const caller = await getCaller()
    if (!caller) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

    const admin = createAdminClient()
    const { data: r } = await admin
      .from("reservations")
      .select("id, user_id, walker_id, dog_name, scheduled_at, zone, status, package_id, package_total")
      .eq("id", reservationId)
      .single()

    if (!r || !r.walker_id) return NextResponse.json({ skipped: true })

    // Solo el dueño de la reserva o un admin pueden disparar este correo
    if (!caller.isAdmin && r.user_id !== caller.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 })
    }

    // Solo mandar si la reserva realmente está cancelada — evita que alguien
    // dispare correos falsos de cancelación con un reservationId válido
    if (r.status !== "cancelada") {
      return NextResponse.json({ skipped: true, reason: "la reserva no está cancelada" })
    }

    const { data: u } = await admin.auth.admin.getUserById(r.walker_id)
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
        subject: `❌ Paseo cancelado — ${r.dog_name ?? "Perrito"} (${r.zone ?? ""})`,
        html: `
<!DOCTYPE html>
<html><body style="margin:0;background:#f6fbfb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#0d3333;">
  <div style="max-width:560px;margin:0 auto;padding:32px 20px;">
    <div style="background:#fff;border-radius:28px;border:1px solid #d5ebe8;overflow:hidden;">
      <div style="background:#e76f51;padding:24px;text-align:center;color:#fff;">
        <p style="margin:0;font-size:14px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;">${BRAND.name}</p>
        <h1 style="margin:8px 0 0;font-size:24px;font-weight:800;">❌ El dueño canceló el paseo</h1>
      </div>
      <div style="padding:28px 24px;">
        <p style="margin:0 0 16px;font-size:16px;">El paseo de <b>${r.dog_name ?? "el perrito"}</b> del <b>${when}</b> en <b>${r.zone ?? ""}</b> fue cancelado por el dueño.</p>
        ${r.package_id && (r.package_total ?? 1) > 1 ? `<p style="margin:0 0 16px;font-size:15px;font-weight:700;">⚠️ Se canceló el PAQUETE COMPLETO: los ${r.package_total} paseos, no solo esta fecha.</p>` : ""}
        <p style="margin:0 0 16px;font-size:15px;">No tienes que hacer nada. ${r.package_id && (r.package_total ?? 1) > 1 ? "Esas horas quedan libres" : "Esta hora queda libre"} en tu agenda.</p>
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

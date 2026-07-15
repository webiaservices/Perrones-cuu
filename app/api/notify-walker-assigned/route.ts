import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { BRAND, walkerPayoutFor } from "@/lib/constants"
import { sendWhatsAppTemplate } from "@/lib/whatsapp"
import { getCaller } from "@/lib/api-auth"

/**
 * Notifica a un paseador específico cuando el admin lo asigna directamente a un paseo.
 */
export async function POST(req: NextRequest) {
  const RESEND_API_KEY = process.env.RESEND_API_KEY
  const RESEND_FROM = process.env.RESEND_FROM ?? "Perrones Cuu <onboarding@resend.dev>"
  const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://v0-perrones-landing-page.vercel.app"

  try {
    const { reservationId } = await req.json()
    if (!reservationId) return NextResponse.json({ error: "reservationId requerido" }, { status: 400 })

    // Solo el admin asigna paseadores manualmente — auth PRIMERO
    const caller = await getCaller()
    if (!caller?.isAdmin) return NextResponse.json({ error: "No autorizado" }, { status: 403 })

    const admin = createAdminClient()
    const { data: r } = await admin
      .from("reservations")
      .select("id, walker_id, dog_name, dog_size, scheduled_at, zone, price_mxn, pickup_address, package_id, package_total, admin_fee_mxn")
      .eq("id", reservationId)
      .single()

    if (!r || !r.walker_id) return NextResponse.json({ skipped: true })

    const { data: u } = await admin.auth.admin.getUserById(r.walker_id)
    const email = u?.user?.email
    const { data: walkerProfile } = await admin
      .from("profiles")
      .select("full_name, phone")
      .eq("id", r.walker_id)
      .single()
    if (!email) return NextResponse.json({ skipped: true, reason: "sin email" })
    if (!RESEND_API_KEY) return NextResponse.json({ skipped: true, reason: "sin Resend" })

    const when = r.scheduled_at
      ? new Date(r.scheduled_at).toLocaleString("es-MX", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: "America/Chihuahua" })
      : "Por confirmar"
    // Misma fórmula que los paneles: precio − comisión admin (30% default o fee en pesos)
    const ganancia = walkerPayoutFor(Number(r.price_mxn), r.admin_fee_mxn, r.package_total ?? 1)

    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: RESEND_FROM,
        to: [email],
        subject: `🐶 Te asignaron un paseo en ${r.zone ?? ""}`,
        html: `
<!DOCTYPE html>
<html><body style="margin:0;background:#f6fbfb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#0d3333;">
  <div style="max-width:560px;margin:0 auto;padding:32px 20px;">
    <div style="background:#fff;border-radius:28px;border:1px solid #d5ebe8;overflow:hidden;">
      <div style="background:#3DCABD;padding:24px;text-align:center;color:#fff;">
        <p style="margin:0;font-size:14px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;">${BRAND.name}</p>
        <h1 style="margin:8px 0 0;font-size:24px;font-weight:800;">🐶 El admin te asignó un paseo</h1>
      </div>
      <div style="padding:28px 24px;">
        <p style="margin:0 0 16px;font-size:16px;">¡Tienes un paseo nuevo confirmado! No necesitas aceptar nada, ya es tuyo.</p>
        <div style="background:#f0fafa;border-radius:16px;padding:16px 18px;margin-bottom:20px;">
          <p style="margin:4px 0;font-size:15px;"><b>Perro:</b> ${r.dog_name ?? "—"}${r.dog_size ? ` · ${r.dog_size}` : ""}</p>
          <p style="margin:4px 0;font-size:15px;"><b>Zona:</b> ${r.zone ?? "—"}</p>
          <p style="margin:4px 0;font-size:15px;"><b>Cuándo:</b> ${when}</p>
          <p style="margin:4px 0;font-size:15px;"><b>Recoger en:</b> ${r.pickup_address ?? "—"}</p>
          <p style="margin:4px 0;font-size:15px;"><b>Tu ganancia:</b> MX$${ganancia}</p>
        </div>
        <div style="text-align:center;">
          <a href="${SITE}/panel" style="display:inline-block;background:#3DCABD;color:#fff;text-decoration:none;padding:14px 28px;border-radius:999px;font-weight:800;font-size:15px;">Ver en mi panel →</a>
        </div>
      </div>
    </div>
  </div>
</body></html>
        `.trim(),
      }),
    })

    // WhatsApp al paseador
    let wa: unknown = { skipped: true }
    if (walkerProfile?.phone) {
      wa = await sendWhatsAppTemplate("paseo_disponible", walkerProfile.phone, [
        walkerProfile.full_name ?? "",
        r.zone ?? "",
        when,
      ])
    }

    return NextResponse.json({ ok: true, whatsapp: wa })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error" }, { status: 500 })
  }
}

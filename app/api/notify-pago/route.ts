import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { BRAND, PAYMENT_ACCOUNT } from "@/lib/constants"
import { sendWhatsAppTemplate } from "@/lib/whatsapp"

/**
 * Manda recordatorio de pago al dueño cuando un paseo se marca como completado.
 */
export async function POST(req: NextRequest) {
  const RESEND_API_KEY = process.env.RESEND_API_KEY
  const RESEND_FROM = process.env.RESEND_FROM ?? "Perrones Cuu <onboarding@resend.dev>"

  try {
    const { reservationId } = await req.json()
    if (!reservationId) return NextResponse.json({ error: "reservationId requerido" }, { status: 400 })

    const admin = createAdminClient()
    const { data: r } = await admin
      .from("reservations")
      .select("id, user_id, dog_name, price_mxn, plan_name, payment_status, payment_reminded_at")
      .eq("id", reservationId)
      .single()

    if (!r) return NextResponse.json({ error: "Reserva no encontrada" }, { status: 404 })
    if (r.payment_status === "pagado") return NextResponse.json({ skipped: true, reason: "ya pagado" })
    if (r.payment_reminded_at) return NextResponse.json({ skipped: true, reason: "ya se le recordó" })

    const { data: u } = await admin.auth.admin.getUserById(r.user_id)
    const email = u?.user?.email
    if (!email) return NextResponse.json({ skipped: true, reason: "sin email" })

    const { data: profile } = await admin
      .from("profiles")
      .select("full_name, phone")
      .eq("id", r.user_id)
      .single()

    if (!RESEND_API_KEY) return NextResponse.json({ skipped: true, reason: "sin Resend" })

    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: RESEND_FROM,
        to: [email],
        subject: `💳 Realiza tu pago — Paseo de ${r.dog_name ?? "tu perrito"}`,
        html: `
<!DOCTYPE html>
<html><body style="margin:0;background:#f6fbfb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#0d3333;">
  <div style="max-width:560px;margin:0 auto;padding:32px 20px;">
    <div style="background:#fff;border-radius:28px;border:1px solid #d5ebe8;overflow:hidden;">
      <div style="background:#3DCABD;padding:24px;text-align:center;color:#fff;">
        <p style="margin:0;font-size:14px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;">${BRAND.name}</p>
        <h1 style="margin:8px 0 0;font-size:24px;font-weight:800;">✅ Paseo completado</h1>
      </div>
      <div style="padding:28px 24px;">
        <p style="margin:0 0 16px;font-size:16px;line-height:1.5;">
          ¡Esperamos que <b>${r.dog_name ?? "tu perrito"}</b> haya disfrutado su paseo!
          Te recordamos que el pago es <u>al final del servicio por transferencia</u>.
        </p>
        <div style="background:#f0fafa;border-radius:16px;padding:16px 18px;margin-bottom:20px;">
          <p style="margin:0 0 6px;font-size:12px;font-weight:700;color:#5a8080;text-transform:uppercase;letter-spacing:0.04em;">Total a transferir</p>
          <p style="margin:4px 0 12px;font-size:28px;font-weight:800;">MX$${Number(r.price_mxn).toLocaleString()}</p>
          <p style="margin:4px 0;font-size:15px;"><b>Banco:</b> ${PAYMENT_ACCOUNT.bank}</p>
          <p style="margin:4px 0;font-size:15px;"><b>Beneficiario:</b> ${PAYMENT_ACCOUNT.holder}</p>
          <p style="margin:4px 0;font-size:15px;"><b>CLABE:</b> ${PAYMENT_ACCOUNT.clabe}</p>
          <p style="margin:4px 0;font-size:15px;"><b>Cuenta:</b> ${PAYMENT_ACCOUNT.account}</p>
          <p style="margin:4px 0;font-size:13px;color:#5a8080;"><b>Concepto:</b> Paseo ${r.id.slice(0,8)}</p>
        </div>
        <p style="margin:0 0 16px;font-size:14px;color:#5a8080;">
          Una vez realizado el pago, envíanos el comprobante por WhatsApp al +52 614 594 8513.
        </p>
      </div>
      <div style="background:#f0fafa;padding:16px;text-align:center;font-size:12px;color:#5a8080;">
        ¿Dudas? Escríbenos por WhatsApp al +52 614 594 8513.
      </div>
    </div>
  </div>
</body></html>
        `.trim(),
      }),
    })

    // WhatsApp: recordatorio de pago
    let wa: unknown = { skipped: true }
    if (profile?.phone) {
      wa = await sendWhatsAppTemplate("recordatorio_pago", profile.phone, [
        profile.full_name ?? "",
        r.dog_name ?? "tu perrito",
        String(r.price_mxn),
      ])
    }

    // Marcar como recordatorio enviado
    await admin.from("reservations").update({ payment_reminded_at: new Date().toISOString() }).eq("id", reservationId)

    return NextResponse.json({ ok: true, whatsapp: wa })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error" }, { status: 500 })
  }
}

import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { BRAND, PAYMENT_ACCOUNT } from "@/lib/constants"
import { EMAIL_LOGO_IMG } from "@/lib/email-brand"
import { enviarWhatsApp } from "@/lib/wa-envios"
import { getCaller } from "@/lib/api-auth"

/**
 * Manda recordatorio de pago al dueño cuando un paseo se marca como completado.
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
      .select("id, user_id, walker_id, status, dog_name, price_mxn, plan_name, payment_status, payment_reminded_at, manual_client_name, package_id, package_index, package_total")
      .eq("id", reservationId)
      .single()

    if (!r) return NextResponse.json({ error: "Reserva no encontrada" }, { status: 404 })

    // Paquetes: el precio total vive en el paseo 1. Los días 2..N traen $0,
    // así que el cobro se hace UNA sola vez con el precio del paseo 1 (si no,
    // el cliente recibiría "transfiere MX$0" al completar cada día).
    if (r.package_id) {
      const { data: first } = await admin
        .from("reservations")
        .select("id, price_mxn, payment_status, payment_reminded_at")
        .eq("package_id", r.package_id)
        .eq("package_index", 1)
        .single()
      if (first && first.id !== r.id) {
        // Redirige el cobro al paseo 1 (el que carga el precio)
        r.id = first.id
        r.price_mxn = first.price_mxn
        r.payment_status = first.payment_status
        r.payment_reminded_at = first.payment_reminded_at
      }
    }
    // Si aun así el precio es 0, no tiene sentido pedir transferencia
    if (Number(r.price_mxn) <= 0) {
      return NextResponse.json({ skipped: true, reason: "sin monto a cobrar" })
    }

    // Solo el paseador asignado o un admin, y solo si el paseo YA se completó.
    // Antes cualquiera podía mandar el cobro anticipado y quemar el recordatorio real.
    if (!caller.isAdmin && r.walker_id !== caller.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 })
    }
    if (r.status !== "completada") {
      return NextResponse.json({ skipped: true, reason: "el paseo no está completado" })
    }
    // Clientes manuales (sin cuenta): el user_id es el del admin — no tiene
    // sentido mandarle el cobro al propio admin; ese cobro se hace en persona
    if (r.manual_client_name) {
      return NextResponse.json({ skipped: true, reason: "cliente manual: cobra en persona/WhatsApp" })
    }
    if (r.payment_status === "pagado") return NextResponse.json({ skipped: true, reason: "ya pagado" })
    if (r.payment_reminded_at) return NextResponse.json({ skipped: true, reason: "ya se le recordó" })

    // Paquetes: el cobro va al terminar el ÚLTIMO paseo, no el primero. Antes
    // salía al completar el día 1 con el texto "hoy se realiza el último paseo
    // de su semana", y los días 3 y 7 de pago_vencido se contaban desde ahí:
    // al cliente de una semana le llegaba "pago pendiente" a media semana.
    // Regla: sale cuando se completa el ÚLTIMO día del paquete (por fecha),
    // aunque a algún día anterior se le haya olvidado la marca. Si se exigiera
    // que TODOS estén completados, un día sin marcar dejaba al cliente sin
    // ningún cobro, nunca.
    if (r.package_id) {
      const { data: ultimo } = await admin
        .from("reservations")
        .select("id")
        .eq("package_id", r.package_id)
        .neq("status", "cancelada")
        .order("scheduled_at", { ascending: false })
        .limit(1)
      if (ultimo?.[0] && ultimo[0].id !== reservationId) {
        return NextResponse.json({ skipped: true, reason: "el cobro sale al terminar el último paseo del paquete" })
      }
    }

    // Candado ANTES de mandar: se marca solo si nadie lo marcó ya. Dos
    // llamadas al mismo tiempo (paseador y admin marcando completado) mandaban
    // dos cobros; ahora solo la que gana el candado sigue.
    const { data: marcado } = await admin
      .from("reservations")
      .update({ payment_reminded_at: new Date().toISOString() })
      .eq("id", r.id)
      .is("payment_reminded_at", null)
      .select("id")
    if (!marcado || marcado.length === 0) {
      return NextResponse.json({ skipped: true, reason: "ya se le recordó" })
    }

    const { data: u } = await admin.auth.admin.getUserById(r.user_id)
    const email = u?.user?.email

    const { data: profile } = await admin
      .from("profiles")
      .select("full_name, phone")
      .eq("id", r.user_id)
      .single()

    // El correo ya no condiciona al WhatsApp (antes, sin correo, no salía nada)
    if (email && RESEND_API_KEY) await fetch("https://api.resend.com/emails", {
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
        ${EMAIL_LOGO_IMG}
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
      // recordatorio_pago: {{1}} monto y nada más. El texto nuevo de Endy ya
      // explica lo de las reposiciones, así que no lleva nombre ni perro.
      wa = await enviarWhatsApp(admin, {
        plantilla: "recordatorio_pago",
        telefono: profile.phone,
        variables: [`MX$${Number(r.price_mxn).toLocaleString("es-MX")}`],
        clave: `recordatorio_pago|${r.package_id ?? r.id}`,
        motivo: "cobro al terminar",
        profileId: r.user_id,
        reservationId: r.id,
      })
    }

    return NextResponse.json({ ok: true, whatsapp: wa })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error" }, { status: 500 })
  }
}

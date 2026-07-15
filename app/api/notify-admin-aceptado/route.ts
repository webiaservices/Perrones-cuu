import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { BRAND, walkerPayoutFor } from "@/lib/constants"
import { getCaller } from "@/lib/api-auth"

/**
 * Notifica al admin cuando un paseador acepta un paseo público.
 * Le manda toda la info del paseador (nombre, telefono, fecha nacimiento, banco)
 * para que el admin pueda contactarlo y dar seguimiento.
 */
export async function POST(req: NextRequest) {
  const RESEND_API_KEY = process.env.RESEND_API_KEY
  const RESEND_FROM = process.env.RESEND_FROM ?? "Perrones Cuu <onboarding@resend.dev>"
  const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://perronescuu.com"

  try {
    const { reservationId } = await req.json()
    if (!reservationId) return NextResponse.json({ error: "reservationId requerido" }, { status: 400 })

    // Auth PRIMERO (antes de tocar la base)
    const caller = await getCaller()
    if (!caller) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

    const admin = createAdminClient()

    // Buscar la reserva con info del paseo
    const { data: r } = await admin
      .from("reservations")
      .select("id, walker_id, user_id, dog_name, dog_size, scheduled_at, zone, pickup_address, price_mxn, plan_name, manual_client_name, manual_client_phone, package_id, package_total, admin_fee_mxn")
      .eq("id", reservationId)
      .single()

    if (!r || !r.walker_id) return NextResponse.json({ skipped: true, reason: "sin walker" })

    // Solo el paseador que aceptó (o un admin) puede disparar este correo
    if (!caller.isAdmin && r.walker_id !== caller.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 })
    }

    // Buscar info del paseador
    const { data: walker } = await admin
      .from("profiles")
      .select("full_name, phone, zone, birth_date, bank_name, bank_account, bank_clabe")
      .eq("id", r.walker_id)
      .single()

    // Buscar email del paseador
    const { data: walkerUser } = await admin.auth.admin.getUserById(r.walker_id)
    const walkerEmail = walkerUser?.user?.email ?? "—"

    // Buscar info del cliente (dueño registrado o manual)
    let clienteInfo = ""
    if (r.manual_client_name) {
      clienteInfo = `${r.manual_client_name}${r.manual_client_phone ? ` · ${r.manual_client_phone}` : ""} (cliente manual)`
    } else {
      const { data: owner } = await admin
        .from("profiles")
        .select("full_name, phone")
        .eq("id", r.user_id)
        .single()
      clienteInfo = `${owner?.full_name ?? "Sin nombre"}${owner?.phone ? ` · ${owner.phone}` : ""}`
    }

    // Buscar emails de todos los admins
    const { data: admins } = await admin
      .from("profiles")
      .select("id")
      .eq("role", "admin")
    if (!admins || admins.length === 0) return NextResponse.json({ skipped: true, reason: "sin admins" })

    const adminEmails: string[] = []
    for (const a of admins) {
      const { data: u } = await admin.auth.admin.getUserById(a.id)
      if (u?.user?.email) adminEmails.push(u.user.email)
    }

    if (adminEmails.length === 0) return NextResponse.json({ skipped: true, reason: "admins sin email" })
    if (!RESEND_API_KEY) return NextResponse.json({ skipped: true, reason: "sin Resend" })

    const when = r.scheduled_at
      ? new Date(r.scheduled_at).toLocaleString("es-MX", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: "America/Chihuahua" })
      : "Por confirmar"
    // Misma fórmula que los paneles: precio − comisión admin (30% default o fee en pesos)
    const ganancia = walkerPayoutFor(Number(r.price_mxn), r.admin_fee_mxn, r.package_total ?? 1)
    const edad = walker?.birth_date
      ? Math.floor((Date.now() - new Date(walker.birth_date).getTime()) / (365.25 * 24 * 60 * 60 * 1000))
      : null

    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: RESEND_FROM,
        to: adminEmails,
        subject: `Un paseador acepto un paseo: ${walker?.full_name ?? "Paseador"} - ${r.dog_name ?? "Perro"}`,
        html: `
<!DOCTYPE html>
<html><body style="margin:0;background:#f6fbfb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#0d3333;">
  <div style="max-width:600px;margin:0 auto;padding:32px 20px;">
    <div style="background:#fff;border-radius:28px;border:1px solid #d5ebe8;overflow:hidden;">
      <div style="background:#3DCABD;padding:24px;text-align:center;color:#fff;">
        <p style="margin:0;font-size:14px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;">${BRAND.name}</p>
        <h1 style="margin:8px 0 0;font-size:22px;font-weight:800;">Un paseador acepto un paseo</h1>
      </div>
      <div style="padding:28px 24px;">
        <p style="margin:0 0 18px;font-size:15px;">
          ${walker?.full_name ?? "Un paseador"} acaba de aceptar un paseo. Aqui esta toda la info para que puedas darle seguimiento:
        </p>

        <h2 style="margin:0 0 10px;font-size:15px;color:#19756b;border-bottom:1px solid #d5ebe8;padding-bottom:6px;">Paseador que acepto</h2>
        <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:24px;">
          <tr><td style="padding:6px 0;font-weight:700;width:40%;">Nombre</td><td>${walker?.full_name ?? "—"}</td></tr>
          <tr><td style="padding:6px 0;font-weight:700;">Telefono</td><td>${walker?.phone ?? "—"}</td></tr>
          <tr><td style="padding:6px 0;font-weight:700;">Email</td><td>${walkerEmail}</td></tr>
          <tr><td style="padding:6px 0;font-weight:700;">Zona</td><td>${walker?.zone ?? "—"}</td></tr>
          <tr><td style="padding:6px 0;font-weight:700;">Fecha de nacimiento</td><td>${walker?.birth_date ? new Date(walker.birth_date).toLocaleDateString("es-MX") : "—"}${edad !== null ? ` (${edad} años)` : ""}</td></tr>
          <tr><td style="padding:6px 0;font-weight:700;">Banco</td><td>${walker?.bank_name ?? "—"}</td></tr>
          <tr><td style="padding:6px 0;font-weight:700;">Cuenta</td><td>${walker?.bank_account ?? "—"}</td></tr>
          <tr><td style="padding:6px 0;font-weight:700;">CLABE</td><td>${walker?.bank_clabe ?? "—"}</td></tr>
        </table>

        <h2 style="margin:0 0 10px;font-size:15px;color:#19756b;border-bottom:1px solid #d5ebe8;padding-bottom:6px;">Paseo</h2>
        <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:24px;">
          <tr><td style="padding:6px 0;font-weight:700;width:40%;">Cliente</td><td>${clienteInfo}</td></tr>
          <tr><td style="padding:6px 0;font-weight:700;">Perro</td><td>${r.dog_name ?? "—"}${r.dog_size ? ` · ${r.dog_size}` : ""}</td></tr>
          <tr><td style="padding:6px 0;font-weight:700;">Plan</td><td>${r.plan_name ?? "—"}${r.package_total ? ` (paquete de ${r.package_total} paseos)` : ""}</td></tr>
          <tr><td style="padding:6px 0;font-weight:700;">Cuando</td><td>${when}</td></tr>
          <tr><td style="padding:6px 0;font-weight:700;">Zona</td><td>${r.zone ?? "—"}</td></tr>
          <tr><td style="padding:6px 0;font-weight:700;">Direccion</td><td>${r.pickup_address ?? "—"}</td></tr>
          <tr><td style="padding:6px 0;font-weight:700;">Precio</td><td>MX$${r.price_mxn}</td></tr>
          <tr><td style="padding:6px 0;font-weight:700;">Ganancia paseador</td><td>MX$${ganancia}</td></tr>
        </table>

        <div style="text-align:center;">
          <a href="${SITE}/panel" style="display:inline-block;background:#3DCABD;color:#fff;text-decoration:none;padding:14px 28px;border-radius:999px;font-weight:800;font-size:15px;">Ver en el panel admin</a>
        </div>
      </div>
    </div>
  </div>
</body></html>
        `.trim(),
      }),
    })

    // No devolver adminEmails: la ruta es llamable sin auth y filtraría correos del admin
    return NextResponse.json({ ok: true, notified: adminEmails.length })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error" }, { status: 500 })
  }
}

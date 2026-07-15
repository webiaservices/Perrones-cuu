import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { BRAND } from "@/lib/constants"
import { getCaller } from "@/lib/api-auth"

/**
 * Notifica al admin por correo cuando un dueño crea un paseo nuevo.
 * Le manda toda la info del cliente y el paseo para que pueda contactar.
 */
export async function POST(req: NextRequest) {
  const RESEND_API_KEY = process.env.RESEND_API_KEY
  const RESEND_FROM = process.env.RESEND_FROM ?? "Perrones Cuu <onboarding@resend.dev>"
  const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://perronescuu.com"

  try {
    const { reservationId, kind } = await req.json()
    if (!reservationId) return NextResponse.json({ error: "reservationId requerido" }, { status: 400 })
    // kind "paseador_solto": un paseador soltó un paseo que ya había aceptado
    const solto = kind === "paseador_solto"

    const admin = createAdminClient()

    const { data: r } = await admin
      .from("reservations")
      .select("id, user_id, dog_name, dog_size, dogs_count, scheduled_at, scheduled_until, zone, pickup_address, price_mxn, plan_name, notes, package_id, package_total, status, walker_id")
      .eq("id", reservationId)
      .single()

    if (!r) return NextResponse.json({ skipped: true, reason: "reserva no encontrada" })

    // Dueño de la reserva, cualquier paseador (que soltó un paseo) o admin
    const caller = await getCaller()
    if (!caller) return NextResponse.json({ error: "No autorizado" }, { status: 401 })
    if (!caller.isAdmin && r.user_id !== caller.id && caller.role !== "paseador") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 })
    }
    // Para "paseador soltó": verifica que de verdad quedó libre — evita que un
    // paseador dispare falsas alertas de "se soltó" sobre paseos ajenos/activos
    if (solto && (r.status !== "buscando_paseador" || r.walker_id)) {
      return NextResponse.json({ skipped: true, reason: "el paseo no está libre" })
    }

    // Info del cliente
    const { data: owner } = await admin
      .from("profiles")
      .select("full_name, phone")
      .eq("id", r.user_id)
      .single()
    const { data: ownerUser } = await admin.auth.admin.getUserById(r.user_id)
    const ownerEmail = ownerUser?.user?.email ?? "—"

    // Emails de todos los admins
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

    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: RESEND_FROM,
        to: adminEmails,
        subject: solto
          ? `⚠️ Un paseador soltó el paseo de ${r.dog_name ?? "Perro"} (${r.zone ?? "—"}) — se reabrió la búsqueda`
          : `Nuevo paseo: ${r.dog_name ?? "Perro"} - ${owner?.full_name ?? "Cliente"} (${r.zone ?? "—"})`,
        html: `
<!DOCTYPE html>
<html><body style="margin:0;background:#f6fbfb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#0d3333;">
  <div style="max-width:600px;margin:0 auto;padding:32px 20px;">
    <div style="background:#fff;border-radius:28px;border:1px solid #d5ebe8;overflow:hidden;">
      <div style="background:#3DCABD;padding:24px;text-align:center;color:#fff;">
        <p style="margin:0;font-size:14px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;">${BRAND.name}</p>
        <h1 style="margin:8px 0 0;font-size:22px;font-weight:800;">${solto ? "⚠️ Un paseador soltó este paseo" : "Tienes un paseo nuevo"}</h1>
      </div>
      <div style="padding:28px 24px;">
        <p style="margin:0 0 18px;font-size:15px;">
          ${solto
            ? "El paseador que lo había aceptado lo soltó. El paseo volvió a quedar disponible — asigna otro paseador o contacta al cliente."
            : "Un cliente acaba de reservar. Asignale paseador desde el panel."}
        </p>

        <h2 style="margin:0 0 10px;font-size:15px;color:#19756b;border-bottom:1px solid #d5ebe8;padding-bottom:6px;">Cliente</h2>
        <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:24px;">
          <tr><td style="padding:6px 0;font-weight:700;width:40%;">Nombre</td><td>${owner?.full_name ?? "—"}</td></tr>
          <tr><td style="padding:6px 0;font-weight:700;">Telefono</td><td>${owner?.phone ?? "—"}</td></tr>
          <tr><td style="padding:6px 0;font-weight:700;">Email</td><td>${ownerEmail}</td></tr>
        </table>

        <h2 style="margin:0 0 10px;font-size:15px;color:#19756b;border-bottom:1px solid #d5ebe8;padding-bottom:6px;">Paseo</h2>
        <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:24px;">
          <tr><td style="padding:6px 0;font-weight:700;width:40%;">Plan</td><td>${r.plan_name ?? "—"}${r.package_total ? ` (paquete de ${r.package_total} dias)` : ""}</td></tr>
          <tr><td style="padding:6px 0;font-weight:700;">Perro</td><td>${r.dog_name ?? "—"}${r.dog_size ? ` · ${r.dog_size}` : ""}${r.dogs_count > 1 ? ` · ${r.dogs_count} perros` : ""}</td></tr>
          <tr><td style="padding:6px 0;font-weight:700;">Cuando</td><td>${when}</td></tr>
          <tr><td style="padding:6px 0;font-weight:700;">Zona</td><td>${r.zone ?? "—"}</td></tr>
          <tr><td style="padding:6px 0;font-weight:700;">Direccion</td><td>${r.pickup_address ?? "—"}</td></tr>
          <tr><td style="padding:6px 0;font-weight:700;">Precio</td><td>MX$${r.price_mxn}</td></tr>
          ${r.notes ? `<tr><td style="padding:6px 0;font-weight:700;">Notas</td><td>${r.notes}</td></tr>` : ""}
        </table>

        <div style="text-align:center;">
          <a href="${SITE}/panel" style="display:inline-block;background:#3DCABD;color:#fff;text-decoration:none;padding:14px 28px;border-radius:999px;font-weight:800;font-size:15px;">Ver en el panel</a>
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

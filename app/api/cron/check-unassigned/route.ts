import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { BRAND } from "@/lib/constants"

const TIMEOUT_MINUTES = 60

/**
 * Cron job: revisa reservas que llevan >1 hora en "buscando_paseador" sin asignar.
 * Las pasa a "sin_asignar" y notifica al admin por correo.
 *
 * Se ejecuta cada 15 minutos vía Vercel cron (ver vercel.json).
 * También puede llamarse manualmente (ej. desde el panel del admin).
 */
export async function GET(req: NextRequest) {
  // Protección simple: requiere el header de cron secret en producción
  const cronSecret = process.env.CRON_SECRET
  const authHeader = req.headers.get("authorization")
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const admin = createAdminClient()

  // 1. Busca reservas con timeout y márcalas sin_asignar
  const { data: expired, error } = await admin.rpc("expire_unassigned_reservations", {
    timeout_minutes: TIMEOUT_MINUTES,
  })

  if (error) {
    console.error("Cron error:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const expiredList = (expired ?? []) as { reservation_id: string; zone: string | null }[]

  if (expiredList.length === 0) {
    return NextResponse.json({ ok: true, expired: 0 })
  }

  // 2. Encuentra todos los admins
  const { data: admins } = await admin.from("profiles").select("id, full_name").eq("role", "admin")
  if (!admins || admins.length === 0) {
    return NextResponse.json({ ok: true, expired: expiredList.length, notified: 0, reason: "sin admins" })
  }

  // 3. Resuelve sus emails
  const adminEmails: { email: string; name: string | null }[] = []
  for (const a of admins) {
    const { data: u } = await admin.auth.admin.getUserById(a.id)
    if (u?.user?.email) adminEmails.push({ email: u.user.email, name: a.full_name })
  }

  // 4. Mándales un correo
  const RESEND_API_KEY = process.env.RESEND_API_KEY
  const RESEND_FROM = process.env.RESEND_FROM ?? "Perrones Cuu <onboarding@resend.dev>"
  const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://v0-perrones-landing-page.vercel.app"

  if (!RESEND_API_KEY) {
    console.warn("[cron] RESEND_API_KEY no configurada — solo marcamos sin_asignar")
    return NextResponse.json({ ok: true, expired: expiredList.length, notified: 0, skipped: true })
  }

  const zones = Array.from(new Set(expiredList.map((e) => e.zone).filter(Boolean) as string[]))

  await Promise.allSettled(
    adminEmails.map(({ email, name }) =>
      fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: RESEND_FROM,
          to: [email],
          subject: `⚠️ ${expiredList.length} paseo(s) sin paseador — Perrones`,
          html: `
<!DOCTYPE html>
<html>
  <body style="margin:0;background:#f6fbfb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#0d3333;">
    <div style="max-width:560px;margin:0 auto;padding:32px 20px;">
      <div style="background:#fff;border-radius:28px;border:1px solid #d5ebe8;overflow:hidden;">
        <div style="background:#e76f51;padding:24px;text-align:center;color:#fff;">
          <p style="margin:0;font-size:14px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;">${BRAND.name}</p>
          <h1 style="margin:8px 0 0;font-size:24px;font-weight:800;">⚠️ Paseos sin asignar</h1>
        </div>
        <div style="padding:28px 24px;">
          <p style="margin:0 0 16px;font-size:16px;line-height:1.5;">
            Hola${name ? ` ${name}` : ""}, hay <b>${expiredList.length} paseo(s)</b> que llevan más de 1 hora sin paseador.
          </p>
          ${zones.length > 0 ? `<p style="margin:0 0 16px;font-size:15px;"><b>Zonas afectadas:</b> ${zones.join(", ")}</p>` : ""}
          <p style="margin:0 0 24px;font-size:15px;line-height:1.5;">
            Entra al panel de administración para reasignar manualmente o contactar a los clientes.
          </p>
          <div style="text-align:center;">
            <a href="${SITE}/panel"
               style="display:inline-block;background:#3DCABD;color:#fff;text-decoration:none;padding:14px 28px;border-radius:999px;font-weight:800;font-size:15px;">
              Ir al panel admin →
            </a>
          </div>
        </div>
      </div>
    </div>
  </body>
</html>
          `.trim(),
        }),
      }),
    ),
  )

  return NextResponse.json({
    ok: true,
    expired: expiredList.length,
    notified: adminEmails.length,
    zones,
  })
}

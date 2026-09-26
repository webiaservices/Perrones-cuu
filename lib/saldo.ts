/**
 * Saldo de la cuenta de Twilio de Perrones y alarma para Webia.
 *
 * Todo el WhatsApp (lo de Meta y lo de Twilio) sale de ese saldo. Si llega a
 * cero, Twilio deja de mandar y el WhatsApp de Perrones se cae sin que nadie
 * se entere: el 26-sep-2026 quedaban $0.36 USD y la siguiente vacante ya no
 * habría salido. El correo va SOLO a Webia; Endy no ve nada.
 */

/** Debajo de esto se avisa: alcanza para ~1 vacante más (~$3 USD c/u). */
export const SALDO_MINIMO_USD = 5

export async function saldoTwilio(): Promise<{ monto: number; moneda: string } | null> {
  const SID = process.env.TWILIO_ACCOUNT_SID
  const TOKEN = process.env.TWILIO_AUTH_TOKEN
  if (!SID || !TOKEN) return null
  try {
    const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${SID}/Balance.json`, {
      headers: { Authorization: `Basic ${Buffer.from(`${SID}:${TOKEN}`).toString("base64")}` },
      cache: "no-store",
    })
    const d = await r.json()
    return r.ok ? { monto: Number(d.balance), moneda: String(d.currency ?? "USD") } : null
  } catch {
    return null
  }
}

/** Revisa el saldo y, si está por debajo del mínimo, le escribe a Webia. */
export async function alarmaDeSaldo(): Promise<{ saldo: number | null; correo: string | null }> {
  const s = await saldoTwilio()
  if (!s) return { saldo: null, correo: null }
  const KEY = process.env.RESEND_API_KEY
  if (s.monto >= SALDO_MINIMO_USD || !KEY) return { saldo: s.monto, correo: null }
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: process.env.RESEND_FROM ?? "Perrones Cuu <onboarding@resend.dev>",
        to: [process.env.ALERTA_SALDO_CORREO ?? "webiaservices@gmail.com"],
        subject: `⚠️ Perrones: al WhatsApp le quedan $${s.monto.toFixed(2)} ${s.moneda}`,
        html: `<p>Al saldo de Twilio de Perrones le quedan <b>$${s.monto.toFixed(2)} ${s.moneda}</b>.</p>
<p>Cada vacante publicada cuesta alrededor de $3 USD. Si llega a cero, los WhatsApp dejan de salir.</p>
<p>Recarga en Twilio → Billing → Add funds.</p>`,
      }),
    })
    const d = await r.json().catch(() => ({}))
    return { saldo: s.monto, correo: r.ok ? String(d.id ?? "enviado") : `falló: ${d.message ?? r.status}` }
  } catch (e) {
    return { saldo: s.monto, correo: `falló: ${e instanceof Error ? e.message : "red"}` }
  }
}

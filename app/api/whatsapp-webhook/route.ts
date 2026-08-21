import { NextRequest, NextResponse } from "next/server"
import crypto from "node:crypto"
import { createAdminClient } from "@/lib/supabase/admin"

/**
 * Recibe los mensajes que los clientes mandan al WhatsApp del negocio.
 *
 * Con la API de WhatsApp los mensajes entrantes NO llegan a un celular: Twilio
 * los reenvía aquí. Los guardamos para que el admin los lea y conteste desde
 * su panel.
 *
 * Esta URL se configura en Twilio → el sender de WhatsApp → "When a message
 * comes in":  https://perronescuu.com/api/whatsapp-webhook
 */

/** Valida que el request venga de verdad de Twilio y no de un curioso. */
function firmaValida(req: NextRequest, url: string, params: Record<string, string>): boolean {
  const token = process.env.TWILIO_AUTH_TOKEN
  const firma = req.headers.get("x-twilio-signature")
  // Si no hay token configurado no podemos validar; se acepta solo si tampoco
  // hay firma (entorno de pruebas). Con token, la firma es obligatoria.
  if (!token) return !firma
  if (!firma) return false

  // Twilio firma: URL + los campos del form ordenados por nombre, concatenados
  const data = Object.keys(params)
    .sort()
    .reduce((acc, k) => acc + k + params[k], url)
  const esperado = crypto.createHmac("sha1", token).update(Buffer.from(data, "utf-8")).digest("base64")
  try {
    return crypto.timingSafeEqual(Buffer.from(esperado), Buffer.from(firma))
  } catch {
    return false
  }
}

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData()
    const params: Record<string, string> = {}
    form.forEach((v, k) => { params[k] = String(v) })

    // La URL pública tal cual la conoce Twilio (por si hay proxy de por medio)
    const url = process.env.TWILIO_WEBHOOK_URL ?? new URL(req.url).href

    if (!firmaValida(req, url, params)) {
      return NextResponse.json({ error: "Firma inválida" }, { status: 403 })
    }

    const from = String(params.From ?? "").replace("whatsapp:", "").replace(/\D/g, "")
    const texto = params.Body ?? ""
    const sid = params.MessageSid ?? params.SmsMessageSid ?? null
    const nombre = params.ProfileName ?? null

    const admin = createAdminClient()

    // ---- Aviso de entrega, no un mensaje del cliente ----
    // Twilio manda aquí el resultado de cada envío. Un rebote (failed /
    // undelivered) hay que apuntarlo: el 19 de agosto salieron 42 mensajes,
    // 35 rebotaron, y al día siguiente Meta tumbó la cuenta. Si el sistema
    // sigue insistiendo con números muertos, vuelve a pasar.
    // OJO: un mensaje ENTRANTE también trae estado, pero vale "received".
    // Si no se distingue, los mensajes de los clientes se tomarían por avisos
    // de entrega y nunca llegarían a la bandeja del panel.
    const ESTADOS_DE_ENVIO = ["queued", "sending", "sent", "delivered", "read", "failed", "undelivered"]
    const estado = String(params.MessageStatus ?? params.SmsStatus ?? "").toLowerCase()
    if (estado && ESTADOS_DE_ENVIO.includes(estado)) {
      const destino = String(params.To ?? "").replace("whatsapp:", "").replace(/\D/g, "")
      if (destino) {
        if (estado === "failed" || estado === "undelivered") {
          const motivo = params.ErrorCode ? `${params.ErrorCode} ${params.ErrorMessage ?? ""}`.trim() : estado
          await admin.rpc("registrar_rebote_wa", { tel: destino, motivo }).then(
            () => {},
            // Si la migración 0023 aún no corre, no se tira el webhook por esto
            (e: unknown) => console.warn("[whatsapp-webhook] no se pudo registrar rebote:", e),
          )
        } else if (estado === "delivered" || estado === "read") {
          // Llegó: el número está sano otra vez, se le limpia el historial
          await admin.rpc("limpiar_rebotes_wa", { tel: destino }).then(
            () => {},
            () => {},
          )
        }
      }
      return new NextResponse("", { status: 200 })
    }

    if (!from) return new NextResponse("", { status: 200 })
    // onConflict por message_sid: si Twilio reintenta, no se duplica
    await admin
      .from("whatsapp_messages")
      .upsert(
        { phone: from, nombre, direccion: "entrante", texto, message_sid: sid },
        { onConflict: "message_sid", ignoreDuplicates: true },
      )

    // Twilio espera 200 con TwiML vacío (si no, reintenta)
    return new NextResponse('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
      status: 200,
      headers: { "Content-Type": "text/xml" },
    })
  } catch (e: unknown) {
    console.error("[whatsapp-webhook]", e instanceof Error ? e.message : e)
    // Devolvemos 200 igual para que Twilio no reintente en bucle
    return new NextResponse("", { status: 200 })
  }
}

import { NextRequest, NextResponse } from "next/server"
import { checkWhatsAppStatus, sendWhatsAppTemplate } from "@/lib/whatsapp"
import { getCaller } from "@/lib/api-auth"

/**
 * Estado de la conexión de WhatsApp (solo admin).
 * GET  → diagnóstico: token, número conectado y plantillas aprobadas.
 * POST → manda un mensaje de prueba al número que se indique.
 */
export async function GET() {
  const caller = await getCaller()
  if (!caller?.isAdmin) return NextResponse.json({ error: "No autorizado" }, { status: 403 })

  const status = await checkWhatsAppStatus()
  return NextResponse.json(status)
}

export async function POST(req: NextRequest) {
  const caller = await getCaller()
  if (!caller?.isAdmin) return NextResponse.json({ error: "No autorizado" }, { status: 403 })

  try {
    const { telefono } = await req.json()
    if (!telefono || String(telefono).replace(/\D/g, "").length < 10) {
      return NextResponse.json({ error: "Pon un número de 10 dígitos" }, { status: 400 })
    }

    // Usamos la plantilla de paseo disponible como prueba (es la más simple)
    const res = await sendWhatsAppTemplate("paseo_disponible", String(telefono), [
      "Prueba",
      "Centro",
      "hoy, mensaje de prueba",
    ])

    if ("ok" in res && res.ok) {
      return NextResponse.json({ ok: true, mensaje: "Mensaje de prueba enviado. Revisa el WhatsApp de ese número." })
    }
    const motivo = "error" in res ? res.error : "reason" in res ? res.reason : "Error desconocido"
    return NextResponse.json({ ok: false, mensaje: `No se pudo enviar: ${motivo}` })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error" }, { status: 500 })
  }
}

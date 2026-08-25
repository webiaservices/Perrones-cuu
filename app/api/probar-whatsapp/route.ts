import { NextRequest, NextResponse } from "next/server"
import { sendWhatsAppTemplate } from "@/lib/whatsapp"
import { PLANTILLAS } from "@/lib/whatsapp-plantillas"

/**
 * Manda UN mensaje de prueba al número que se le pase.
 *
 * Existe porque el botón de prueba del panel exige sesión de admin, y a veces
 * hay que comprobar el envío desde fuera (por ejemplo al cambiar el número
 * emisor, o para saber si Meta ya destrabó la cuenta) sin abrirle la llave a
 * los avisos automáticos.
 *
 * Se protege con la MISMA llave del cron, y como el cron ya puede disparar
 * mensajes, no amplía la superficie de riesgo.
 *
 *   curl -H "Authorization: Bearer $CRON_SECRET" \
 *        "https://perronescuu.com/api/probar-whatsapp?tel=5512345678"
 *
 * Pasa por encima de AVISOS_PAUSADOS a propósito: probar es justo lo que hay
 * que poder hacer con la pausa puesta.
 */
export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  const authHeader = req.headers.get("authorization")
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const tel = req.nextUrl.searchParams.get("tel") ?? ""
  if (tel.replace(/\D/g, "").length < 10) {
    return NextResponse.json({ error: "Falta ?tel= con 10 dígitos" }, { status: 400 })
  }

  // Por defecto la más simple; se puede pedir otra con ?plantilla=
  const nombre = req.nextUrl.searchParams.get("plantilla") ?? "paseo_disponible"
  const plantilla = PLANTILLAS.find((p) => p.nombre === nombre)
  if (!plantilla) {
    return NextResponse.json(
      { error: `No existe la plantilla "${nombre}"`, disponibles: PLANTILLAS.map((p) => p.nombre) },
      { status: 400 },
    )
  }

  // Valores de relleno acordes a lo que significa cada variable
  const ejemplos: Record<string, string[]> = {
    paseo_disponible: ["Prueba", "Centro", "MX$0 (mensaje de prueba)"],
    paseo_confirmado: ["Prueba", "hoy, mensaje de prueba"],
    paseador_asignado: ["Prueba", "hoy, mensaje de prueba"],
    recordatorio_pago: ["MX$0 (mensaje de prueba)"],
  }
  const vars = ejemplos[nombre] ?? plantilla.variables.map(() => "prueba")

  const res = await sendWhatsAppTemplate(nombre, tel, vars, "es_MX", true)
  const ok = "ok" in res && res.ok
  return NextResponse.json({
    ok,
    plantilla: nombre,
    para: tel,
    // El sid sirve para buscarlo en los logs de Twilio si no llega
    detalle: res,
  })
}

import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { getCaller } from "@/lib/api-auth"
import { sendWhatsAppText } from "@/lib/whatsapp"

/**
 * Bandeja de WhatsApp del admin.
 * GET  → conversaciones con sus mensajes (solo admin).
 * POST → responder a un número (texto libre; WhatsApp solo lo permite dentro
 *        de las 24h siguientes al último mensaje del cliente).
 */

export async function GET() {
  const caller = await getCaller()
  if (!caller?.isAdmin) return NextResponse.json({ error: "No autorizado" }, { status: 403 })

  const admin = createAdminClient()
  const { data, error } = await admin
    .from("whatsapp_messages")
    .select("id, phone, nombre, direccion, texto, created_at")
    .order("created_at", { ascending: false })
    .limit(500)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Agrupamos por número, del más reciente al más viejo
  type Msg = { id: string; phone: string; nombre: string | null; direccion: string; texto: string | null; created_at: string }
  const porNumero = new Map<string, { phone: string; nombre: string | null; mensajes: Msg[] }>()
  for (const m of (data ?? []) as Msg[]) {
    const conv = porNumero.get(m.phone) ?? { phone: m.phone, nombre: m.nombre, mensajes: [] }
    if (!conv.nombre && m.nombre) conv.nombre = m.nombre
    conv.mensajes.push(m)
    porNumero.set(m.phone, conv)
  }

  const ahora = Date.now()
  const conversaciones = [...porNumero.values()].map((c) => {
    // Los mensajes vienen del más nuevo al más viejo: los volteamos para leer
    const mensajes = [...c.mensajes].reverse()
    const ultimoEntrante = c.mensajes.find((m) => m.direccion === "entrante")
    const horasDesde = ultimoEntrante
      ? (ahora - new Date(ultimoEntrante.created_at).getTime()) / 3_600_000
      : Infinity
    return {
      phone: c.phone,
      nombre: c.nombre,
      mensajes,
      ultimo: c.mensajes[0]?.created_at ?? null,
      // WhatsApp solo deja responder texto libre dentro de 24h
      puedeResponder: horasDesde < 24,
    }
  })

  return NextResponse.json({ conversaciones })
}

export async function POST(req: NextRequest) {
  const caller = await getCaller()
  if (!caller?.isAdmin) return NextResponse.json({ error: "No autorizado" }, { status: 403 })

  try {
    const { telefono, texto } = await req.json()
    if (!telefono || !String(texto ?? "").trim()) {
      return NextResponse.json({ error: "Falta el número o el mensaje" }, { status: 400 })
    }

    const res = await sendWhatsAppText(String(telefono), String(texto).trim())
    if (!("ok" in res) || !res.ok) {
      const motivo = "error" in res ? res.error : "reason" in res ? res.reason : "Error"
      return NextResponse.json({ ok: false, mensaje: `No se pudo enviar: ${motivo}` })
    }

    // Guardamos nuestra respuesta para que quede en la conversación
    const admin = createAdminClient()
    await admin.from("whatsapp_messages").insert({
      phone: String(telefono).replace(/\D/g, ""),
      direccion: "saliente",
      texto: String(texto).trim(),
      message_sid: res.messageId || null,
      leido: true,
    })

    return NextResponse.json({ ok: true })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error" }, { status: 500 })
  }
}

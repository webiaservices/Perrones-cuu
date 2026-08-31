import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { ciudadSegura } from "@/lib/ciudades"

/**
 * Apunta a alguien en la lista de espera de paseadores.
 *
 * Cuando el registro está cerrado en una ciudad, en vez de perder a la persona
 * se le guarda el correo. Endy dijo que la lista tiene que GUARDARSE, no solo
 * mostrar el aviso — si no, cuando abra vacantes no tendría a quién avisarle.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const email = String(body.email ?? "").trim().toLowerCase()
    const ciudad = ciudadSegura(body.city)
    const nombre = String(body.nombre ?? "").trim() || null
    const telefono = String(body.telefono ?? "").trim() || null

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "Escribe un correo válido." }, { status: 400 })
    }

    const admin = createAdminClient()
    const { error } = await admin.from("lista_espera").insert({
      email,
      city: ciudad,
      nombre,
      telefono,
    })

    if (error) {
      // Si la migración 0024 aún no corre, no dejamos a la persona con un
      // error críptico: se le dice que escriba por WhatsApp.
      console.error("[lista-espera]", error.message)
      return NextResponse.json(
        { error: "No pudimos guardarte. Escríbenos por WhatsApp y te apuntamos a mano." },
        { status: 500 },
      )
    }

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: "Error inesperado" }, { status: 500 })
  }
}

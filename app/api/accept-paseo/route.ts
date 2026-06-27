import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"

/**
 * Endpoint server-side para que el paseador acepte un paseo.
 * Usa service role para bypass RLS y dar mensajes de error precisos.
 */
export async function POST(req: NextRequest) {
  try {
    const { reservationId } = await req.json()
    if (!reservationId) return NextResponse.json({ error: "reservationId requerido" }, { status: 400 })

    // Verifica que el usuario está autenticado y es paseador
    const supa = await createClient()
    const { data: { user }, error: userErr } = await supa.auth.getUser()
    if (userErr || !user) return NextResponse.json({ error: "Sesión expirada. Vuelve a iniciar sesión." }, { status: 401 })

    const admin = createAdminClient()
    const { data: profile } = await admin
      .from("profiles")
      .select("role, banned")
      .eq("id", user.id)
      .single()

    if (!profile) return NextResponse.json({ error: "No se encontró tu perfil" }, { status: 403 })
    if (profile.banned) return NextResponse.json({ error: "Tu cuenta está suspendida. Contacta al admin." }, { status: 403 })
    if (profile.role !== "paseador") {
      return NextResponse.json({ error: `Tu cuenta es de tipo "${profile.role}". Solo paseadores pueden aceptar paseos.` }, { status: 403 })
    }

    // Lee el paseo
    const { data: current } = await admin
      .from("reservations")
      .select("id, walker_id, status, visibility, package_id, dog_name")
      .eq("id", reservationId)
      .single()

    if (!current) return NextResponse.json({ error: "Este paseo ya no existe" }, { status: 404 })

    if (current.walker_id && current.walker_id !== user.id) {
      return NextResponse.json({ error: "Otro paseador ya tomó este paseo" }, { status: 409 })
    }
    if (current.walker_id === user.id) {
      return NextResponse.json({ ok: true, alreadyMine: true })
    }
    if (current.status !== "buscando_paseador") {
      return NextResponse.json({ error: `Este paseo está "${current.status}" — ya no se puede aceptar` }, { status: 409 })
    }
    // visibility ya no bloquea: si llega acá, lo agarra

    // Hace el UPDATE bypassing RLS
    let updateError = null
    if (current.package_id) {
      const { error } = await admin
        .from("reservations")
        .update({ status: "confirmada", walker_id: user.id, visibility: "public" })
        .eq("package_id", current.package_id)
        .is("walker_id", null)
      updateError = error
    } else {
      const { error } = await admin
        .from("reservations")
        .update({ status: "confirmada", walker_id: user.id, visibility: "public" })
        .eq("id", reservationId)
        .is("walker_id", null)
      updateError = error
    }

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error" }, { status: 500 })
  }
}

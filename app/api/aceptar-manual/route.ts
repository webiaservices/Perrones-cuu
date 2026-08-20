import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { getCaller } from "@/lib/api-auth"
import { MANUAL_VERSION } from "@/lib/manual-paseadores"

/**
 * Registra que un paseador leyó y aceptó el manual.
 *
 * La fecha la pone el SERVIDOR (new Date()), no el navegador: este registro
 * es el respaldo del negocio si un paseador incumple una regla, así que no
 * puede depender del reloj ni de la buena fe del cliente. El trigger
 * guard_profile_update de la migración 0021 lo refuerza del lado de la base.
 */
export async function POST() {
  try {
    const caller = await getCaller()
    if (!caller) {
      return NextResponse.json({ error: "Tu sesión expiró. Vuelve a iniciar sesión." }, { status: 401 })
    }
    if (caller.role !== "paseador") {
      return NextResponse.json({ error: "Solo los paseadores aceptan el manual." }, { status: 403 })
    }

    const admin = createAdminClient()
    const aceptadoEn = new Date().toISOString()

    const { error } = await admin
      .from("profiles")
      .update({ manual_accepted_at: aceptadoEn, manual_version: MANUAL_VERSION })
      .eq("id", caller.id)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true, aceptadoEn, version: MANUAL_VERSION })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error" }, { status: 500 })
  }
}

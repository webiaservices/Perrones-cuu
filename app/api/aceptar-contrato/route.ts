import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { getCaller } from "@/lib/api-auth"
import { documentoVigente } from "@/lib/documentos"

/**
 * Registra que alguien aceptó la versión vigente del contrato.
 *
 * Se usa cuando sube la versión y hay que pedirle a los de antes que vuelvan a
 * firmar. Igual que en el alta, se INSERTA un renglón nuevo: la aceptación de
 * la v2 se queda como está, porque esa persona sí firmó ese texto ese día.
 *
 * La versión la decide el SERVIDOR, no el navegador: si el cliente la mandara,
 * podría decir que aceptó una versión que nunca vio.
 */
export async function POST() {
  try {
    const caller = await getCaller()
    if (!caller) return NextResponse.json({ error: "Inicia sesión" }, { status: 401 })

    const admin = createAdminClient()
    const { data: perfil } = await admin
      .from("profiles")
      .select("role")
      .eq("id", caller.id)
      .maybeSingle()

    const tipo = perfil?.role === "paseador" ? "paseador" : "cliente"
    const doc = await documentoVigente(tipo)

    const { error } = await admin.from("contracts").insert({
      user_id: caller.id,
      type: tipo,
      version: doc.version,
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Ya firmó: se limpia la solicitud para que no le vuelva a salir
    await admin
      .from("profiles")
      .update({ contrato_reaceptacion_pedida_at: null })
      .eq("id", caller.id)

    return NextResponse.json({ ok: true, version: doc.version })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error" }, { status: 500 })
  }
}

import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { getCaller } from "@/lib/api-auth"

/**
 * Devuelve un link temporal para ver la identificación de un usuario.
 * SOLO admin. El bucket es privado: nunca se expone una URL permanente.
 */
export async function GET(req: NextRequest) {
  try {
    const caller = await getCaller()
    if (!caller) return NextResponse.json({ error: "No autorizado" }, { status: 401 })
    if (!caller.isAdmin) return NextResponse.json({ error: "Solo el admin" }, { status: 403 })

    const userId = req.nextUrl.searchParams.get("userId") ?? ""
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) {
      return NextResponse.json({ error: "Usuario inválido" }, { status: 400 })
    }

    const admin = createAdminClient()
    const { data: perfil } = await admin
      .from("profiles")
      .select("id_document_path")
      .eq("id", userId)
      .single()

    if (!perfil?.id_document_path) {
      return NextResponse.json({ error: "Este usuario no subió identificación." }, { status: 404 })
    }

    // 5 minutos: suficiente para abrirla, corto para que no ande circulando
    const { data, error } = await admin.storage
      .from("identificaciones")
      .createSignedUrl(perfil.id_document_path, 300)

    if (error || !data?.signedUrl) {
      return NextResponse.json({ error: error?.message ?? "No se pudo abrir" }, { status: 500 })
    }

    return NextResponse.json({ url: data.signedUrl })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error" }, { status: 500 })
  }
}

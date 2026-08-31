import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"

/**
 * Guarda la identificación oficial (INE/pasaporte/licencia) de un dueño.
 *
 * Se llama justo después de signUp. No se puede subir directo a Storage desde
 * el navegador porque cuando la confirmación de correo está activada el usuario
 * todavía no tiene sesión, y las políticas del bucket piden auth.uid().
 *
 * Para que un userId ajeno no sirva de nada:
 *   - solo se acepta si ese perfil AÚN no tiene identificación (una sola vez)
 *   - solo para dueños
 * Reemplazar una identificación ya subida es cosa del admin, no de esta ruta.
 */

const MAX_BYTES = 5 * 1024 * 1024 // 5 MB
const TIPOS_OK: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
}

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData()
    const userId = String(form.get("userId") ?? "")
    const file = form.get("file")

    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) {
      return NextResponse.json({ error: "Usuario inválido" }, { status: 400 })
    }
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Falta el archivo" }, { status: 400 })
    }
    if (file.size === 0) {
      return NextResponse.json({ error: "El archivo está vacío" }, { status: 400 })
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: "La imagen pesa más de 5 MB. Tómale una foto más ligera." }, { status: 400 })
    }
    const ext = TIPOS_OK[file.type]
    if (!ext) {
      return NextResponse.json({ error: "Solo se aceptan fotos JPG, PNG, WEBP o PDF." }, { status: 400 })
    }

    const admin = createAdminClient()

    const { data: perfil, error: perfilErr } = await admin
      .from("profiles")
      .select("id, role, id_document_path")
      .eq("id", userId)
      .single()

    if (perfilErr || !perfil) {
      return NextResponse.json({ error: "La cuenta no existe. Recarga la página." }, { status: 404 })
    }
    // Endy la pide a los dos: del dueño respalda quién confía el perro, del
    // paseador respalda quién leyó y aceptó el manual.
    if (perfil.role !== "dueno" && perfil.role !== "paseador") {
      return NextResponse.json({ error: "Ese tipo de cuenta no sube identificación." }, { status: 403 })
    }
    if (perfil.id_document_path) {
      // Ya tiene una. No se pisa desde aquí.
      return NextResponse.json({ ok: true, yaExistia: true })
    }

    const path = `${userId}/identificacion.${ext}`
    const { error: upErr } = await admin.storage
      .from("identificaciones")
      .upload(path, file, { contentType: file.type, upsert: true })

    if (upErr) {
      return NextResponse.json({ error: `No se pudo guardar la identificación: ${upErr.message}` }, { status: 500 })
    }

    const { error: updErr } = await admin
      .from("profiles")
      .update({ id_document_path: path })
      .eq("id", userId)

    if (updErr) {
      return NextResponse.json({ error: updErr.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error" }, { status: 500 })
  }
}

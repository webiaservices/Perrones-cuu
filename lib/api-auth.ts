import { createClient } from "@/lib/supabase/server"

/**
 * Identifica al usuario que llama a una ruta API (por cookies de sesión).
 * Las rutas notify-* usan service role para LEER datos, pero el que DISPARA
 * el correo debe estar autenticado y estar involucrado en la reserva —
 * antes cualquiera podía spamear correos reales con un reservationId.
 */
export async function getCaller() {
  const supa = await createClient()
  const {
    data: { user },
  } = await supa.auth.getUser()
  if (!user) return null
  const { data: prof } = await supa.from("profiles").select("role").eq("id", user.id).single()
  const role = (prof?.role as string | undefined) ?? "dueno"
  return { id: user.id, role, isAdmin: role === "admin" }
}

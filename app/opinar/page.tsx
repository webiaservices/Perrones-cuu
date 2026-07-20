import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { OpinarClient } from "./opinar-client"

/**
 * Página para dejar una reseña con sesión, SIN necesidad de haber reservado.
 * Pensada para clientes que el admin agenda directamente.
 */
export default async function OpinarPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login?redirectTo=/opinar")
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .single()

  return <OpinarClient defaultName={profile?.full_name ?? ""} />
}

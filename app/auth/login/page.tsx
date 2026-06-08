import { redirect } from "next/navigation"

// La página vieja de v0 redirige a la nueva con el nuevo diseño
export default function AuthLoginRedirect() {
  redirect("/login")
}

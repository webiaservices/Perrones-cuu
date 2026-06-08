import { redirect } from "next/navigation"

// La página vieja de v0 redirige a la nueva (que tiene zona y horarios del paseador)
export default function AuthSignUpRedirect() {
  redirect("/signup")
}

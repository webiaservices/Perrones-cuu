/**
 * Traduce los errores de Supabase Auth al español — los clientes veían
 * "Invalid login credentials" en crudo en una página 100% en español.
 */
export function traducirErrorAuth(message: string): string {
  const m = message.toLowerCase()
  if (m.includes("invalid login credentials")) return "Correo o contraseña incorrectos."
  if (m.includes("email not confirmed")) return "Confirma tu correo primero — te mandamos un enlace al registrarte."
  if (m.includes("user already registered") || m.includes("already been registered"))
    return "Ya existe una cuenta con ese correo. Inicia sesión."
  if (m.includes("password should be at least"))
    return "La contraseña debe tener al menos 6 caracteres."
  if (m.includes("unable to validate email") || m.includes("invalid email"))
    return "Ese correo no se ve válido. Revísalo."
  if (m.includes("rate limit") || m.includes("too many requests"))
    return "Demasiados intentos. Espera un minuto y vuelve a intentar."
  if (m.includes("network") || m.includes("fetch"))
    return "Problema de conexión. Revisa tu internet e intenta de nuevo."
  return message
}

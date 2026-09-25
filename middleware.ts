import { updateSession } from "@/lib/supabase/proxy"
import { type NextRequest } from "next/server"

export async function middleware(request: NextRequest) {
  return await updateSession(request)
}

export const config = {
  // sw.js y manifest.json no necesitan sesión: el teléfono los pide solo
  matcher: ["/((?!_next/static|_next/image|favicon.ico|sw\\.js|manifest\\.json|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
}

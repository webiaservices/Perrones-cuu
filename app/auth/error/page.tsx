import Link from "next/link"
import { AlertTriangle } from "lucide-react"
import { LogoCircle } from "@/components/logo-circle"

export default function AuthErrorPage() {
  return (
    <main className="flex min-h-svh w-full items-center justify-center bg-secondary/30 p-6">
      <div className="w-full max-w-md text-center">
        <Link href="/" className="mb-8 flex items-center justify-center gap-3">
          <LogoCircle className="h-14 w-14" />
          <span className="font-display text-2xl font-bold">Perrones Cuu</span>
        </Link>
        <div className="rounded-3xl border border-border bg-background p-8 shadow-sm">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-destructive/15">
            <AlertTriangle className="h-8 w-8 text-destructive" />
          </div>
          <h1 className="font-display text-2xl font-extrabold">Algo salió mal</h1>
          <p className="mt-3 text-pretty text-sm leading-relaxed text-muted-foreground">
            No pudimos completar la autenticación. Intenta de nuevo o contáctanos si el problema persiste.
          </p>
          <Link
            href="/login"
            className="mt-6 inline-block rounded-full bg-primary px-6 py-3 text-sm font-bold text-primary-foreground transition-transform hover:scale-105"
          >
            Volver a iniciar sesión
          </Link>
        </div>
      </div>
    </main>
  )
}

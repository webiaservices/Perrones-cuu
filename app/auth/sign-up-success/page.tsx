import Link from "next/link"
import { Mail } from "lucide-react"
import { LogoCircle } from "@/components/logo-circle"

type Props = { searchParams: Promise<{ next?: string }> }

export default async function SignUpSuccessPage({ searchParams }: Props) {
  const params = await searchParams
  const next = params.next && params.next.startsWith("/") ? params.next : null
  const loginHref = next ? `/login?redirectTo=${encodeURIComponent(next)}` : "/login"
  return (
    <main className="flex min-h-svh w-full items-center justify-center bg-secondary/30 p-6">
      <div className="w-full max-w-md text-center">
        <Link href="/" className="mb-8 flex items-center justify-center gap-3">
          <LogoCircle className="h-14 w-14" />
          <span className="font-display text-2xl font-bold">Perrones Cuu</span>
        </Link>
        <div className="rounded-3xl border border-border bg-background p-8 shadow-sm">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/15">
            <Mail className="h-8 w-8 text-primary" />
          </div>
          <h1 className="font-display text-2xl font-extrabold">¡Revisa tu correo!</h1>
          <p className="mt-3 text-pretty text-sm leading-relaxed text-muted-foreground">
            Te enviamos un enlace de confirmación. Confirma tu cuenta para empezar a reservar paseos con Perrones Cuu.
          </p>
          <Link
            href={loginHref}
            className="mt-6 inline-block rounded-full bg-primary px-6 py-3 text-sm font-bold text-primary-foreground transition-transform hover:scale-105"
          >
            Ir a iniciar sesión
          </Link>
        </div>
      </div>
    </main>
  )
}

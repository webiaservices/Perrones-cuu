import Link from "next/link"
import { Home, ArrowLeft } from "lucide-react"
import { LogoCircle } from "@/components/logo-circle"
import { Button } from "@/components/ui/button"

export default function NotFound() {
  return (
    <main className="flex min-h-svh w-full items-center justify-center bg-secondary/30 p-6">
      <div className="w-full max-w-md text-center">
        <Link href="/" className="mb-8 flex items-center justify-center gap-3">
          <LogoCircle className="h-14 w-14 animate-soft-float" />
          <span className="font-display text-2xl font-bold">Perrones Cuu</span>
        </Link>
        <div className="rounded-3xl border border-border bg-background p-10 shadow-sm">
          <p className="font-display text-7xl font-extrabold text-primary">404</p>
          <h1 className="mt-3 font-display text-2xl font-extrabold">Página no encontrada</h1>
          <p className="mt-2 text-pretty text-sm text-muted-foreground">
            La página que buscas no existe o fue movida. Tu perrito también está buscándola.
          </p>
          <div className="mt-8 flex flex-col gap-2 sm:flex-row sm:justify-center">
            <Button asChild className="rounded-full font-bold">
              <Link href="/">
                <Home className="h-4 w-4" />
                Ir al inicio
              </Link>
            </Button>
            <Button asChild variant="outline" className="rounded-full font-bold">
              <Link href="/reservar">
                <ArrowLeft className="h-4 w-4" />
                Agendar un paseo
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </main>
  )
}

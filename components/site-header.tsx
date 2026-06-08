import Link from "next/link"
import { Button } from "@/components/ui/button"
import { LogoCircle } from "@/components/logo-circle"
import { BRAND } from "@/lib/constants"

export function SiteHeader({ isLoggedIn }: { isLoggedIn: boolean }) {
  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
        <Link href="/" className="group flex items-center gap-2 transition-transform hover:scale-[1.02]">
          <LogoCircle className="h-11 w-11 transition-transform group-hover:rotate-[8deg]" />
          <span className="font-display text-xl font-extrabold tracking-tight">Perrones</span>
        </Link>

        <nav className="hidden items-center gap-6 text-sm font-semibold text-muted-foreground md:flex">
          <Link href="/#como-funciona" className="link-fancy hover:text-foreground">
            Cómo funciona
          </Link>
          <Link href="/#precios" className="link-fancy hover:text-foreground">
            Precios
          </Link>
          <Link href="/#resenas" className="link-fancy hover:text-foreground">
            Reseñas
          </Link>
        </nav>

        <div className="flex items-center gap-2">
          {isLoggedIn ? (
            <Button asChild className="rounded-full font-bold transition-transform hover:scale-105 active:scale-95">
              <Link href="/panel">Mi panel</Link>
            </Button>
          ) : (
            <>
              <Button asChild variant="ghost" className="hidden rounded-full font-bold transition-transform hover:scale-105 active:scale-95 sm:inline-flex">
                <Link href="/login">
                  <span className="sm:hidden">Iniciar sesión</span>
                  <span className="hidden sm:inline lg:hidden">Inicia sesión</span>
                  <span className="hidden lg:inline">Inicia sesión y agenda tu paseo</span>
                </Link>
              </Button>
              <Button asChild variant="ghost" className="rounded-full font-bold transition-transform hover:scale-105 active:scale-95 sm:hidden">
                <Link href="/login">Entrar</Link>
              </Button>
              <Button asChild className="shine rounded-full font-bold transition-transform hover:scale-105 active:scale-95">
                <Link href="/signup">Regístrate</Link>
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  )
}

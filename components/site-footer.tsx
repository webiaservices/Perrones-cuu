import Link from "next/link"
import { Instagram, Facebook, MessageCircle, Phone } from "lucide-react"
import { LogoCircle } from "@/components/logo-circle"
import { BRAND } from "@/lib/constants"

export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-secondary/40">
      <div className="mx-auto max-w-6xl px-4 py-10">
        {/* Aviso de contacto grande */}
        <div className="mb-8 rounded-3xl bg-primary/10 px-6 py-5 text-center">
          <p className="text-sm font-bold uppercase tracking-wide text-primary">¿Cualquier duda?</p>
          <a
            href={BRAND.whatsappLink}
            target="_blank"
            rel="noreferrer"
            className="mt-1 inline-flex items-center gap-2 font-display text-xl font-extrabold hover:text-primary"
          >
            <Phone className="h-5 w-5" />
            +52 614 594 8513
          </a>
          <p className="mt-1 text-xs text-muted-foreground">WhatsApp / Llamada · L–D 8am–8pm</p>
        </div>

        <div className="flex flex-col items-center gap-6 text-center md:flex-row md:justify-between md:text-left">
          <div className="flex items-center gap-2">
            <LogoCircle className="h-9 w-9" />
            <div>
              <p className="font-extrabold">{BRAND.name}</p>
              <p className="text-xs text-muted-foreground">© 2026 {BRAND.name} · Chihuahua, México</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <a
              href={BRAND.social.instagram}
              target="_blank"
              rel="noreferrer"
              aria-label="Instagram"
              className="flex items-center gap-1.5 text-sm font-semibold text-muted-foreground transition-colors hover:text-primary"
            >
              <Instagram className="h-5 w-5" />
              <span>Instagram</span>
            </a>
            <a
              href={BRAND.social.facebook}
              target="_blank"
              rel="noreferrer"
              aria-label="Facebook"
              className="flex items-center gap-1.5 text-sm font-semibold text-muted-foreground transition-colors hover:text-primary"
            >
              <Facebook className="h-5 w-5" />
              <span>Facebook</span>
            </a>
          </div>

          <div className="flex items-center gap-4 text-sm font-semibold">
            <Link href="/privacidad" className="text-muted-foreground transition-colors hover:text-foreground">
              Privacidad
            </Link>
            <a
              href={BRAND.whatsappLink}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 text-muted-foreground transition-colors hover:text-foreground"
            >
              <MessageCircle className="h-4 w-4" />
              Contacto
            </a>
          </div>
        </div>
      </div>
    </footer>
  )
}

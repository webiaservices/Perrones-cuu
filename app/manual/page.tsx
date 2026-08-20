import type { Metadata } from "next"
import Link from "next/link"
import { ManualPaseadores } from "@/components/manual-paseadores"
import { LogoCircle } from "@/components/logo-circle"
import { BotonImprimirManual } from "./boton-imprimir"
import { BRAND } from "@/lib/constants"
import { MANUAL_TITULO, MANUAL_VERSION } from "@/lib/manual-paseadores"

/**
 * Página pública del manual: perronescuu.com/manual
 *
 * Es el enlace permanente que se manda por WhatsApp a los paseadores. No pide
 * sesión a propósito — un paseador recién aceptado tiene que poder abrirlo
 * desde el celular sin registrarse. No contiene datos de clientes.
 */
export const metadata: Metadata = {
  title: `${MANUAL_TITULO} · ${BRAND.name}`,
  description:
    "Estándares y protocolos que sigue cada paseador de Perrones Cuu: antes, durante y después del paseo, emergencias y condiciones de pago.",
}

export default function ManualPage() {
  return (
    <div className="min-h-dvh bg-secondary/30 px-4 py-10 print:bg-white print:py-0">
      <div className="mx-auto max-w-3xl">
        <div className="mb-8 flex flex-col items-center gap-3 print:hidden">
          <Link href="/">
            <LogoCircle className="h-14 w-14" />
          </Link>
          <BotonImprimirManual />
        </div>

        <ManualPaseadores />

        <footer className="mt-10 text-center text-xs text-muted-foreground print:mt-6">
          <p>
            {BRAND.name} · {BRAND.city} · Manual {MANUAL_VERSION}
          </p>
          <p className="mt-1 print:hidden">
            ¿Dudas? Escríbenos por{" "}
            <a href={BRAND.whatsappLink} className="font-bold text-primary underline">
              WhatsApp
            </a>
            .
          </p>
        </footer>
      </div>
    </div>
  )
}

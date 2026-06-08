import Link from "next/link"
import { LogoCircle } from "@/components/logo-circle"
import { SiteHeader } from "@/components/site-header"
import { SiteFooter } from "@/components/site-footer"
import { createClient } from "@/lib/supabase/server"

export const metadata = {
  title: "Aviso de privacidad · Perrones Cuu",
  description: "Aviso de privacidad de Perrones Cuu — cómo manejamos los datos personales de dueños y paseadores.",
}

export default async function PrivacidadPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader isLoggedIn={!!user} />
      <main className="flex-1 px-4 py-12 md:py-20">
        <div className="mx-auto max-w-3xl rounded-3xl border border-border bg-card p-8 shadow-sm md:p-12">
          <Link href="/" className="mb-6 inline-flex items-center gap-2">
            <LogoCircle className="h-9 w-9" />
            <span className="font-display text-lg font-extrabold">Perrones Cuu</span>
          </Link>
          <h1 className="font-display text-3xl font-extrabold tracking-tight md:text-4xl">Aviso de privacidad</h1>
          <p className="mt-2 text-sm text-muted-foreground">Última actualización: junio de 2026</p>

          <div className="prose prose-sm mt-8 max-w-none text-foreground/90">
            <h2 className="mt-8 font-display text-xl font-extrabold">1. Responsable</h2>
            <p>
              Perrones Cuu ("la Plataforma"), con domicilio en Ciudad Chihuahua, Chih., México, es responsable del
              tratamiento de tus datos personales conforme a este aviso.
            </p>

            <h2 className="mt-6 font-display text-xl font-extrabold">2. Qué datos recabamos</h2>
            <p>De clientes (dueños) y paseadores: nombre, teléfono, correo, contraseña encriptada, zona, datos del
              perro (nombre, raza, tamaño, necesidades especiales) y dirección de recogida. De paseadores también
              horarios disponibles.
            </p>

            <h2 className="mt-6 font-display text-xl font-extrabold">3. Para qué los usamos</h2>
            <p>Para coordinar y operar el servicio de paseo: enlazar al cliente con un paseador, agendar, enviar
              notificaciones del paseo, facturación y soporte. No los compartimos con terceros sin tu consentimiento.
            </p>

            <h2 className="mt-6 font-display text-xl font-extrabold">4. Confidencialidad de la cartera</h2>
            <p>Los datos de los clientes son propiedad exclusiva de la Plataforma. Los paseadores no podrán contactar,
              ofrecer servicios o aceptar pagos directos de clientes conocidos a través de Perrones Cuu, ya sea durante
              o después de la relación. Esto incluye el período en que el paseador deje de operar con la Plataforma.
            </p>

            <h2 className="mt-6 font-display text-xl font-extrabold">5. Seguro y cobertura</h2>
            <p>La cobertura de seguro para mascotas únicamente aplica cuando el paseo se gestiona dentro de Perrones
              Cuu. Cualquier servicio fuera de la Plataforma queda sin protección.
            </p>

            <h2 className="mt-6 font-display text-xl font-extrabold">6. Tus derechos (ARCO)</h2>
            <p>Puedes acceder, rectificar, cancelar u oponerte al tratamiento de tus datos personales escribiendo a
              hola@perronescuu.com o por WhatsApp al +52 614 594 8513.
            </p>

            <h2 className="mt-6 font-display text-xl font-extrabold">7. Cambios al aviso</h2>
            <p>Cualquier cambio sustancial será notificado dentro de la Plataforma. La versión vigente siempre estará
              disponible en esta página.
            </p>
          </div>

          <Link
            href="/"
            className="mt-10 inline-block rounded-full bg-primary px-6 py-3 text-sm font-bold text-primary-foreground transition-transform hover:scale-105"
          >
            Volver al inicio
          </Link>
        </div>
      </main>
      <SiteFooter />
    </div>
  )
}

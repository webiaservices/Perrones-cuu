import Link from "next/link"
import { LogoCircle } from "@/components/logo-circle"
import { SiteHeader } from "@/components/site-header"
import { SiteFooter } from "@/components/site-footer"
import { createClient } from "@/lib/supabase/server"
import { BRAND } from "@/lib/constants"

export const metadata = {
  title: "Términos y condiciones · Perrones Cuu",
  description:
    "Términos del servicio de Perrones Cuu: cómo se contrata un paseo, cómo se paga, cómo se cancela y a quién reclamar.",
}

const h = "mt-8 font-display text-lg font-extrabold tracking-tight"
const p = "mt-3 leading-relaxed text-foreground/90"

/**
 * Términos públicos. Todo lo que dice esta página describe lo que el sistema
 * hace hoy de verdad (pago por transferencia al terminar, cancelación desde el
 * panel antes de que inicie, tope de 3 perros). Si una regla cambia en el
 * código, cambia aquí: publicar una condición que el producto no cumple es
 * justo lo que sanciona la LFPC.
 *
 * A propósito NO se habla aquí de seguro ni de cobertura: mientras no haya una
 * póliza que se pueda mostrar, no se promete por escrito.
 */
export default async function TerminosPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { razonSocial, rfc, domicilio } = BRAND.legal

  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader isLoggedIn={!!user} />
      <main className="flex-1 px-4 py-12 md:py-20">
        <div className="mx-auto max-w-3xl rounded-3xl border border-border bg-card p-8 shadow-sm md:p-12">
          <Link href="/" className="mb-6 inline-flex items-center gap-2">
            <LogoCircle className="h-9 w-9" />
            <span className="font-display text-lg font-extrabold">{BRAND.name}</span>
          </Link>
          <h1 className="font-display text-3xl font-extrabold tracking-tight md:text-4xl">
            Términos y condiciones
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">Última actualización: septiembre de 2026</p>

          <h2 className={h}>1. Quién presta el servicio</h2>
          <p className={p}>
            {BRAND.name}
            {razonSocial ? `, operado por ${razonSocial}` : ""}
            {rfc ? ` (RFC ${rfc})` : ""}, con servicio en {BRAND.city} y Ciudad de México.
          </p>
          <ul className="mt-3 space-y-1 text-foreground/90">
            {domicilio && <li>Domicilio: {domicilio}</li>}
            <li>Teléfono y WhatsApp: {BRAND.telefono}</li>
            <li>Correo: {BRAND.email}</li>
            <li>Horario de atención: {BRAND.horario}</li>
          </ul>

          <h2 className={h}>2. Qué incluye el servicio</h2>
          <p className={p}>
            {BRAND.name} coordina paseos para tu perro. El paseo lo realiza un operador (paseador)
            asignado por nosotros; tú no contratas al paseador por tu cuenta. Al terminar recibes
            foto y reporte del paseo dentro de tu panel.
          </p>

          <h2 className={h}>3. Para poder reservar</h2>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-foreground/90">
            <li>Crear una cuenta y aceptar el contrato de servicio.</li>
            <li>
              Subir una identificación oficial vigente (INE, pasaporte o licencia). Se usa solo para
              verificar tu identidad, no se comparte con los paseadores.
            </li>
            <li>Que tu perro tenga sus vacunas vigentes.</li>
            <li>
              Decirnos la verdad sobre su temperamento, en especial si alguna vez ha mordido o se ha
              puesto agresivo.
            </li>
            <li>Máximo 3 perros por paseo.</li>
          </ul>

          <h2 className={h}>4. Precios</h2>
          <p className={p}>
            El precio que ves al reservar es el total de ese paseo o paquete, según la ciudad, el
            plan y cuántos perros van. Es el mismo que se te cobra: no hay cargos extra ni
            comisiones aparte. Los precios pueden cambiar, pero un paseo ya reservado conserva el
            precio con el que lo reservaste.
          </p>

          <h2 className={h}>5. Cómo se paga</h2>
          <p className={p}>
            El pago se hace <strong>al terminar el paseo</strong> y únicamente por transferencia. No
            se cobra nada por adelantado ni se guardan datos de tarjetas en el sitio.
          </p>

          <h2 className={h}>6. Cancelaciones y reembolsos</h2>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-foreground/90">
            <li>
              Puedes cancelar un paseo desde tu panel <strong>en cualquier momento antes de que
              inicie</strong>, sin costo y sin dar explicaciones.
            </li>
            <li>
              Como el pago ocurre después del servicio, un paseo cancelado a tiempo simplemente no
              se cobra. No hay reembolsos que tramitar porque no hubo cobro previo.
            </li>
            <li>
              Un paseo que ya inició o que ya terminó no se puede cancelar desde el panel y sí se
              cobra.
            </li>
            <li>
              En un paquete, cancelar afecta a los paseos que todavía no empiezan; los que ya se
              realizaron se cobran.
            </li>
            <li>
              Si el paseo no se realizó por causa nuestra (no llegó el paseador, no se asignó a
              nadie), no se cobra. Si ya habías pagado, se te devuelve el importe por la misma vía en
              un plazo máximo de 10 días hábiles.
            </li>
            <li>
              Si algo salió mal con un paseo que sí se realizó, escríbenos dentro de los 5 días
              siguientes por WhatsApp o correo y lo revisamos caso por caso.
            </li>
          </ul>

          <h2 className={h}>7. Cambios de horario</h2>
          <p className={p}>
            Para reprogramar, cancela el paseo desde tu panel antes de que inicie y reserva de nuevo,
            o escríbenos por WhatsApp y lo movemos contigo. Si somos nosotros quienes necesitamos
            mover un paseo, te avisamos antes y puedes cancelarlo sin costo.
          </p>

          <h2 className={h}>8. Responsabilidad</h2>
          <p className={p}>
            Como dueño, eres responsable de los daños que tu perro cause durante el paseo a otras
            personas, a otros animales, al paseador o a la propiedad ajena, así como de los gastos
            médicos, veterinarios o de reparación que se deriven. Ocultar o falsear información sobre
            el temperamento de tu perro deja la responsabilidad enteramente de tu lado. Estas
            condiciones se detallan en el contrato que aceptas al crear tu cuenta.
          </p>

          <h2 className={h}>9. Reseñas</h2>
          <p className={p}>
            Las reseñas que aparecen en el sitio son de clientes reales y se publican con la
            calificación que ellos pusieron. No publicamos testimonios inventados ni modificamos el
            texto de una reseña.
          </p>

          <h2 className={h}>10. Tus datos</h2>
          <p className={p}>
            Cómo tratamos tus datos personales está en el{" "}
            <Link href="/privacidad" className="font-semibold text-primary underline">
              aviso de privacidad
            </Link>
            .
          </p>

          <h2 className={h}>11. Quejas</h2>
          <p className={p}>
            Cualquier inconformidad escríbela a {BRAND.email} o al WhatsApp {BRAND.telefono}; te
            respondemos dentro de los 5 días hábiles siguientes. Si no quedas conforme, puedes acudir
            a la Procuraduría Federal del Consumidor (PROFECO), teléfono 55 5568 8722 o{" "}
            <a
              href="https://www.gob.mx/profeco"
              target="_blank"
              rel="noreferrer"
              className="font-semibold text-primary underline"
            >
              gob.mx/profeco
            </a>
            .
          </p>

          <h2 className={h}>12. Cambios y ley aplicable</h2>
          <p className={p}>
            Podemos actualizar estos términos; la fecha de arriba indica la última versión y los
            cambios aplican a las reservas hechas después de esa fecha. Estos términos se rigen por
            las leyes de los Estados Unidos Mexicanos, con jurisdicción en Ciudad Chihuahua,
            Chihuahua.
          </p>

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

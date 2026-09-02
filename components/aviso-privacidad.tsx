/**
 * El texto del aviso de privacidad, en UN solo lugar.
 *
 * Lo usan la página /privacidad y el modal que se abre desde el registro. Si
 * viviera duplicado, tarde o temprano uno diría una cosa y el otro otra — y es
 * justo el documento donde eso no puede pasar.
 *
 * Nota: la INE ahora se le pide a dueños Y paseadores, y al reservar se sube
 * una foto de la fachada. Ambas cosas están cubiertas en el punto 2.
 */
export function AvisoPrivacidadContenido({ compacto = false }: { compacto?: boolean }) {
  const h = compacto
    ? "mt-4 font-display text-base font-extrabold"
    : "mt-6 font-display text-xl font-extrabold"
  return (
    <>
      <h2 className={compacto ? "font-display text-base font-extrabold" : "mt-8 font-display text-xl font-extrabold"}>
        1. Responsable
      </h2>
      <p>
        Perrones Cuu (&ldquo;la Plataforma&rdquo;), con domicilio en Ciudad Chihuahua, Chih., México, es responsable
        del tratamiento de tus datos personales conforme a este aviso.
      </p>

      <h2 className={h}>2. Qué datos recabamos</h2>
      <p>
        De clientes (dueños) y paseadores: nombre, teléfono, correo, contraseña encriptada, ciudad, zona, datos del
        perro (nombre, raza, tamaño, necesidades especiales y antecedentes de conducta) y dirección de recogida. De
        paseadores también horarios disponibles y datos bancarios para su compensación.
      </p>
      <p className="mt-3">
        De dueños y paseadores recabamos además una <b>identificación oficial</b> (INE, pasaporte o licencia) al
        momento del registro. Es un dato personal que tratamos con cuidado especial: se guarda cifrado en un
        almacenamiento privado, <b>solo tiene acceso el equipo de Perrones Cuu</b> y no se comparte con terceros. Su
        finalidad es acreditar la identidad de quien nos confía a su perro o de quien lo pasea, y respaldar la
        responsabilidad prevista en el contrato. Se elimina cuando la cuenta se da de baja.
      </p>
      <p className="mt-3">
        Al agendar un paseo puedes subir una <b>foto de la fachada de tu domicilio</b> para que el paseador lo
        ubique. Esa foto <b>solo la ve el paseador que ya tiene asignado ese paseo</b>, nunca el resto del equipo de
        paseadores ni terceros, y se guarda en un almacenamiento privado igual que la identificación.
      </p>

      <h2 className={h}>3. Para qué los usamos</h2>
      <p>
        Para coordinar y operar el servicio de paseo: enlazar al cliente con un paseador, agendar, enviar
        notificaciones del paseo, facturación y soporte. No los compartimos con terceros sin tu consentimiento.
      </p>

      <h2 className={h}>4. Confidencialidad de la cartera</h2>
      <p>
        Los datos de los clientes son propiedad exclusiva de la Plataforma. Los paseadores no podrán contactar,
        ofrecer servicios o aceptar pagos directos de clientes conocidos a través de Perrones Cuu, ya sea durante o
        después de la relación. Esto incluye el período en que el paseador deje de operar con la Plataforma.
      </p>

      <h2 className={h}>5. Seguro y cobertura</h2>
      <p>
        La cobertura de seguro para mascotas únicamente aplica cuando el paseo se gestiona dentro de Perrones Cuu.
        Cualquier servicio fuera de la Plataforma queda sin protección.
      </p>

      <h2 className={h}>6. Rastreo por GPS</h2>
      <p>
        El rastreo en tiempo real viene incluido en el servicio y se activa cuando el cliente lo solicita por
        WhatsApp. Mientras dura el paseo se registra el recorrido y se comparte únicamente con el dueño del perro. La
        ubicación se toma del dispositivo del paseador durante el servicio y no se usa para ningún otro fin.
      </p>

      <h2 className={h}>7. Tus derechos (ARCO)</h2>
      <p>
        Puedes acceder, rectificar, cancelar u oponerte al tratamiento de tus datos personales escribiendo a
        perronescuu@gmail.com o por WhatsApp al +52 614 594 8513.
      </p>

      <h2 className={h}>8. Cambios al aviso</h2>
      <p>
        Cualquier cambio sustancial será notificado dentro de la Plataforma. La versión vigente siempre estará
        disponible en esta página.
      </p>
    </>
  )
}

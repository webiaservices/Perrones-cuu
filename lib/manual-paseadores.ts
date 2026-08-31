/**
 * Manual de operación para paseadores.
 *
 * Vive aquí (y no en un PDF suelto) para que:
 *   - la página /manual siempre muestre la versión vigente,
 *   - el enlace que se manda por WhatsApp nunca cambie,
 *   - actualizarlo sea editar este archivo y desplegar.
 *
 * Al subir MANUAL_VERSION, a los paseadores que ya lo habían aceptado
 * les vuelve a aparecer para que acepten la versión nueva.
 */
export const MANUAL_VERSION = "v1"

export type ManualSeccion = {
  titulo: string
  /** Párrafos sueltos que van antes de la lista. */
  intro?: string[]
  /** Viñetas de la sección. */
  puntos?: string[]
  /** Subsecciones con su propio título. */
  subsecciones?: { titulo: string; puntos: string[] }[]
  /** Tabla de "a quién avisar". */
  tabla?: { encabezados: string[]; filas: string[][] }
}

export const MANUAL_TITULO = "Manual de Operación para Paseadores"
export const MANUAL_SUBTITULO = "Guía de estándares y procesos — Servicio de Paseo de Perros"

export const MANUAL_SECCIONES: ManualSeccion[] = [
  {
    titulo: "1. Bienvenida",
    intro: [
      "Este manual describe cómo debe realizarse cada paseo, qué se espera de ti como paseador, y qué hacer ante situaciones comunes o de emergencia. Seguirlo garantiza que los clientes reciban siempre el mismo nivel de calidad, sin importar quién realice el paseo.",
    ],
  },
  {
    titulo: "2. Antes del paseo",
    puntos: [
      "Confirma la cita con al menos 1 día de anticipación (mensaje al dueño).",
      "Revisa la ficha del perro: nombre, edad, temperamento, alergias, correa/arnés propio, punto de recolección.",
      "Llega puntual: máximo 10 minutos de tolerancia. Si vas a retrasarte, avisa de inmediato al dueño y al coordinador.",
      "Lleva siempre: bolsas para desechos, agua y tu celular con batería (correa extra opcional).",
    ],
  },
  {
    titulo: "3. Durante el paseo",
    subsecciones: [
      {
        titulo: "3.1 Recolección",
        puntos: [
          "Saluda al dueño, confirma indicaciones de última hora (salud, comportamiento reciente, comida antes del paseo).",
          "Verifica que collar/arnés esté bien ajustado antes de salir.",
        ],
      },
      {
        titulo: "3.2 Ruta y duración",
        puntos: [
          "No hay ruta definida, a menos de que el dueño especifique alguna ruta de su preferencia.",
          "Duración exacta contratada: no acortar ni alargar sin avisar.",
          "Nunca sueltes al perro sin correa en la vía pública.",
          "Si paseas varios perros a la vez, siempre debes coordinarlo primero con el coordinador, para que él confirme con el cliente si está de acuerdo en que su perro se pasee junto con otros perros, y solo si son compatibles entre sí.",
        ],
      },
      {
        titulo: "3.3 Comportamiento del paseador",
        puntos: [
          "No uses el teléfono salvo para reportar o emergencias.",
          "Recoge siempre el desecho del perro.",
          "Mantén el paso y la atención en el perro en todo momento, no en otros paseadores o distracciones.",
        ],
      },
    ],
  },
  {
    titulo: "4. Después del paseo",
    puntos: [
      "Regresa al perro al mismo punto de recolección.",
      "Envía al dueño una foto o video corto del paseo.",
      "Reporta al coordinador cualquier incidente, por menor que parezca.",
    ],
  },
  {
    titulo: "5. Protocolo de emergencias",
    subsecciones: [
      {
        titulo: "5.1 El perro se escapa o se suelta",
        puntos: [
          "Mantén la calma, no persigas gritando (asusta al perro).",
          "Llama al perro por su nombre con voz tranquila y usa premios si los llevas.",
          "Avisa de inmediato al coordinador y al dueño, aunque ya lo hayas recuperado.",
        ],
      },
      {
        titulo: "5.2 El perro se lastima o muestra signos de enfermedad",
        puntos: [
          "Detén el paseo de inmediato (no te preocupes, la empresa se hace responsable de lo que le haya pasado al perro durante el paseo).",
          "Contacta al dueño y al coordinador para decidir si se traslada a un veterinario.",
          "Nunca administres medicamento alguno sin autorización expresa del dueño.",
        ],
      },
      {
        titulo: "5.3 Pelea entre perros o incidente con una persona",
        puntos: [
          "Separa a los perros solo si es seguro hacerlo (nunca con las manos entre los hocicos).",
          "Aleja al perro del área y reporta el incidente de inmediato al coordinador.",
          "Si hay una persona involucrada, mantén la calma, no discutas, e intercambia solo información de contacto de la empresa.",
        ],
      },
    ],
  },
  {
    titulo: "6. Comunicación y reportes",
    tabla: {
      encabezados: ["Situación", "A quién avisar", "Tiempo máximo"],
      filas: [
        ["Retraso del paseador", "Coordinador y dueño", "Inmediato"],
        ["Perro escapado (recuperado)", "Coordinador", "Inmediato"],
        ["Lesión o enfermedad", "Coordinador y dueño", "Inmediato"],
        ["Reporte de rutina", "Dueño (foto/mensaje)", "Al finalizar el paseo"],
      ],
    },
  },
  {
    titulo: "7. Condiciones de pago y desempeño",
    puntos: [
      "El pago se realiza de forma semanal, unas horas después de que se realice el último paseo.",
      "Se otorgan bonos por antigüedad a los 3 y 6 meses de servicio continuo.",
      "Las faltas sin previo aviso afectan el pago: se reduce el pago de ese día.",
      "Si por una emergencia no puedes realizar el paseo, avisa inmediatamente al dueño y al coordinador para ver si se puede mover el paseo a otro día y reponerlo.",
    ],
  },
  {
    titulo: "8. Qué hacer si te pedimos GPS",
    puntos: [
      "El rastreo viene incluido en el servicio, pero solo se activa cuando el cliente lo pide. Si ese paseo lleva GPS, nosotros te avisamos antes por WhatsApp. Si no te avisamos, no tienes que abrir nada.",
    ],
    subsecciones: [
      {
        titulo: "8.1 Cómo se usa, paso a paso",
        puntos: [
          "1. Instala la app DOGGY LOGS. NO te registres: por WhatsApp te damos un correo y una contraseña.",
          "2. Entra al apartado de Mascotas.",
          "3. Ahí te aparecen los perritos. Pícale al que tengas asignado.",
          "4. Te salen varias opciones. Dale a INICIAR PASEO.",
        ],
      },
      {
        titulo: "8.2 El error más común",
        puntos: [
          "Mucha gente le pica a RECOGER. Esa NO es. Siempre Iniciar paseo: si le picas a la otra, el recorrido no se registra y el cliente no puede ver nada.",
          "La app va prendida desde que recoges hasta que entregas.",
          "Necesitas datos móviles todo el paseo, no solo para redes sociales: datos para todo.",
          "Cualquier duda, comunícate al WhatsApp.",
        ],
      },
    ],
  },
]

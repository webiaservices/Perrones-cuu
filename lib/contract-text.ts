// v3 (sep 2026): se quitó la promesa de seguro. No existe póliza, y prometer
// una cobertura que no se puede ejecutar en un contrato firmado es lo que
// convierte un reclamo en demanda. Ahora se dice de frente que no hay seguro y
// se explica qué pasa si hay un incidente.
//
// v2 (ago 2026): se agregó la responsabilidad del dueño por daños de su perro
// y la identificación oficial. Las aceptaciones anteriores quedan guardadas
// como v1 en la tabla `contracts` — no se reescriben.
//
// Subir la versión NO obliga a nadie a volver a firmar: la re-aceptación la
// pide Endy persona por persona desde su panel.
export const CONTRACT_VERSION = "v3"

export const CLIENT_CONTRACT = `CONTRATO DE PRESTACIÓN DE SERVICIOS — CLIENTE (DUEÑO)

1. Objeto. Perrones Cuu ("la Plataforma") presta el servicio de enlace y coordinación de paseos para tu perro con operadores (paseadores) verificados en Ciudad Chihuahua.

2. La marca. La Plataforma es responsable del servicio. Los paseos los realizan operadores asignados automáticamente por la Plataforma; el cliente no contrata directamente al paseador.

3. Pagos. El cliente paga a la Plataforma el precio del paquete elegido. El pago se realiza al terminar el paseo, únicamente por transferencia. La Plataforma coordina la compensación del operador.

4. El servicio NO incluye seguro. Perrones Cuu no ofrece ni contrata seguro, cobertura veterinaria, fianza ni garantía económica de ningún tipo sobre tu perro, sobre terceros o sobre bienes. Si quieres a tu perro asegurado, debes contratar tú una póliza con una aseguradora. Este punto se dice de frente para que nadie contrate creyendo que existe una cobertura que no existe.

5. Cuidado responsable. El dueño declara que su perro cuenta con vacunas vigentes y describe con veracidad el temperamento y necesidades especiales del animal. En particular, se compromete a informar si el perro ha mordido o ha mostrado conductas agresivas antes.

6. Responsabilidad por daños. El dueño es el único responsable de los daños que su perro cause durante el paseo a terceros —incluyendo al paseador, a otras personas, a otros animales o a la propiedad ajena—, así como de los gastos médicos, veterinarios o de reparación que se deriven. Omitir o falsear información sobre el temperamento del animal (punto 5) deja la responsabilidad enteramente del lado del dueño.

7. Si algo le pasa a tu perro durante el paseo. El paseador te avisa de inmediato y, si hace falta, apoya para trasladarlo a un veterinario. Los gastos veterinarios corren por cuenta del dueño, salvo que el daño se haya producido por negligencia del paseador, caso en el que la Plataforma responde conforme a la ley. La Plataforma no renuncia a responder por sus propias faltas ni pretende excluir la responsabilidad que la ley le impone.

8. Identificación. Para dar de alta la cuenta, el dueño sube una identificación oficial vigente (INE, pasaporte o licencia). Se usa únicamente para verificar su identidad y respaldar el punto 6. Se guarda de forma privada, no se comparte con los paseadores ni con terceros, y se elimina si la cuenta se da de baja.

9. Cancelaciones. Podrás cancelar un paseo desde tu panel, sin costo, en cualquier momento antes de que inicie. Como el pago ocurre después del servicio, un paseo cancelado a tiempo simplemente no se cobra. Un paseo que ya inició o que ya terminó sí se cobra. Si el paseo no se realizó por causa de la Plataforma, no se cobra.

10. Datos. Tus datos se usan únicamente para coordinar el servicio, conforme al aviso de privacidad publicado en el sitio.

Al aceptar, confirmas que has leído y estás de acuerdo con este contrato (versión ${CONTRACT_VERSION}).`

export const WALKER_CONTRACT = `CONTRATO DE PRESTACIÓN DE SERVICIOS — PASEADOR (OPERADOR)

1. Objeto. El paseador presta servicios de paseo de perros a través de la Plataforma Perrones Cuu en Ciudad Chihuahua.

2. Relación con la marca. El paseador opera bajo la marca Perrones Cuu. No debe ofrecer servicios directos ni compartir datos de contacto con los clientes. Toda la comunicación ocurre dentro de la Plataforma.

3. AVISO DE PRIVACIDAD Y EXCLUSIVIDAD. Los datos de los clientes son confidenciales y propiedad exclusiva de Perrones Cuu. El paseador se compromete a NO contactar, ofrecer servicios o aceptar pagos directos de clientes conocidos a través de la plataforma, ya sea durante o después de la relación. Cualquier servicio prestado por fuera queda enteramente bajo la responsabilidad del paseador —la Plataforma no lo coordina ni responde por él— y es causal de baja inmediata.

4. Compensación. La compensación por cada paseo será acordada directamente entre el paseador y Perrones Cuu fuera de la plataforma. El paseador no tiene acceso a los precios cobrados al cliente ni a información financiera de la plataforma.

5. Disponibilidad. El paseador define su zona y horarios; al aceptar un paseo se compromete a realizarlo.

6. Trato a los animales. El paseador se compromete a tratar a cada perro con cuidado, paciencia y responsabilidad, y a entregar foto y reporte al terminar.

7. Confidencialidad y propiedad de la cartera. La cartera de clientes pertenece a Perrones Cuu. Está prohibido extraer, copiar, compartir o reutilizar información de los clientes para fines personales o de terceros.

Al aceptar, confirmas que has leído y estás de acuerdo con este contrato (versión ${CONTRACT_VERSION}).`

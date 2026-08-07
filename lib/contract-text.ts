// v2 (ago 2026): se agregó la responsabilidad del dueño por daños de su perro
// y la identificación oficial. Las aceptaciones anteriores quedan guardadas
// como v1 en la tabla `contracts` — no se reescriben.
export const CONTRACT_VERSION = "v2"

export const CLIENT_CONTRACT = `CONTRATO DE PRESTACIÓN DE SERVICIOS — CLIENTE (DUEÑO)

1. Objeto. Perrones Cuu ("la Plataforma") presta el servicio de enlace y coordinación de paseos para tu perro con operadores (paseadores) verificados en Ciudad Chihuahua.

2. La marca. La Plataforma es responsable del servicio. Los paseos los realizan operadores asignados automáticamente por la Plataforma; el cliente no contrata directamente al paseador.

3. Pagos. El cliente paga a la Plataforma el precio del paquete elegido. La Plataforma coordina la compensación del operador.

4. Seguro. Cada paseo incluye una cobertura básica para tu perrito durante el servicio.

5. Cuidado responsable. El dueño declara que su perro cuenta con vacunas vigentes y describe con veracidad el temperamento y necesidades especiales del animal. En particular, se compromete a informar si el perro ha mordido o ha mostrado conductas agresivas antes.

6. Responsabilidad por daños. El dueño es el único responsable de los daños que su perro cause durante el paseo a terceros —incluyendo al paseador, a otras personas, a otros animales o a la propiedad ajena—, así como de los gastos médicos, veterinarios o de reparación que se deriven. La cobertura del punto 4 protege al perro durante el servicio; no cubre los daños que el perro ocasione. Omitir o falsear información sobre el temperamento del animal (punto 5) deja la responsabilidad enteramente del lado del dueño.

7. Identificación. Para dar de alta la cuenta, el dueño sube una identificación oficial vigente (INE, pasaporte o licencia). Se usa únicamente para verificar su identidad y respaldar el punto 6. Se guarda de forma privada, no se comparte con los paseadores ni con terceros, y se elimina si la cuenta se da de baja.

8. Cancelaciones. Podrás cancelar un paseo desde tu panel antes de que inicie.

9. Datos. Tus datos se usan únicamente para coordinar el servicio.

Al aceptar, confirmas que has leído y estás de acuerdo con este contrato (versión ${CONTRACT_VERSION}).`

export const WALKER_CONTRACT = `CONTRATO DE PRESTACIÓN DE SERVICIOS — PASEADOR (OPERADOR)

1. Objeto. El paseador presta servicios de paseo de perros a través de la Plataforma Perrones Cuu en Ciudad Chihuahua.

2. Relación con la marca. El paseador opera bajo la marca Perrones Cuu. No debe ofrecer servicios directos ni compartir datos de contacto con los clientes. Toda la comunicación ocurre dentro de la Plataforma.

3. AVISO DE PRIVACIDAD Y EXCLUSIVIDAD. Los datos de los clientes son confidenciales y propiedad exclusiva de Perrones Cuu. El paseador se compromete a NO contactar, ofrecer servicios o aceptar pagos directos de clientes conocidos a través de la plataforma, ya sea durante o después de la relación. El seguro para mascotas y la cobertura por incidentes SOLO aplican cuando el paseo se gestiona dentro de Perrones Cuu; cualquier servicio fuera de la plataforma queda sin protección y será causal de baja inmediata.

4. Compensación. La compensación por cada paseo será acordada directamente entre el paseador y Perrones Cuu fuera de la plataforma. El paseador no tiene acceso a los precios cobrados al cliente ni a información financiera de la plataforma.

5. Disponibilidad. El paseador define su zona y horarios; al aceptar un paseo se compromete a realizarlo.

6. Trato a los animales. El paseador se compromete a tratar a cada perro con cuidado, paciencia y responsabilidad, y a entregar foto y reporte al terminar.

7. Confidencialidad y propiedad de la cartera. La cartera de clientes pertenece a Perrones Cuu. Está prohibido extraer, copiar, compartir o reutilizar información de los clientes para fines personales o de terceros.

Al aceptar, confirmas que has leído y estás de acuerdo con este contrato (versión ${CONTRACT_VERSION}).`

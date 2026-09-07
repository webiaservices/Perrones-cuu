/**
 * Los flujos que un usuario de verdad recorre. Cada uno abre el navegador,
 * hace lo que haría una persona y revisa que la base cambió.
 *
 * Si agregas un flujo: primero córrelo contra el código ROTO y comprueba que
 * falla. Una prueba que pasa siempre es peor que no tener prueba.
 */
import { hacerBitacora, fotoDePrueba } from "./lib.mjs"

/**
 * Pica hasta que la pantalla reaccione.
 *
 * React tarda alrededor de un segundo en enganchar los botones después de que
 * la página carga (hidratación). Un clic antes de eso se pierde sin dejar
 * rastro, en local y en producción por igual. Esto NO es un bug de la app,
 * pero sí hace que una prueba rápida falle de mentiras.
 */
async function clicHastaQueReaccione(pg, locator, seNota, intentos = 6) {
  for (let i = 0; i < intentos; i++) {
    await locator.click().catch(() => {})
    await pg.waitForTimeout(500)
    if (await seNota()) return true
  }
  return false
}

/** Ningún control que le pida algo al usuario debe estar apagado y mudo. */
async function sinBotonesMuertos(pg, b, donde) {
  const apagados = await pg.locator("button:disabled:visible").allTextContents()
  // "Guardando…" / "Subiendo…" se explican solos: solo cuentan los otros
  const mudos = apagados.map((t) => t.trim()).filter((t) => t && !/…|\.\.\./.test(t))
  if (mudos.length === 0) b.ok(`${donde}: ningún botón apagado sin explicar`)
  else b.falla(`${donde}: botones apagados sin decir qué falta`, JSON.stringify(mudos))
}

/**
 * FLUJO 1 — Un cliente de los de antes sube su identificación.
 *
 * Este es el que Endy reportó como "no deja apretar el botón". El botón estaba
 * deshabilitado hasta elegir archivo y no lo decía en ningún lado.
 */
export async function subirIdentificacion({ nav, base, db, crearCuenta, borrarCuenta, capturas }) {
  const b = hacerBitacora("Subir identificación (cliente)")
  const cuenta = await crearCuenta(db, { role: "dueno", conIdentificacion: false })
  const ctx = await nav.newContext({ viewport: { width: 1280, height: 900 } })
  const pg = await ctx.newPage()
  const errores = []
  pg.on("pageerror", (e) => errores.push(e.message))

  try {
    await pg.goto(`${base}/login`, { waitUntil: "networkidle" })
    await pg.fill('input[type="email"]', cuenta.email)
    await pg.fill('input[type="password"]', cuenta.password)
    await Promise.all([
      pg.waitForURL((u) => u.pathname.startsWith("/panel"), { timeout: 30000 }),
      pg.click('button[type="submit"]'),
    ])
    b.ok("Entra a su panel")

    await pg.locator("text=Nos falta su identificación").waitFor({ timeout: 10000 })
    b.ok("Le piden la identificación")
    await pg.screenshot({ path: `${capturas}/flujo-ine-1-antes.png` })

    await sinBotonesMuertos(pg, b, "Panel del cliente")

    const elegir = pg.getByText("Elegir la foto", { exact: true })
    await elegir.waitFor({ timeout: 6000 })
    const [selector] = await Promise.all([
      pg.waitForEvent("filechooser", { timeout: 8000 }).catch(() => null),
      elegir.click(),
    ])
    if (!selector) throw new Error('El botón "Elegir la foto" no abrió el selector de archivos')
    b.ok("El botón abre el selector de archivos")
    await selector.setFiles(fotoDePrueba(`${capturas}/ine-prueba.jpg`))

    const subir = pg.getByRole("button", { name: "Subir identificación" })
    await subir.waitFor({ timeout: 8000 })
    if (!(await subir.isEnabled())) throw new Error('"Subir identificación" salió apagado')
    b.ok("Con la foto puesta, el botón de subir está prendido")

    const verNombre = await pg.locator("text=ine-prueba.jpg").count()
    verNombre > 0 ? b.ok("Le enseña qué archivo eligió") : b.falla("No le enseña qué archivo eligió")

    const [resp] = await Promise.all([
      pg.waitForResponse((r) => r.url().includes("/api/subir-identificacion"), { timeout: 30000 }),
      subir.click(),
    ])
    const cuerpo = await resp.json().catch(() => ({}))
    resp.status() === 200
      ? b.ok("El servidor la acepta", `HTTP 200 ${JSON.stringify(cuerpo)}`)
      : b.falla("El servidor la rechaza", `HTTP ${resp.status()} ${JSON.stringify(cuerpo)}`)

    ;(await pg.locator("text=¡Listo!").count()) > 0
      ? b.ok("Le avisa en pantalla que quedó")
      : b.falla("Sube pero no le avisa nada")

    const { data: perfil } = await db
      .from("profiles")
      .select("id_document_path")
      .eq("id", cuenta.id)
      .single()
    perfil?.id_document_path
      ? b.ok("Quedó guardada en la base", perfil.id_document_path)
      : b.falla("Dijo que sí pero la base sigue vacía")

    await pg.reload({ waitUntil: "networkidle" })
    ;(await pg.locator("text=Nos falta su identificación").count()) === 0
      ? b.ok("Al recargar ya no se la vuelve a pedir")
      : b.falla("Se la sigue pidiendo después de subirla")

    await pg.screenshot({ path: `${capturas}/flujo-ine.png` })
    errores.length === 0 ? b.ok("Sin errores de JavaScript") : b.falla("Errores de JavaScript", errores.slice(0, 3).join(" | "))
  } catch (e) {
    b.falla("Se rompió a media prueba", e.message)
    await pg.screenshot({ path: `${capturas}/flujo-ine-ERROR.png` }).catch(() => {})
  } finally {
    await ctx.close()
    await borrarCuenta(db, cuenta)
  }
  return b.pasos
}

/**
 * FLUJO 2 — Un cliente nuevo se registra desde cero.
 *
 * Si aquí se atora, no hay cliente. Sube identificación, acepta contrato y
 * aviso de privacidad en la misma pantalla.
 */
export async function registrarse({ nav, base, db, borrarCuenta, capturas }) {
  const b = hacerBitacora("Registrarse (cliente nuevo)")
  const sello = `${Date.now()}${Math.floor(Math.random() * 1000)}`
  const email = `prueba-webia-${sello}@example.com`
  const ctx = await nav.newContext({ viewport: { width: 1280, height: 1000 } })
  const pg = await ctx.newPage()
  let creada = null
  const errores = []
  pg.on("pageerror", (e) => errores.push(e.message))

  try {
    await pg.goto(`${base}/signup`, { waitUntil: "networkidle" })
    b.ok("Abre la página de registro")

    await sinBotonesMuertos(pg, b, "Registro")

    await pg.fill("#fullName", "PRUEBA WEBIA - BORRAR").catch(() => {})
    await pg.fill("#phone", "6140000000").catch(() => {})
    await pg.fill("#email", email)
    await pg.fill("#password", `Prueba-${sello}-Ax!`)
    await pg.setInputFiles("#idFile", fotoDePrueba(`${capturas}/ine-prueba.jpg`))
    b.ok("Llena sus datos y adjunta identificación")

    // Contrato y privacidad: son casillas obligatorias
    const casillas = pg.locator('button[role="checkbox"], input[type="checkbox"]')
    const n = await casillas.count()
    for (let i = 0; i < n; i++) await casillas.nth(i).click({ timeout: 3000 }).catch(() => {})
    b.ok(`Acepta lo obligatorio (${n} casillas)`)

    await pg.getByRole("button", { name: /crear cuenta|registrar/i }).first().click()
    await pg.waitForTimeout(6000)

    const { data: perfil } = await db
      .from("profiles")
      .select("id, role, id_document_path")
      .eq("email", email)
      .maybeSingle()

    if (!perfil) {
      const enPantalla = await pg.locator("body").innerText()
      b.falla("No se creó la cuenta", enPantalla.slice(0, 240).replace(/\s+/g, " "))
    } else {
      creada = { id: perfil.id, email }
      b.ok("La cuenta quedó creada", `role=${perfil.role}`)
      perfil.role === "dueno"
        ? b.ok("Entró con el rol correcto (dueno)")
        : b.falla("Rol equivocado al registrarse", String(perfil.role))
      perfil.id_document_path
        ? b.ok("Su identificación quedó guardada")
        : b.falla("Se registró SIN identificación aunque la adjuntó")
    }
    await pg.screenshot({ path: `${capturas}/flujo-registro.png` })
    errores.length === 0 ? b.ok("Sin errores de JavaScript") : b.falla("Errores de JavaScript", errores.slice(0, 3).join(" | "))
  } catch (e) {
    b.falla("Se rompió a media prueba", e.message)
    await pg.screenshot({ path: `${capturas}/flujo-registro-ERROR.png` }).catch(() => {})
  } finally {
    await ctx.close()
    if (creada) await borrarCuenta(db, creada).catch((e) => console.log("  ! " + e.message))
  }
  return b.pasos
}

/**
 * FLUJO 3 — El paseador entra a su panel y ve lo suyo.
 */
export async function panelDelPaseador({ nav, base, db, crearCuenta, borrarCuenta, capturas }) {
  const b = hacerBitacora("Panel del paseador")
  const cuenta = await crearCuenta(db, { role: "paseador", conIdentificacion: true })
  const ctx = await nav.newContext({ viewport: { width: 1280, height: 900 } })
  const pg = await ctx.newPage()
  const errores = []
  pg.on("pageerror", (e) => errores.push(e.message))

  try {
    await pg.goto(`${base}/login`, { waitUntil: "networkidle" })
    await pg.fill('input[type="email"]', cuenta.email)
    await pg.fill('input[type="password"]', cuenta.password)
    await Promise.all([
      pg.waitForURL((u) => u.pathname.startsWith("/panel"), { timeout: 30000 }),
      pg.click('button[type="submit"]'),
    ])
    b.ok("Entra a su panel")

    const texto = await pg.locator("body").innerText()
    // el punto y coma va a fuerza: sin él, JS lee la diagonal como división
    ;/paseo/i.test(texto) ? b.ok("Ve su pantalla de paseos") : b.falla("Su panel salió vacío")

    await sinBotonesMuertos(pg, b, "Panel del paseador")

    await pg.screenshot({ path: `${capturas}/flujo-paseador.png` })
    errores.length === 0 ? b.ok("Sin errores de JavaScript") : b.falla("Errores de JavaScript", errores.slice(0, 3).join(" | "))
  } catch (e) {
    b.falla("Se rompió a media prueba", e.message)
    await pg.screenshot({ path: `${capturas}/flujo-paseador-ERROR.png` }).catch(() => {})
  } finally {
    await ctx.close()
    await borrarCuenta(db, cuenta)
  }
  return b.pasos
}


/**
 * FLUJO 4 — Recuperar la contraseña.
 *
 * Antes no existía: quien la olvidaba se quedaba fuera para siempre, porque
 * tampoco podía volver a registrarse con el mismo correo.
 */
export async function recuperarContrasena({ nav, base, db, crearCuenta, borrarCuenta, capturas }) {
  const b = hacerBitacora("Recuperar contraseña")
  const cuenta = await crearCuenta(db, { role: "dueno", conIdentificacion: true })
  const ctx = await nav.newContext({ viewport: { width: 1280, height: 900 } })
  const pg = await ctx.newPage()

  try {
    await pg.goto(`${base}/login`, { waitUntil: "networkidle" })
    const liga = pg.getByText("¿Olvidaste tu contraseña?", { exact: true })
    await liga.waitFor({ timeout: 8000 })
    b.ok("La liga está en la pantalla de entrar")

    await liga.click()
    await pg.waitForURL((u) => u.pathname === "/olvide", { timeout: 10000 })
    b.ok("Lleva a la pantalla de recuperar")

    await sinBotonesMuertos(pg, b, "Recuperar contraseña")

    // OJO: el envío de verdad NO se prueba aquí. Supabase rechaza los correos
    // @example.com de las cuentas de prueba, y mandar correos reales quemaría
    // el cupo del plan gratis. Lo que sí se prueba es que la pantalla nunca
    // deje a la persona sin saber qué pasó.
    await pg.fill('input[type="email"]', cuenta.email)
    await pg.getByRole("button", { name: /Mandarme el enlace/i }).click()
    await pg.waitForTimeout(3500)
    const trasEnviar = await pg.locator("body").innerText()
    if (/ya le llegó un correo/i.test(trasEnviar)) {
      b.ok("Le confirma que le mandó el enlace")
    } else if (/no se ve bien escrito|Espere un minuto|Revise su internet/i.test(trasEnviar)) {
      b.ok("Le explica qué pasó en vez de quedarse mudo", trasEnviar.match(/[^.]*(?:escrito|minuto|internet)[^.]*\./)?.[0]?.trim() ?? "")
    } else {
      b.falla("Ni confirma ni explica: la persona se queda sin saber", trasEnviar.slice(0, 160).replace(/\s+/g, " "))
    }

    // Entrar sin el enlace NO debe dejar un formulario muerto
    await pg.goto(`${base}/nueva-contrasena`, { waitUntil: "networkidle" })
    await pg.waitForTimeout(2500)
    const texto = await pg.locator("body").innerText()
    // punto y coma obligatorio: si no, JS lee la diagonal como división
    ;/venció|vencio|Pedir uno nuevo/i.test(texto)
      ? b.ok("Sin enlace le explica que venció, no le deja un formulario muerto")
      : b.falla("Entrando sin enlace no explica nada", texto.slice(0, 140).replace(/\s+/g, " "))

    await pg.screenshot({ path: `${capturas}/flujo-olvide.png` })
  } catch (e) {
    b.falla("Se rompió a media prueba", e.message)
    await pg.screenshot({ path: `${capturas}/flujo-olvide-ERROR.png` }).catch(() => {})
  } finally {
    await ctx.close()
    await borrarCuenta(db, cuenta)
  }
  return b.pasos
}

/**
 * FLUJO 5 — El precio que ve el cliente es el que se le va a cobrar.
 *
 * La pantalla de reservar leía la matriz quemada en el código mientras el
 * servidor cobraba lo que dice la tabla `precios`, que Endy edita desde su
 * panel. El día que subiera un precio, el cliente habría visto uno y pagado
 * otro. Esta prueba compara los dos números.
 */
export async function precioQueSeVeEsElQueSeCobra({ nav, base, db, crearCuenta, borrarCuenta, capturas }) {
  const b = hacerBitacora("El precio que se ve es el que se cobra")
  const cuenta = await crearCuenta(db, { role: "dueno", conIdentificacion: true })
  const ctx = await nav.newContext({ viewport: { width: 1280, height: 1000 } })
  const pg = await ctx.newPage()

  try {
    // Lo que el servidor le cobraría: plan "dia", 1 perro, su ciudad
    const { data: perfil } = await db.from("profiles").select("city").eq("id", cuenta.id).maybeSingle()
    const ciudad = perfil?.city === "cdmx" ? "cdmx" : "chihuahua"
    const { data: filas } = await db
      .from("precios")
      .select("plan_name, dogs, price_mxn")
      .eq("city", ciudad)
      .eq("dogs", 1)
    b.ok(`Leí la lista de precios de la base (${ciudad})`, `${filas?.length ?? 0} renglones`)

    await pg.goto(`${base}/login`, { waitUntil: "networkidle" })
    await pg.fill('input[type="email"]', cuenta.email)
    await pg.fill('input[type="password"]', cuenta.password)
    await Promise.all([
      pg.waitForURL((u) => u.pathname.startsWith("/panel"), { timeout: 30000 }),
      pg.click('button[type="submit"]'),
    ])

    // El precio se pinta hasta el paso 3, y para llegar hace falta un perro.
    const { data: perro } = await db
      .from("dogs")
      .insert({ owner_id: cuenta.id, name: "Prueba", size: "mediano" })
      .select()
      .single()

    await pg.goto(`${base}/reservar?plan=dia&dogs=1`, { waitUntil: "networkidle" })
    await pg.waitForTimeout(1200)
    // paso 1: elegir el perro
    const tarjetaPerro = pg.locator("button").filter({ hasText: "Prueba" }).first()
    const quedoSeleccionado = async () =>
      /\d+ seleccionad/i.test(await pg.locator("body").innerText())
    if (!(await clicHastaQueReaccione(pg, tarjetaPerro, quedoSeleccionado))) {
      throw new Error("No se pudo seleccionar el perro en el paso 1")
    }
    b.ok("Selecciona su perrito")

    await pg.getByRole("button", { name: /Siguiente/i }).click()
    await pg.waitForTimeout(800)
    if (/Selecciona al menos un perro/i.test(await pg.locator("body").innerText())) {
      throw new Error("El paso 1 no dejó avanzar aunque el perro estaba seleccionado")
    }
    // paso 2: fecha, hora, zona y dirección
    // La fecha y la hora ya vienen con valor por defecto; falta zona y dirección.
    await pg.locator("#pickupAddress").fill("Calle de prueba 123")
    const zona = pg.locator('button[role="combobox"]').filter({ hasText: /zona/i }).first()
    const zonaElegida = async () => !/Selecciona tu zona/i.test(await pg.locator("body").innerText())
    await clicHastaQueReaccione(
      pg,
      zona,
      async () => (await pg.getByRole("option").count()) > 0,
    )
    await pg.getByRole("option").first().click()
    await pg.waitForTimeout(400)
    ;(await zonaElegida()) ? b.ok("Elige su zona") : b.falla("No se pudo elegir la zona")

    await pg.getByRole("button", { name: /Siguiente/i }).click()
    await pg.waitForTimeout(1000)
    const enPaso2 = /Llena fecha, horario, zona/i.test(await pg.locator("body").innerText())
    if (enPaso2) throw new Error("El paso 2 no dejó avanzar aunque estaba lleno")

    const cuerpo = await pg.locator("body").innerText()
    const m = cuerpo.match(/MX\$\s?([\d,]+)/)
    if (!m) {
      b.falla("No encontré el precio en la pantalla de reservar")
    } else {
      const enPantalla = Number(m[1].replace(/,/g, ""))
      const dia = (filas ?? []).find((f) => /d[ií]a/i.test(f.plan_name))
      if (!dia) {
        b.ok("La tabla `precios` no tiene ese plan: la pantalla usa el respaldo del código", `en pantalla $${enPantalla}`)
      } else if (enPantalla === dia.price_mxn) {
        b.ok("Coinciden el precio de la pantalla y el de la base", `$${enPantalla}`)
      } else {
        b.falla(
          "El cliente ve un precio y se le cobraría otro",
          `pantalla $${enPantalla} vs base $${dia.price_mxn}`,
        )
      }
    }
    await pg.screenshot({ path: `${capturas}/flujo-precio.png` })
  } catch (e) {
    b.falla("Se rompió a media prueba", e.message)
    await pg.screenshot({ path: `${capturas}/flujo-precio-ERROR.png` }).catch(() => {})
  } finally {
    await ctx.close()
    await borrarCuenta(db, cuenta)
  }
  return b.pasos
}

export const FLUJOS = [
  subirIdentificacion,
  registrarse,
  panelDelPaseador,
  recuperarContrasena,
  precioQueSeVeEsElQueSeCobra,
]

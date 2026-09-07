/**
 * Piezas compartidas de las pruebas de funcionamiento.
 *
 * La regla de estas pruebas: NO leen código, USAN la página. Abren un navegador
 * de verdad, se meten con una cuenta de verdad, pican los botones y revisan que
 * la base de datos haya cambiado. Una prueba que pasa con el código roto no
 * sirve: cada flujo de aquí se probó primero contra la versión con el bug.
 */
import fs from "node:fs"
import { createRequire } from "node:module"

/** Playwright vive instalado global (brew), no como dependencia del proyecto. */
export async function abrirPlaywright() {
  const rutas = [
    "/opt/homebrew/lib/node_modules/playwright/index.js",
    "/usr/local/lib/node_modules/playwright/index.js",
  ]
  for (const r of rutas) {
    if (fs.existsSync(r)) return (await import(r)).default
  }
  try {
    return createRequire(import.meta.url)("playwright")
  } catch {
    throw new Error(
      "Falta Playwright. Instálalo con:  brew install playwright  (o npm i -g playwright)",
    )
  }
}

export function leerEnv(archivo = ".env.local") {
  const txt = fs.readFileSync(archivo, "utf8")
  return Object.fromEntries(
    txt
      .split("\n")
      .filter((l) => l.includes("=") && !l.trimStart().startsWith("#"))
      .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]),
  )
}

export async function conectarBase() {
  const env = leerEnv()
  const { createClient } = await import("@supabase/supabase-js")
  if (!env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("Falta SUPABASE_SERVICE_ROLE_KEY en .env.local")
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

/**
 * Cuenta desechable. El correo lleva marca de tiempo para que dos corridas no
 * choquen, y el nombre grita que es de prueba por si alguna se queda viva.
 */
export async function crearCuenta(db, { role = "dueno", conIdentificacion = false } = {}) {
  const sello = `${Date.now()}${Math.floor(Math.random() * 1000)}`
  const email = `prueba-webia-${sello}@example.com`
  const password = `Prueba-${sello}-Ax!`
  const { data, error } = await db.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: "PRUEBA WEBIA - BORRAR", role, phone: "6140000000" },
  })
  if (error) throw new Error(`No se pudo crear la cuenta de prueba: ${error.message}`)
  const id = data.user.id
  await db
    .from("profiles")
    .update({ id_document_path: conIdentificacion ? `${id}/identificacion.jpg` : null })
    .eq("id", id)
  return { id, email, password }
}

/** Se borra por ID, nunca por patrón: borrar "todo lo que empiece con prueba"
 *  es como se tumban datos del cliente. */
export async function borrarCuenta(db, cuenta) {
  const { data: archivos } = await db.storage.from("identificaciones").list(cuenta.id)
  if (archivos?.length) {
    await db.storage.from("identificaciones").remove(archivos.map((a) => `${cuenta.id}/${a.name}`))
  }
  await db.from("reservations").delete().eq("user_id", cuenta.id)
  await db.from("dogs").delete().eq("owner_id", cuenta.id)
  await db.from("reviews").delete().eq("owner_id", cuenta.id)
  await db.from("contracts").delete().eq("user_id", cuenta.id)
  await db.from("profiles").delete().eq("id", cuenta.id)
  const { error } = await db.auth.admin.deleteUser(cuenta.id)
  if (error) throw new Error(`OJO: quedó viva la cuenta ${cuenta.email} (${cuenta.id}): ${error.message}`)
}

export function hacerBitacora(nombreFlujo) {
  const pasos = []
  return {
    pasos,
    ok(q, d = "") {
      pasos.push({ flujo: nombreFlujo, paso: q, resultado: "PASA", detalle: d })
      console.log(`  ✓ ${q}${d ? `  — ${d}` : ""}`)
    },
    falla(q, d = "") {
      pasos.push({ flujo: nombreFlujo, paso: q, resultado: "FALLA", detalle: d })
      console.log(`  ✗ ${q}${d ? `  — ${d}` : ""}`)
    },
  }
}

/** Una foto JPEG de verdad, del tamaño de la que mandaría un cliente. */
export function fotoDePrueba(ruta) {
  if (fs.existsSync(ruta)) return ruta
  const b64 =
    "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0a" +
    "HBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIy" +
    "MjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAAgACADASIA" +
    "AhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQA" +
    "AAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3" +
    "ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWm" +
    "p6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEA" +
    "AwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSEx" +
    "BhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElK" +
    "U1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3" +
    "uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD3+iii" +
    "gD//2Q=="
  fs.writeFileSync(ruta, Buffer.from(b64, "base64"))
  return ruta
}

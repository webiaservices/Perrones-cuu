#!/usr/bin/env node
/**
 * Corre todos los flujos contra una página que esté viva.
 *
 *   npm run probar                        # contra el servidor local (3213)
 *   BASE=https://perronescuu.com npm run probar
 *
 * Crea sus propias cuentas desechables y LAS BORRA al terminar, cada una por su
 * ID. Si alguna se queda viva lo grita al final: una cuenta "PRUEBA WEBIA -
 * BORRAR" suelta en la base es basura que Endy va a ver en su panel.
 */
import fs from "node:fs"
import { abrirPlaywright, conectarBase, crearCuenta, borrarCuenta } from "./lib.mjs"
import { FLUJOS } from "./flujos.mjs"

const base = (process.env.BASE ?? "http://localhost:3213").replace(/\/$/, "")
const capturas = process.env.CAPTURAS ?? "pruebas/capturas"
fs.mkdirSync(capturas, { recursive: true })

console.log(`\nProbando ${base}\n${"─".repeat(50)}`)

const pw = await abrirPlaywright()
const db = await conectarBase()
const nav = await pw.chromium.launch({ headless: process.env.VER !== "1" })

const todos = []
for (const flujo of FLUJOS) {
  console.log(`\n▸ ${flujo.name}`)
  try {
    const pasos = await flujo({ nav, base, db, crearCuenta, borrarCuenta, capturas })
    todos.push(...pasos)
  } catch (e) {
    todos.push({ flujo: flujo.name, paso: "no arrancó", resultado: "FALLA", detalle: e.message })
    console.log(`  ✗ no arrancó — ${e.message}`)
  }
}
await nav.close()

// Red de seguridad: que no quede ninguna cuenta de prueba viva
const { data: sobrantes } = await db
  .from("profiles")
  .select("id, email")
  .eq("full_name", "PRUEBA WEBIA - BORRAR")
if (sobrantes?.length) {
  console.log(`\n⚠️  QUEDARON ${sobrantes.length} CUENTAS DE PRUEBA VIVAS — bórralas:`)
  sobrantes.forEach((s) => console.log(`   ${s.id}  ${s.email}`))
}

const fallas = todos.filter((p) => p.resultado === "FALLA")
fs.writeFileSync(`${capturas}/resultado.json`, JSON.stringify({ base, pasos: todos }, null, 2))

console.log(`\n${"─".repeat(50)}`)
console.log(`${todos.length - fallas.length}/${todos.length} pasos pasaron`)
if (fallas.length) {
  console.log(`\nLO QUE FALLA:`)
  fallas.forEach((f) => console.log(`  ✗ [${f.flujo}] ${f.paso}${f.detalle ? ` — ${f.detalle}` : ""}`))
}
console.log(`\nCapturas y detalle en ${capturas}/\n`)
process.exit(fallas.length ? 1 : 0)

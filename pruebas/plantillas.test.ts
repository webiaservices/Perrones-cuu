/**
 * Lo que va dentro de cada {{n}} de una plantilla de WhatsApp. Sin base ni red.
 * Correr:  node --test pruebas/plantillas.test.ts
 *
 * WhatsApp no acepta saltos de línea, tabuladores ni más de 4 espacios seguidos
 * dentro de una variable. Si llegan, Twilio no puede mandarla como plantilla,
 * la manda como texto libre y Meta la rebota con 63016. Así se perdieron los
 * datos del dueño de paseador_acepta en octubre de 2026: la lista de días de un
 * paquete iba un día por renglón.
 */
import { test } from "node:test"
import assert from "node:assert/strict"
import { variableDePlantilla } from "../lib/whatsapp-plantillas.ts"

const prohibido = /[\n\r\t]| {5,}/

test("la lista de días de un paquete sale en un solo renglón", () => {
  const dias = [
    "lunes, 6 de octubre, 09:00 a.m.",
    "martes, 7 de octubre, 09:00 a.m.",
    "miércoles, 8 de octubre, 09:00 a.m.",
  ].join("\n")
  const v = variableDePlantilla(dias)
  assert.doesNotMatch(v, prohibido)
  assert.equal(
    v,
    "lunes, 6 de octubre, 09:00 a.m. · martes, 7 de octubre, 09:00 a.m. · miércoles, 8 de octubre, 09:00 a.m.",
  )
})

test("domicilio capturado con Enter, tabuladores y espacios de más", () => {
  const v = variableDePlantilla("Calle 5 #123\r\nCol. Centro\t\tcasa azul      portón negro")
  assert.doesNotMatch(v, prohibido)
  assert.equal(v, "Calle 5 #123 · Col. Centro casa azul portón negro")
})

test("renglones vacíos no dejan separadores sueltos", () => {
  assert.equal(variableDePlantilla("\n\nA\n \n\nB\n"), "A · B")
})

test("lo que ya venía en un renglón no cambia", () => {
  assert.equal(variableDePlantilla("Juan Pérez"), "Juan Pérez")
  assert.equal(variableDePlantilla("614 123 4567"), "614 123 4567")
  assert.equal(variableDePlantilla(""), "")
})

"use client"

import { Download } from "lucide-react"
import { Button } from "@/components/ui/button"

/**
 * "Descargar PDF" = imprimir a PDF del navegador.
 *
 * Se hace así a propósito y no generando un PDF en el servidor: en el celular
 * un PDF se descarga y muchas veces no se abre, mientras que esta página sí se
 * ve de inmediato al tocar el enlace de WhatsApp. Quien de verdad quiere el
 * archivo lo obtiene aquí — en iOS y Android el diálogo de impresión ofrece
 * "Guardar como PDF".
 */
export function BotonImprimirManual() {
  return (
    <Button
      onClick={() => window.print()}
      variant="outline"
      className="rounded-full font-bold"
    >
      <Download className="mr-2 h-4 w-4" />
      Descargar PDF
    </Button>
  )
}

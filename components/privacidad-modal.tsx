"use client"

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Button } from "@/components/ui/button"
import { AvisoPrivacidadContenido } from "@/components/aviso-privacidad"

/**
 * El aviso de privacidad en ventana emergente.
 *
 * Va aparte del contrato porque aquí no se acepta nada: solo se lee. Y se abre
 * encima del registro en vez de mandar a /privacidad, porque salir de la página
 * a media alta significa perder lo que ya se había escrito.
 */
export function PrivacidadModal({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Aviso de privacidad</DialogTitle>
          <DialogDescription>Cómo cuidamos tus datos y los de tu perrito.</DialogDescription>
        </DialogHeader>
        <ScrollArea className="h-72 rounded-2xl border border-border bg-muted/40 p-4">
          <div className="prose prose-sm max-w-none text-sm leading-relaxed text-foreground/90">
            <AvisoPrivacidadContenido compacto />
          </div>
        </ScrollArea>
        <Button variant="outline" className="w-full rounded-full font-bold" onClick={() => onOpenChange(false)}>
          Cerrar
        </Button>
      </DialogContent>
    </Dialog>
  )
}

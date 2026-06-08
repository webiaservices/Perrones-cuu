"use client"

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Button } from "@/components/ui/button"

export function ContractModal({
  open,
  onOpenChange,
  title,
  text,
  onAccept,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  title: string
  text: string
  onAccept: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>Léelo con calma antes de aceptar.</DialogDescription>
        </DialogHeader>
        <ScrollArea className="h-72 rounded-2xl border border-border bg-muted/40 p-4">
          <p className="whitespace-pre-line text-sm leading-relaxed text-foreground">{text}</p>
        </ScrollArea>
        <Button
          className="w-full rounded-full font-bold"
          onClick={() => {
            onAccept()
            onOpenChange(false)
          }}
        >
          Acepto el contrato
        </Button>
      </DialogContent>
    </Dialog>
  )
}

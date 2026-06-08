"use client"

import { useState } from "react"
import Link from "next/link"
import { Check, ShieldCheck } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { PLANS, PLAN_FEATURES, priceForDogs } from "@/lib/constants"

export function PricingSection() {
  const [dogs, setDogs] = useState("1")
  const dogCount = Number(dogs)

  return (
    <section id="precios" className="px-4 py-16 md:py-24">
      <div className="mx-auto max-w-5xl">
        <div className="mx-auto mb-10 max-w-2xl text-center">
          <h2 className="text-pretty text-3xl font-extrabold tracking-tight md:text-4xl">Paquetes claros y justos</h2>
          <p className="mt-3 text-muted-foreground leading-relaxed">
            Elige cuántos perros pasea Perrones Cuu y mira el precio al instante. Todo incluye seguro para tu perrito.
          </p>
        </div>

        <div className="mb-10 flex justify-center">
          <Tabs value={dogs} onValueChange={setDogs}>
            <TabsList className="h-12 rounded-full bg-secondary p-1">
              <TabsTrigger value="1" className="rounded-full px-5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                1 perro
              </TabsTrigger>
              <TabsTrigger value="2" className="rounded-full px-5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                2 perros
              </TabsTrigger>
              <TabsTrigger value="3" className="rounded-full px-5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                3 perros
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {PLANS.map((plan) => {
            const popular = plan.badge === "Popular"
            const price = priceForDogs(plan, dogCount)
            return (
              <div
                key={plan.id}
                className={cn(
                  "relative flex flex-col rounded-2xl border bg-card p-5 shadow-sm transition-all hover:-translate-y-1 hover:shadow-md",
                  popular ? "border-primary ring-2 ring-primary/30" : "border-border",
                )}
              >
                {plan.badge && (
                  <Badge
                    className={cn(
                      "absolute -top-3 left-1/2 -translate-x-1/2 rounded-full px-3 py-0.5 text-xs",
                      popular ? "bg-primary text-primary-foreground" : "bg-accent text-accent-foreground",
                    )}
                  >
                    {plan.badge}
                  </Badge>
                )}
                <h3 className="text-base font-bold leading-tight">{plan.name}</h3>
                <p className="text-xs text-muted-foreground">{plan.walks}</p>
                <div className="mt-3 flex items-end gap-1">
                  <span className="text-3xl font-extrabold tracking-tight">${price}</span>
                  <span className="mb-1 text-xs text-muted-foreground">MXN</span>
                </div>
                {dogCount > 1 && (
                  <p className="mt-0.5 text-[11px] text-muted-foreground">para {dogCount} perros</p>
                )}
                <ul className="mt-5 flex flex-1 flex-col gap-2">
                  {PLAN_FEATURES.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-xs">
                      <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
                <Button
                  asChild
                  variant={popular ? "default" : "secondary"}
                  className="mt-5 w-full rounded-full font-bold"
                >
                  <Link href={`/reservar?plan=${plan.id}&dogs=${dogCount}`}>Reservar</Link>
                </Button>
              </div>
            )
          })}
        </div>

        <p className="mt-8 flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <ShieldCheck className="h-4 w-4 text-primary" />
          Cada paseo incluye seguro para tu perrito.
        </p>
      </div>
    </section>
  )
}

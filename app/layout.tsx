import type { Metadata } from "next"
import { Nunito, Fraunces } from "next/font/google"
import { Analytics } from "@vercel/analytics/next"
import { Toaster } from "@/components/ui/sonner"
import "./globals.css"

const nunito = Nunito({
  subsets: ["latin"],
  variable: "--font-nunito",
  weight: ["400", "500", "600", "700", "800", "900"],
})

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["600", "700", "800", "900"],
})

export const metadata: Metadata = {
  title: "Perrones Cuu · Perros felices, dueños tranquilos",
  description:
    "Te enlazamos con paseadores certificados en Ciudad Chihuahua. Agenda el paseo de tu perro a un mensaje de distancia.",
  generator: "v0.app",
  manifest: "/manifest.json",
  themeColor: "#3DCABD",
  appleWebApp: {
    capable: true,
    title: "Perrones Cuu",
    statusBarStyle: "default",
  },
  icons: {
    icon: [
      { url: "/perrones-logo.png", type: "image/png" },
    ],
    apple: [
      { url: "/perrones-logo.png", sizes: "180x180", type: "image/png" },
      { url: "/apple-icon.png", sizes: "180x180", type: "image/png" },
    ],
    shortcut: "/perrones-logo.png",
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="es" className={`${nunito.variable} ${fraunces.variable} bg-background`}>
      <body className="font-sans antialiased">
        {children}
        <Toaster richColors position="top-center" />
        {process.env.NODE_ENV === "production" && <Analytics />}
      </body>
    </html>
  )
}

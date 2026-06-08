/* Logo: en la imagen original el círculo teal está descentrado (159px a la izquierda).
   objectPosition "44% 50%" lo recentra horizontalmente; scale 1.12 hace que el círculo
   llene el contenedor sin dejar sliver blanco. */
export function LogoCircle({ className = "" }: { className?: string }) {
  return (
    <span className={`block overflow-hidden rounded-full ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/perrones-logo.png"
        alt="Logotipo de Perrones Cuu"
        className="h-full w-full object-cover"
        style={{ transform: "scale(1.12)", objectPosition: "44% 50%" }}
      />
    </span>
  )
}

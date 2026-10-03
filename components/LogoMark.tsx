// The Unchore mascot: a friendly "U" holding a sparkle (the chore is done, the place is shiny).
export function LogoMark({ className = "size-6" }: { className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element -- tiny static SVG, nothing for the optimizer to do
  return <img src="/logo.svg" alt="" aria-hidden className={`inline-block ${className}`} />;
}

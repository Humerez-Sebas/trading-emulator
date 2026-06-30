import type { SVGProps } from "react"

/**
 * Custom "bounce forward" jump icon.
 * A forward arrow traveling over two smooth arches before landing —
 * suggesting skipping / jumping over multiple candles.
 * Drawn to feel native to Lucide (24x24 grid, 2px rounded strokes).
 */
export function JumpIcon({
  strokeWidth = 2,
  ...props
}: SVGProps<SVGSVGElement> & { strokeWidth?: number }) {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {/* baseline */}
      <path d="M3 19h18" opacity="0.35" />
      {/* double arch bounce trajectory */}
      <path d="M4 16c1.4-4 3-4 4.4 0" />
      <path d="M10.5 16c1.6-5.4 3.4-5.4 5 0" />
      {/* landing arrowhead */}
      <path d="M19.5 12.5 21 16l-3 1" />
    </svg>
  )
}

"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Popover } from "@base-ui/react/popover"
import { Menu } from "@base-ui/react/menu"
import {
  ChevronDown,
  GripVertical,
  Pause,
  Play,
  Plus,
  Minus,
  ChevronLeft,
  ChevronRight,
  Gauge,
} from "lucide-react"
import { JumpIcon } from "@/components/jump-icon"

const SPEED_OPTIONS = [1, 2, 5, 10, 25, 50] as const
const JUMP_OPTIONS = [1, 2, 3, 4, 5, 10, 20, 50] as const
const RESOLUTION_OPTIONS = ["Graph", "M1", "M5", "M15", "H1", "H4", "D1"] as const

type Resolution = (typeof RESOLUTION_OPTIONS)[number]

export function PlaybackController() {
  // ---- replay state (UI only) ----
  const [isPlaying, setIsPlaying] = useState(false)
  const [speed, setSpeed] = useState<number>(10)
  const [jump, setJump] = useState<number>(5)
  const [jumpOpen, setJumpOpen] = useState(false)
  const [resolution, setResolution] = useState<Resolution>("Graph")

  // ---- replay actions (UI only) ----
  const togglePlay = useCallback(() => setIsPlaying((p) => !p), [])
  // step a single candle backward/forward
  const step = useCallback((dir: -1 | 1) => {
    console.log("[v0] step", dir)
  }, [])
  // jump `jump` candles backward/forward
  const jumpBy = useCallback(
    (dir: -1 | 1) => {
      console.log("[v0] jump", dir * jump)
    },
    [jump],
  )

  // ---- keyboard shortcuts ----
  // Space = play/pause, ArrowLeft/Right = step 1, Shift+Arrow = jump N
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.isComposing || e.keyCode === 229) return
      const t = e.target as HTMLElement | null
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return

      if (e.code === "Space") {
        e.preventDefault()
        togglePlay()
      } else if (e.key === "ArrowLeft") {
        e.preventDefault()
        e.shiftKey ? jumpBy(-1) : step(-1)
      } else if (e.key === "ArrowRight") {
        e.preventDefault()
        e.shiftKey ? jumpBy(1) : step(1)
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [togglePlay, step, jumpBy])

  // ---- dragging ----
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  const [dragging, setDragging] = useState(false)
  const dragState = useRef<{ startX: number; startY: number; baseX: number; baseY: number }>({
    startX: 0,
    startY: 0,
    baseX: 0,
    baseY: 0,
  })

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault()
      ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
      const rect = (e.currentTarget.parentElement as HTMLElement).getBoundingClientRect()
      const base = pos ?? { x: rect.left, y: rect.top }
      dragState.current = { startX: e.clientX, startY: e.clientY, baseX: base.x, baseY: base.y }
      setDragging(true)
    },
    [pos],
  )

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragging) return
      const { startX, startY, baseX, baseY } = dragState.current
      setPos({ x: baseX + (e.clientX - startX), y: baseY + (e.clientY - startY) })
    },
    [dragging],
  )

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    ;(e.target as HTMLElement).releasePointerCapture?.(e.pointerId)
    setDragging(false)
  }, [])

  return (
    <div
      role="toolbar"
      aria-label="Replay playback controller"
      className="fixed z-50 flex h-[38px] items-center gap-1 rounded-full px-1.5 text-zinc-200 select-none"
      style={{
        ...(pos
          ? { left: pos.x, top: pos.y }
          : { left: "50%", bottom: "40px", transform: "translateX(-50%)" }),
        background: "rgba(24,24,24,0.75)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        border: "1px solid rgba(255,255,255,0.08)",
        boxShadow: "0 8px 30px rgba(0,0,0,.35), inset 0 1px rgba(255,255,255,.04)",
      }}
    >
      {/* 1. Drag handle */}
      <button
        type="button"
        aria-label="Drag controller"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        className={`flex h-7 w-5 items-center justify-center rounded-md text-zinc-500 transition-colors hover:text-zinc-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/70 ${
          dragging ? "cursor-grabbing" : "cursor-grab"
        }`}
      >
        <GripVertical className="h-4 w-4" />
      </button>

      {/* 2. Playback group: [-1] [Play/Pause] [+1] */}
      <div className="flex items-center gap-0.5">
        <SegBtn aria-label="Previous candle" className="font-mono" onClick={() => step(-1)}>
          <Minus className="h-3.5 w-3.5" />
          <span className="text-[11px] tabular-nums">1</span>
        </SegBtn>

        <button
          type="button"
          aria-label={isPlaying ? "Pause replay" : "Play replay"}
          aria-pressed={isPlaying}
          onClick={togglePlay}
          className="mx-0.5 flex h-8 w-8 items-center justify-center rounded-full bg-sky-500 text-white shadow-[0_2px_8px_rgba(14,165,233,.45)] transition-all duration-200 hover:bg-sky-400 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300"
        >
          {isPlaying ? (
            <Pause className="h-4 w-4 fill-current" />
          ) : (
            <Play className="h-4 w-4 translate-x-px fill-current" />
          )}
        </button>

        <SegBtn aria-label="Next candle" className="font-mono" onClick={() => step(1)}>
          <Plus className="h-3.5 w-3.5" />
          <span className="text-[11px] tabular-nums">1</span>
        </SegBtn>
      </div>

      {/* Speed selector */}
      <Menu.Root>
        <Menu.Trigger
          className="flex h-7 items-center gap-1 rounded-md px-2 text-zinc-300 transition-all duration-200 hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/70 data-[popup-open]:bg-white/[0.08]"
          aria-label={`Replay speed: ${speed} candles per second`}
        >
          <Gauge className="h-3.5 w-3.5 text-sky-400" />
          <span className="font-mono text-[12px] tabular-nums">{speed}</span>
          <span className="text-[10px] text-zinc-500">v/s</span>
          <ChevronDown className="h-3 w-3 text-zinc-500" />
        </Menu.Trigger>
        <Menu.Portal>
          <Menu.Positioner side="top" sideOffset={10} align="center" className="z-50">
            <Menu.Popup className={popupClass + " min-w-[120px] p-1"}>
              {SPEED_OPTIONS.map((s) => (
                <Menu.Item
                  key={s}
                  onClick={() => setSpeed(s)}
                  className={`flex cursor-pointer items-center justify-between gap-3 rounded-md px-2.5 py-1.5 text-[12px] outline-none transition-colors data-[highlighted]:bg-white/[0.07] ${
                    s === speed ? "text-sky-400" : "text-zinc-300"
                  }`}
                >
                  <span className="font-mono tabular-nums">{s}</span>
                  <span className="text-[10px] text-zinc-500">v/s</span>
                </Menu.Item>
              ))}
            </Menu.Popup>
          </Menu.Positioner>
        </Menu.Portal>
      </Menu.Root>

      <Divider />

      {/* 3. Jump group: [<] [Jump chip] [>] */}
      <div className="flex items-center gap-0.5">
        {/* moves N candles backward (of Graph main TF or selected replay resolution) */}
        <SegBtn aria-label="Jump backward" onClick={() => jumpBy(-1)}>
          <ChevronLeft className="h-4 w-4" />
        </SegBtn>

        <Popover.Root open={jumpOpen} onOpenChange={setJumpOpen}>
          <Popover.Trigger
            className="flex h-7 items-center gap-1 rounded-md px-2 text-zinc-200 transition-all duration-200 hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/70 data-[popup-open]:bg-white/[0.08]"
            aria-label={`Jump amount: ${jump} candles`}
          >
            <JumpIcon className="h-4 w-4 text-sky-400" />
            <span className="font-mono text-[12px] tabular-nums">{jump}</span>
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Positioner side="top" sideOffset={12} align="center" className="z-50">
              <Popover.Popup className={popupClass + " p-2"}>
                <div className="grid grid-cols-4 gap-1.5">
                  {JUMP_OPTIONS.map((j) => (
                    <button
                      key={j}
                      type="button"
                      aria-pressed={j === jump}
                      onClick={() => {
                        setJump(j)
                        setJumpOpen(false)
                      }}
                      className={`flex h-9 w-9 items-center justify-center rounded-lg font-mono text-[13px] tabular-nums transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300 ${
                        j === jump
                          ? "bg-sky-500 text-white shadow-[0_2px_8px_rgba(14,165,233,.4)]"
                          : "bg-white/[0.04] text-zinc-300 hover:bg-white/[0.1]"
                      }`}
                    >
                      {j}
                    </button>
                  ))}
                </div>
              </Popover.Popup>
            </Popover.Positioner>
          </Popover.Portal>
        </Popover.Root>

        {/* moves N candles forward */}
        <SegBtn aria-label="Jump forward" onClick={() => jumpBy(1)}>
          <ChevronRight className="h-4 w-4" />
        </SegBtn>
      </div>

      <Divider />

      {/* 4. Sub-timeframe (resolution) selector */}
      <Menu.Root>
        <Menu.Trigger
          className="flex h-7 items-center gap-1 rounded-md px-2.5 text-zinc-200 transition-all duration-200 hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/70 data-[popup-open]:bg-white/[0.08]"
          aria-label={`Replay resolution: ${resolution}`}
        >
          <span className="font-mono text-[12px] tabular-nums">{resolution}</span>
          <ChevronDown className="h-3 w-3 text-zinc-500" />
        </Menu.Trigger>
        <Menu.Portal>
          <Menu.Positioner side="top" sideOffset={10} align="center" className="z-50">
            <Menu.Popup className={popupClass + " min-w-[110px] p-1"}>
              {RESOLUTION_OPTIONS.map((r) => (
                <Menu.Item
                  key={r}
                  onClick={() => setResolution(r)}
                  className={`flex cursor-pointer items-center justify-between gap-3 rounded-md px-2.5 py-1.5 text-[12px] outline-none transition-colors data-[highlighted]:bg-white/[0.07] ${
                    r === resolution ? "text-sky-400" : "text-zinc-300"
                  }`}
                >
                  <span className="font-mono tabular-nums">{r}</span>
                  {r === "Graph" && <span className="text-[10px] text-zinc-500">main</span>}
                </Menu.Item>
              ))}
            </Menu.Popup>
          </Menu.Positioner>
        </Menu.Portal>
      </Menu.Root>
    </div>
  )
}

/* ---------- small reusable pieces ---------- */

function SegBtn({
  children,
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={`flex h-7 items-center justify-center gap-0.5 rounded-md px-1.5 text-zinc-300 transition-all duration-200 hover:bg-white/[0.06] active:scale-95 active:bg-white/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/70 ${className}`}
      {...props}
    >
      {children}
    </button>
  )
}

function Divider() {
  return <span className="mx-1 h-5 w-px bg-white/10" aria-hidden="true" />
}

const popupClass =
  "z-50 rounded-xl border border-white/10 bg-[rgba(24,24,24,0.9)] text-zinc-200 shadow-[0_12px_40px_rgba(0,0,0,.5)] backdrop-blur-xl origin-[var(--transform-origin)] transition-all duration-150 data-[starting-style]:scale-95 data-[starting-style]:opacity-0 data-[ending-style]:scale-95 data-[ending-style]:opacity-0"

import { PlaybackController } from "@/components/playback-controller"

export default function Page() {
  return (
    <main className="relative min-h-svh w-full overflow-hidden bg-[#0a0a0b]">
      {/* faux trading-chart backdrop so the floating HUD reads in context */}
      <div
        className="absolute inset-0 opacity-[0.5]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
        aria-hidden="true"
      />
      <div
        className="absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-sky-500/[0.06] to-transparent"
        aria-hidden="true"
      />

      <header className="relative z-10 px-8 pt-10">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-zinc-500">Replay HUD</p>
        <h1 className="mt-2 text-pretty text-lg font-medium text-zinc-300">Playback Controller</h1>
        <p className="mt-1 max-w-md text-pretty text-sm leading-relaxed text-zinc-500">
          A floating, draggable control surface for candle replay. Drag it by the grip, adjust
          speed, set a jump amount, and switch the replay resolution.
        </p>
      </header>

      <PlaybackController />
    </main>
  )
}

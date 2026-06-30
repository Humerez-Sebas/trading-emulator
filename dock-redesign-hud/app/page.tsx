"use client"

import { DockPanel } from "@/components/dock-panel"
import { useState } from "react"
import { TrendingUp, RefreshCw, BarChart2, X, Lightbulb } from "lucide-react"

export default function Home() {
  const [showNotification, setShowNotification] = useState(true)

  return (
    <div className="flex h-screen w-screen bg-[#07080a] overflow-hidden text-zinc-300 font-sans select-none">
      {/* 1. Left Side: Mock Trading Chart & Platform Layout */}
      <div className="flex flex-1 flex-col h-full overflow-hidden relative">
        {/* Top Navbar */}
        <header className="flex h-[45px] items-center justify-between border-b border-[#1f2229] bg-[#0c0d12] px-4">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 text-white font-bold text-[14px]">
              <div className="bg-[#2962FF] h-6 w-6 rounded flex items-center justify-center text-white text-[11px] font-mono">
                TE
              </div>
              <span>Trading Emulator</span>
            </div>
            <div className="h-4 w-[1px] bg-zinc-800" />
            {/* Asset badge */}
            <div className="flex items-center gap-1.5 bg-zinc-900 border border-zinc-800 px-2 py-0.5 rounded text-[11px] font-mono text-zinc-300">
              <span className="font-bold text-white">XAUUSD</span>
              <span className="text-[#26A69A]">M15</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[11px] text-[#787b86] font-mono">Sesión en progreso...</span>
            <div className="h-2.5 w-2.5 rounded-full bg-[#26A69A] animate-pulse" />
          </div>
        </header>

        {/* Mock Chart Area */}
        <div className="flex-1 bg-[#000000] relative p-6 flex flex-col justify-between">
          {/* Vertical/Horizontal Grid Lines */}
          <div className="absolute inset-0 grid grid-cols-6 grid-rows-6 opacity-[0.03] pointer-events-none">
            {Array.from({ length: 36 }).map((_, i) => (
              <div key={i} className="border-r border-b border-white" />
            ))}
          </div>

          {/* Floating HUD info */}
          <div className="z-10 flex gap-2">
            <div className="bg-[#0c0d12]/80 backdrop-blur border border-zinc-800/50 rounded-lg p-3 text-[11px] flex flex-col gap-1">
              <span className="text-zinc-500 uppercase">Instrumento</span>
              <span className="text-white font-bold text-[12px]">Oro / Dólar (XAUUSD)</span>
            </div>
            <div className="bg-[#0c0d12]/80 backdrop-blur border border-zinc-800/50 rounded-lg p-3 text-[11px] flex flex-col gap-1">
              <span className="text-zinc-500 uppercase">Apalancamiento</span>
              <span className="text-white font-bold text-[12px]">1:100</span>
            </div>
          </div>

          {/* Candlestick Mockup Graphics in the center */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <svg width="600" height="300" viewBox="0 0 600 300" className="opacity-70">
              {/* Trendline */}
              <path
                d="M 50 250 L 180 180 L 320 120 L 450 140 L 550 60"
                fill="none"
                stroke="#2962FF"
                strokeWidth="1.5"
                strokeDasharray="4 4"
                opacity="0.5"
              />

              {/* Candles (X, OpenY, CloseY, HighY, LowY, isBullish) */}
              {/* Candle 1 */}
              <line x1="80" y1="200" x2="80" y2="270" stroke="#EF5350" strokeWidth="1.5" />
              <rect x="74" y="210" width="12" height="40" fill="#EF5350" stroke="#000" strokeWidth="0.5" />

              {/* Candle 2 */}
              <line x1="140" y1="170" x2="140" y2="240" stroke="#26A69A" strokeWidth="1.5" />
              <rect x="134" y="180" width="12" height="40" fill="#26A69A" stroke="#000" strokeWidth="0.5" />

              {/* Candle 3 */}
              <line x1="200" y1="130" x2="200" y2="210" stroke="#EF5350" strokeWidth="1.5" />
              <rect x="194" y="150" width="12" height="45" fill="#EF5350" stroke="#000" strokeWidth="0.5" />

              {/* Candle 4 */}
              <line x1="260" y1="110" x2="260" y2="180" stroke="#26A69A" strokeWidth="1.5" />
              <rect x="254" y="120" width="12" height="45" fill="#26A69A" stroke="#000" strokeWidth="0.5" />

              {/* Candle 5 */}
              <line x1="320" y1="80" x2="320" y2="160" stroke="#26A69A" strokeWidth="1.5" />
              <rect x="314" y="90" width="12" height="50" fill="#26A69A" stroke="#000" strokeWidth="0.5" />

              {/* Candle 6 */}
              <line x1="380" y1="100" x2="380" y2="170" stroke="#EF5350" strokeWidth="1.5" />
              <rect x="374" y="115" width="12" height="35" fill="#EF5350" stroke="#000" strokeWidth="0.5" />

              {/* Candle 7 */}
              <line x1="440" y1="80" x2="440" y2="150" stroke="#26A69A" strokeWidth="1.5" />
              <rect x="434" y="95" width="12" height="40" fill="#26A69A" stroke="#000" strokeWidth="0.5" />

              {/* Candle 8 */}
              <line x1="500" y1="40" x2="500" y2="110" stroke="#26A69A" strokeWidth="1.5" />
              <rect x="494" y="55" width="12" height="45" fill="#26A69A" stroke="#000" strokeWidth="0.5" />
            </svg>
          </div>

          {/* Simulated Active Position Line overlay */}
          <div className="absolute top-[35%] left-0 right-[60px] flex items-center pointer-events-none">
            <div className="h-[1px] flex-1 border-t border-dashed border-[#26A69A]" />
            <div className="bg-[#26A69A] text-white text-[9px] font-bold px-1.5 py-0.5 rounded ml-1">
              COMPRA 0.50 Lotes @ 24750.50
            </div>
          </div>

          {/* Simulated Pending Order Line overlay */}
          <div className="absolute top-[52%] left-0 right-[60px] flex items-center pointer-events-none">
            <div className="h-[1px] flex-1 border-t border-dashed border-amber-500/50" />
            <div className="bg-[#0b0c0e] border border-amber-500/30 text-amber-500 text-[9px] font-bold px-1.5 py-0.5 rounded ml-1 font-mono">
              LÍMITE COMPRA 0.35 Lotes @ 24680.00
            </div>
          </div>

          {/* Simulated current price indicator on right axis */}
          <div className="absolute top-[28%] left-0 right-[60px] flex items-center pointer-events-none">
            <div className="h-[1px] flex-1 border-t border-dashed border-[#2962FF]" />
            <div className="bg-[#2962FF] text-white text-[10px] font-mono font-bold px-2 py-0.5 rounded ml-1 shadow-[0_2px_8px_rgba(41,98,255,0.4)]">
              24868.24
            </div>
          </div>

          {/* Bottom instructions / toast info */}
          <div className="z-10 flex justify-between items-end w-full">
            <div className="text-[11px] text-zinc-500 font-mono">
              Presiona [Espacio] para reproducir/pausar · [F1] para ayuda
            </div>
            
            {showNotification && (
              <div className="bg-[#121417] border border-white/[0.05] rounded-lg p-3 max-w-[260px] text-[11px] relative shadow-lg animate-slideUp">
                <button 
                  onClick={() => setShowNotification(false)}
                  className="absolute top-1.5 right-1.5 text-zinc-500 hover:text-white"
                >
                  <X className="h-3 w-3" />
                </button>
                <div className="flex items-start gap-2 pr-2">
                  <Lightbulb className="h-4.5 w-4.5 text-amber-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold text-white block">Velas Interactivas Activas</span>
                    En la pestaña de **Ajustes**, haz clic en el cuerpo, mechas o bordes de las velas para configurar sus colores en tiempo real.
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 2. Right Side: Redesigned Dock Panel */}
      <DockPanel />
    </div>
  )
}

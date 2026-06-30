"use client"

import React, { useState, useEffect } from "react"
import {
  Settings,
  Activity,
  RotateCcw,
  Sliders,
  X,
  Plus,
  Minus,
  AlertTriangle,
  AlertCircle,
  BarChart2,
  TrendingUp,
  HelpCircle,
  Clock,
  CheckCircle
} from "lucide-react"

// Types
type Tab = "trade" | "settings"
type Theme = "dark" | "light"

interface Colors {
  upColor: string
  downColor: string
  wickUp: string
  wickDown: string
  borderUpColor: string
  borderDownColor: string
  background: string
  grid: string
  text: string
  tpZone: string
  slZone: string
}

interface Position {
  id: string
  type: "BUY" | "SELL"
  lots: number
  entryPrice: number
  currentPrice: number
  pnl: number
  status: "ACTIVE" | "PENDING"
  orderType: string // "Mercado" | "Límite" | "Stop"
}

// ---- Color Conversion Helpers ----

function hsvToHex(h: number, s: number, v: number): string {
  s = s / 100
  v = v / 100
  let i = Math.floor((h / 60) % 6)
  let f = h / 60 - i
  let p = v * (1 - s)
  let q = v * (1 - f * s)
  let t = v * (1 - (1 - f) * s)
  let r = 0, g = 0, b = 0
  switch (i) {
    case 0: r = v; g = t; b = p; break;
    case 1: r = q; g = v; b = p; break;
    case 2: r = p; g = v; b = t; break;
    case 3: r = p; g = q; b = v; break;
    case 4: r = t; g = p; b = v; break;
    case 5: r = v; g = p; b = q; break;
  }
  const toHex = (x: number) => {
    const hex = Math.round(x * 255).toString(16)
    return hex.length === 1 ? "0" + hex : hex
  }
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase()
}

function hexToHsv(hex: string): { h: number; s: number; v: number } {
  hex = hex.replace("#", "")
  if (hex.length === 3) {
    hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2]
  }
  let r = parseInt(hex.substring(0, 2), 16) / 255 || 0
  let g = parseInt(hex.substring(2, 4), 16) / 255 || 0
  let b = parseInt(hex.substring(4, 6), 16) / 255 || 0

  let max = Math.max(r, g, b)
  let min = Math.min(r, g, b)
  let h = 0, s = 0, v = max

  let d = max - min
  s = max === 0 ? 0 : d / max

  if (max !== min) {
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6
  }
  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100),
    v: Math.round(v * 100),
  }
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  hex = hex.replace("#", "")
  if (hex.length === 3) {
    hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2]
  }
  let r = parseInt(hex.substring(0, 2), 16) || 0
  let g = parseInt(hex.substring(2, 4), 16) || 0
  let b = parseInt(hex.substring(4, 6), 16) || 0
  return { r, g, b }
}

// Custom RGB input handler helper
function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (x: number) => {
    const hex = Math.max(0, Math.min(255, x)).toString(16)
    return hex.length === 1 ? "0" + hex : hex
  }
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase()
}

// ---- Custom Color Picker Component (DOM-Integrated) ----

interface CustomColorPickerProps {
  color: string
  onChange: (hex: string) => void
}

function CustomColorPicker({ color, onChange }: CustomColorPickerProps) {
  const [hsv, setHsv] = useState({ h: 0, s: 0, v: 0 })

  useEffect(() => {
    setHsv(hexToHsv(color))
  }, [color])

  const rgb = hexToRgb(color)

  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const updateColor = (clientX: number, clientY: number) => {
      const x = Math.max(0, Math.min(rect.width, clientX - rect.left))
      const y = Math.max(0, Math.min(rect.height, clientY - rect.top))
      const s = Math.round((x / rect.width) * 100)
      const v = Math.round((1 - y / rect.height) * 100)
      
      const newHex = hsvToHex(hsv.h, s, v)
      setHsv((prev) => ({ ...prev, s, v }))
      onChange(newHex)
    }

    updateColor(e.clientX, e.clientY)

    const handleMouseMove = (moveEvent: MouseEvent) => {
      updateColor(moveEvent.clientX, moveEvent.clientY)
    }

    const handleMouseUp = () => {
      window.removeEventListener("mousemove", handleMouseMove)
      window.removeEventListener("mouseup", handleMouseUp)
    }

    window.addEventListener("mousemove", handleMouseMove)
    window.addEventListener("mouseup", handleMouseUp)
  }

  const handleHueMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const updateHue = (clientX: number) => {
      const x = Math.max(0, Math.min(rect.width, clientX - rect.left))
      const h = Math.round((x / rect.width) * 360)
      
      const newHex = hsvToHex(h, hsv.s, hsv.v)
      setHsv((prev) => ({ ...prev, h }))
      onChange(newHex)
    }

    updateHue(e.clientX)

    const handleMouseMove = (moveEvent: MouseEvent) => {
      updateHue(moveEvent.clientX)
    }

    const handleMouseUp = () => {
      window.removeEventListener("mousemove", handleMouseMove)
      window.removeEventListener("mouseup", handleMouseUp)
    }

    window.addEventListener("mousemove", handleMouseMove)
    window.addEventListener("mouseup", handleMouseUp)
  }

  const handleHexChange = (val: string) => {
    let sanitized = val.toUpperCase()
    if (!sanitized.startsWith("#")) {
      sanitized = "#" + sanitized
    }
    sanitized = sanitized.substring(0, 7)
    onChange(sanitized)
    if (sanitized.length === 7 && /^#[0-9A-F]{6}$/i.test(sanitized)) {
      setHsv(hexToHsv(sanitized))
    }
  }

  const handleRgbChange = (channel: "r" | "g" | "b", val: number) => {
    const clamped = Math.max(0, Math.min(255, isNaN(val) ? 0 : val))
    const newRgb = { ...rgb, [channel]: clamped }
    const newHex = rgbToHex(newRgb.r, newRgb.g, newRgb.b)
    onChange(newHex)
    setHsv(hexToHsv(newHex))
  }

  return (
    <div className="flex flex-col gap-3 w-full">
      {/* 1. Saturation / Value 2D Canvas */}
      <div
        onMouseDown={handleCanvasMouseDown}
        className="w-full h-24 rounded-lg relative overflow-hidden cursor-crosshair border border-white/5"
        style={{
          backgroundColor: `hsl(${hsv.h}, 100%, 50%)`,
        }}
      >
        {/* Gradients */}
        <div className="absolute inset-0 bg-gradient-to-r from-white to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-t from-black to-transparent" />

        {/* Pointer ring */}
        <div
          className="absolute w-2.5 h-2.5 rounded-full border border-white shadow-[0_0_3px_rgba(0,0,0,0.8)] pointer-events-none"
          style={{
            left: `${hsv.s}%`,
            top: `${100 - hsv.v}%`,
            transform: "translate(-5px, -5px)",
          }}
        />
      </div>

      {/* 2. Hue Slider (Rainbow thin track) */}
      <div
        onMouseDown={handleHueMouseDown}
        className="w-full h-[7px] rounded-full relative cursor-pointer"
        style={{
          background:
            "linear-gradient(to right, #ff0000 0%, #ffff00 17%, #00ff00 33%, #00ffff 50%, #0000ff 67%, #ff00ff 83%, #ff0000 100%)",
        }}
      >
        {/* Slider Thumb (Technical rectangle vertical pill) */}
        <div
          className="absolute w-[3px] h-[11px] bg-white rounded shadow-[0_0_2px_rgba(0,0,0,0.8)] pointer-events-none"
          style={{
            left: `${(hsv.h / 360) * 100}%`,
            top: "50%",
            transform: "translate(-1.5px, -50%)",
          }}
        />
      </div>

      {/* 3. Text inputs (HEX & RGB) */}
      <div className="flex flex-col gap-2 pt-1 border-t border-white/[0.04]">
        {/* Hex input */}
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-zinc-500 font-mono">HEX</span>
          <input
            type="text"
            value={color}
            onChange={(e) => handleHexChange(e.target.value)}
            className="flex-1 bg-[#121417] border border-white/[0.06] rounded px-1.5 py-1 text-[11px] text-zinc-300 font-mono focus:outline-none focus:border-[#2962FF]/50 text-center uppercase"
          />
        </div>

        {/* RGB inputs inline */}
        <div className="grid grid-cols-3 gap-1.5">
          <div className="flex items-center gap-1">
            <span className="text-[9px] text-zinc-600 font-mono">R</span>
            <input
              type="number"
              value={rgb.r}
              onChange={(e) => handleRgbChange("r", +e.target.value)}
              className="w-full bg-[#121417] border border-white/[0.06] rounded px-1 py-0.5 text-[10px] text-zinc-300 font-mono focus:outline-none focus:border-[#2962FF]/50 text-center"
            />
          </div>
          <div className="flex items-center gap-1">
            <span className="text-[9px] text-zinc-600 font-mono">G</span>
            <input
              type="number"
              value={rgb.g}
              onChange={(e) => handleRgbChange("g", +e.target.value)}
              className="w-full bg-[#121417] border border-white/[0.06] rounded px-1 py-0.5 text-[10px] text-zinc-300 font-mono focus:outline-none focus:border-[#2962FF]/50 text-center"
            />
          </div>
          <div className="flex items-center gap-1">
            <span className="text-[9px] text-zinc-600 font-mono">B</span>
            <input
              type="number"
              value={rgb.b}
              onChange={(e) => handleRgbChange("b", +e.target.value)}
              className="w-full bg-[#121417] border border-white/[0.06] rounded px-1 py-0.5 text-[10px] text-zinc-300 font-mono focus:outline-none focus:border-[#2962FF]/50 text-center"
            />
          </div>
        </div>
      </div>
    </div>
  )
}

// ---- Reusable Custom Switch Component ----

function CustomSwitch({
  checked,
  onChange,
}: {
  checked: boolean
  onChange: (val: boolean) => void
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2962FF] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0b0c0e]"
      style={{ backgroundColor: checked ? "#2962FF" : "#1f2229" }}
    >
      <span
        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
          checked ? "translate-x-4" : "translate-x-0"
        }`}
      />
    </button>
  )
}

// ---- Reusable Custom Opacity Slider (Low-Profile, no text on thumb) ----

function CustomOpacitySlider({
  min,
  max,
  value,
  onChange,
}: {
  min: number
  max: number
  value: number
  onChange: (val: number) => void
}) {
  const percent = ((value - min) / (max - min)) * 100
  return (
    <div className="relative w-full h-6 flex items-center group">
      {/* Background Thin Track (1.5px) */}
      <div className="absolute left-0 right-0 h-[1.5px] bg-zinc-800 rounded-full pointer-events-none" />
      {/* Active Thin Track */}
      <div
        className="absolute left-0 h-[1.5px] bg-[#2962FF] rounded-full pointer-events-none"
        style={{ width: `${percent}%` }}
      />
      {/* Slider Thumb - Minimalist 10px Circle */}
      <div
        className="absolute w-2.5 h-2.5 -ml-1.25 rounded-full bg-[#2962FF] hover:bg-[#3d72ff] hover:scale-110 shadow-sm pointer-events-none transition-all"
        style={{ left: `${percent}%` }}
      />
      {/* Overlay Transparent Input */}
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(+e.target.value)}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
      />
    </div>
  )
}

export function DockPanel() {
  // ---- States ----
  const [activeTab, setActiveTab] = useState<Tab>("trade")
  const [theme, setTheme] = useState<Theme>("dark")
  const [hoveredPart, setHoveredPart] = useState<string | null>(null)

  // Colors state
  const [colors, setColors] = useState<Colors>({
    upColor: "#26A69A",
    downColor: "#EF5350",
    wickUp: "#26A69A",
    wickDown: "#EF5350",
    borderUpColor: "#000000",
    borderDownColor: "#000000",
    background: "#000000",
    grid: "#1A1A1A",
    text: "#787B86",
    tpZone: "#089981",
    slZone: "#F23645",
  })

  // Selected candle part for custom picker popover
  const [activePicker, setActivePicker] = useState<{
    key: keyof Colors
    label: string
    x: number
    y: number
  } | null>(null)

  // Layout settings
  const [gridVisible, setGridVisible] = useState(true)
  const [gridOpacity, setGridOpacity] = useState(60)
  const [fillOpacity, setFillOpacity] = useState(36)
  const [borderOpacity, setBorderOpacity] = useState(15)

  // Trading States
  const [balance, setBalance] = useState(16817.27)
  const [equity, setEquity] = useState(16817.27)
  const [tradeType, setTradeType] = useState<"BUY" | "SELL">("BUY")
  const [orderType, setOrderType] = useState("Mercado")
  const [riskPercent, setRiskPercent] = useState(1.0)
  const [sl, setSl] = useState("0.00") // default value
  const [tp, setTp] = useState("0.00") // default value

  // Mock active & pending positions
  const [positions, setPositions] = useState<Position[]>([
    {
      id: "pos-1",
      type: "BUY",
      lots: 0.5,
      entryPrice: 24750.5,
      currentPrice: 24868.24,
      pnl: 58.87,
      status: "ACTIVE",
      orderType: "Mercado",
    },
    {
      id: "pos-2",
      type: "BUY",
      lots: 0.35,
      entryPrice: 24680.0,
      currentPrice: 24868.24,
      pnl: 0,
      status: "PENDING",
      orderType: "Límite",
    },
  ])

  // Simulate price changes and PnL updates
  useEffect(() => {
    const interval = setInterval(() => {
      setPositions((prev) =>
        prev.map((pos) => {
          const delta = (Math.random() - 0.48) * 12
          const newCurrent = +(pos.currentPrice + delta).toFixed(2)
          if (pos.status === "PENDING") {
            return {
              ...pos,
              currentPrice: newCurrent,
            }
          }
          const newPnl = +((newCurrent - pos.entryPrice) * pos.lots * 10).toFixed(2)
          return {
            ...pos,
            currentPrice: newCurrent,
            pnl: newPnl,
          }
        })
      )
    }, 1500)
    return () => clearInterval(interval)
  }, [])

  // Calculate live equity
  useEffect(() => {
    const activePnl = positions
      .filter((p) => p.status === "ACTIVE")
      .reduce((acc, pos) => acc + pos.pnl, 0)
    setEquity(+(balance + activePnl).toFixed(2))
  }, [positions, balance])

  // Handlers
  const handleColorChange = (key: keyof Colors, value: string) => {
    setColors((prev) => ({ ...prev, [key]: value }))
  }

  const applyPreset = (presetColors: Partial<Colors>) => {
    setColors((prev) => ({ ...prev, ...presetColors }))
  }

  const restoreDefaultColors = () => {
    if (theme === "dark") {
      setColors({
        upColor: "#26A69A",
        downColor: "#EF5350",
        wickUp: "#26A69A",
        wickDown: "#EF5350",
        borderUpColor: "#000000",
        borderDownColor: "#000000",
        background: "#000000",
        grid: "#1A1A1A",
        text: "#787B86",
        tpZone: "#089981",
        slZone: "#F23645",
      })
    } else {
      setColors({
        upColor: "#089981",
        downColor: "#F23645",
        wickUp: "#089981",
        wickDown: "#F23645",
        borderUpColor: "#000000",
        borderDownColor: "#000000",
        background: "#FFFFFF",
        grid: "#E0E3EB",
        text: "#787B86",
        tpZone: "#089981",
        slZone: "#F23645",
      })
    }
  }

  const openPosition = () => {
    if (isSlInvalid) return
    const currentPrice = 24868.24
    const lotSize = +(riskPercent * balance * 0.00001).toFixed(2) || 0.1
    const newPos: Position = {
      id: `pos-${Date.now()}`,
      type: tradeType,
      lots: lotSize,
      entryPrice:
        orderType === "Mercado"
          ? currentPrice
          : +(currentPrice - (tradeType === "BUY" ? 120 : -120)).toFixed(2),
      currentPrice: currentPrice,
      pnl: 0,
      status: orderType === "Mercado" ? "ACTIVE" : "PENDING",
      orderType: orderType,
    }
    setPositions((prev) => [newPos, ...prev])
  }

  const closePosition = (id: string) => {
    const pos = positions.find((p) => p.id === id)
    if (pos) {
      if (pos.status === "ACTIVE") {
        setBalance((b) => +(b + pos.pnl).toFixed(2))
      }
    }
    setPositions((prev) => prev.filter((pos) => pos.id !== id))
  }

  // Dynamic Popover coordinate calculator based on scroll container bounds
  const openColorPicker = (key: keyof Colors, label: string, target: HTMLElement) => {
    const container = document.getElementById("dock-scroll-container")
    if (!container) return

    const containerRect = container.getBoundingClientRect()
    const targetRect = target.getBoundingClientRect()

    // Calculate absolute position inside scroll area
    const relativeTop = targetRect.top - containerRect.top + container.scrollTop

    // Check height in current view to position popover either above or below the element
    const containerHeight = container.clientHeight
    const relativeTopInViewport = targetRect.top - containerRect.top

    let y = relativeTop + 25 // default below
    if (relativeTopInViewport > containerHeight / 2) {
      y = relativeTop - 225 // float above if in the lower half of screen
    }

    setActivePicker({
      key,
      label,
      x: 55, // horizontally centered in the 310px wide content panel
      y,
    })
  }

  // Preset candle configurations
  const PRESETS = [
    {
      id: "tradingview",
      label: "TradingView",
      up: "#26A69A",
      down: "#EF5350",
      wickUp: "#26A69A",
      wickDown: "#EF5350",
    },
    {
      id: "clasico",
      label: "Clásico",
      up: "#089981",
      down: "#F23645",
      wickUp: "#089981",
      wickDown: "#F23645",
    },
    {
      id: "mt5",
      label: "MT5",
      up: "#00B746",
      down: "#FFFFFF",
      wickUp: "#00B746",
      wickDown: "#FFFFFF",
    },
    {
      id: "mono",
      label: "Monocromo",
      up: "#D1D4DC",
      down: "#5D606B",
      wickUp: "#D1D4DC",
      wickDown: "#5D606B",
    },
  ]

  const activePositions = positions.filter((p) => p.status === "ACTIVE")
  const pendingOrders = positions.filter((p) => p.status === "PENDING")

  // Stop Loss validation logic
  const isSlInvalid = !sl || sl === "" || sl === "0.00" || sl === "0"

  // Calculated values for premium risk selector
  const riskSliderMin = 0.1
  const riskSliderMax = 5.0
  const riskPercentClamped = Math.max(riskSliderMin, Math.min(riskSliderMax, riskPercent))
  const riskPercentVal = ((riskPercentClamped - riskSliderMin) / (riskSliderMax - riskSliderMin)) * 100

  return (
    <div className="flex h-full w-[360px] select-none border-l border-[#222] bg-[#0b0c0e] text-[#d1d4dc] font-sans relative">
      {/* Sidebar tab bar (integrated) */}
      <div className="flex w-[50px] flex-col items-center border-l border-[#222] bg-[#07080a] py-4 gap-4">
        <button
          onClick={() => setActiveTab("trade")}
          className={`flex h-10 w-10 items-center justify-center rounded-lg transition-all cursor-pointer ${
            activeTab === "trade"
              ? "bg-[#121417] text-[#2962FF] border border-white/[0.04] shadow-sm"
              : "text-[#787b86] hover:text-[#d1d4dc]"
          }`}
          title="Operativa"
        >
          <Activity className="h-5 w-5" />
        </button>
        <button
          onClick={() => setActiveTab("settings")}
          className={`flex h-10 w-10 items-center justify-center rounded-lg transition-all cursor-pointer ${
            activeTab === "settings"
              ? "bg-[#121417] text-[#2962FF] border border-white/[0.04] shadow-sm"
              : "text-[#787b86] hover:text-[#d1d4dc]"
          }`}
          title="Ajustes"
        >
          <Settings className="h-5 w-5" />
        </button>
      </div>

      {/* Main panel container */}
      <div
        id="dock-scroll-container"
        className="flex flex-1 flex-col overflow-y-auto px-4 py-5 gap-6"
      >
        {/* ============================================== */}
        {/* 1. OPERATIVA TAB */}
        {/* ============================================== */}
        {activeTab === "trade" && (
          <div className="flex flex-col gap-5 animate-fadeIn">
            <div>
              <h2 className="text-[18px] font-semibold text-white tracking-wide">Operativa</h2>
              <p className="text-[11px] text-[#787b86] mt-0.5">Gestión de órdenes y cuenta</p>
            </div>

            {/* Account Info Card (Redesigned with Impeccable UI/UX standards) */}
            <div className="relative overflow-hidden rounded-xl border border-white/[0.06] bg-gradient-to-br from-[#121418] to-[#08090b] p-4 shadow-[inset_0_1px_rgba(255,255,255,0.03),0_4px_24px_rgba(0,0,0,0.4)] group/card">
              {/* Subtle background glow based on account PnL */}
              <div
                className={`absolute -right-16 -top-16 w-32 h-32 rounded-full blur-[40px] opacity-15 pointer-events-none transition-all duration-1000 ${
                  activePositions.length === 0
                    ? "bg-[#2962FF]/40"
                    : equity >= balance
                    ? "bg-[#26A69A]/40"
                    : "bg-[#EF5350]/40"
                }`}
              />

              {/* Faded SVG background sparkline */}
              <div className="absolute right-0 bottom-0 left-0 h-12 opacity-[0.03] pointer-events-none group-hover/card:opacity-[0.06] transition-opacity duration-300">
                <svg className="w-full h-full" viewBox="0 0 100 30" preserveAspectRatio="none">
                  <path
                    d="M0,25 C10,23 20,28 30,20 C40,12 50,15 60,8 C70,4 80,10 90,5 L100,2"
                    fill="none"
                    stroke={equity >= balance ? "#26A69A" : "#EF5350"}
                    strokeWidth="1.5"
                  />
                </svg>
              </div>

              {/* Top row - Title & PnL Badge if active */}
              <div className="flex justify-between items-center">
                <span className="text-[9px] text-[#787b86] font-bold tracking-wider uppercase">Balance Neto</span>
                {activePositions.length > 0 && (
                  <div
                    className={`text-[9px] font-bold px-2 py-0.5 rounded-md border font-mono tracking-wide ${
                      equity >= balance
                        ? "bg-[#26A69A]/10 text-[#26A69A] border-[#26A69A]/20"
                        : "bg-[#EF5350]/10 text-[#EF5350] border-[#EF5350]/20"
                    }`}
                  >
                    PnL: {equity >= balance ? "+" : ""}
                    {(equity - balance).toFixed(2)} $
                  </div>
                )}
              </div>

              {/* Main Balance Display */}
              <div className="mt-1">
                <div className="flex items-baseline gap-1">
                  <span className="text-[24px] font-extrabold text-white font-mono tracking-tight tabular-nums leading-none">
                    {balance.toLocaleString("es-ES", { minimumFractionDigits: 2 })}
                  </span>
                  <span className="text-[12px] font-bold text-[#787b86] font-mono">USD</span>
                </div>
              </div>

              {/* Equity info row */}
              <div className="flex justify-between items-center mt-4 pt-3 border-t border-white/[0.04] text-[12px]">
                <span className="text-zinc-400 font-semibold">Equidad:</span>
                <span className="font-semibold text-zinc-300 font-mono tracking-tight tabular-nums">
                  {equity.toLocaleString("es-ES", { minimumFractionDigits: 2 })} $
                </span>
              </div>
            </div>

            {/* Buy/Sell Direction Toggle */}
            <div className="grid grid-cols-2 p-1 bg-[#07080a] rounded-lg border border-white/[0.04]">
              <button
                onClick={() => setTradeType("BUY")}
                className={`py-2 rounded-md text-[12px] font-bold transition-all cursor-pointer ${
                  tradeType === "BUY"
                    ? "bg-[#26A69A] text-white shadow-[0_2px_8px_rgba(38,166,154,0.3)]"
                    : "text-[#787b86] hover:text-zinc-200"
                }`}
              >
                COMPRAR
              </button>
              <button
                onClick={() => setTradeType("SELL")}
                className={`py-2 rounded-md text-[12px] font-bold transition-all cursor-pointer ${
                  tradeType === "SELL"
                    ? "bg-[#EF5350] text-white shadow-[0_2px_8px_rgba(239,83,80,0.3)]"
                    : "text-[#787b86] hover:text-zinc-200"
                }`}
              >
                VENDER
              </button>
            </div>

            {/* Form Controls */}
            <div className="flex flex-col gap-4">
              {/* Order Type */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] text-[#787b86] uppercase font-semibold tracking-wider">Tipo de Orden</label>
                <select
                  value={orderType}
                  onChange={(e) => setOrderType(e.target.value)}
                  className="w-full bg-[#121417] border border-white/[0.06] rounded-lg px-3 py-2 text-[13px] text-zinc-200 focus:outline-none focus:border-[#2962FF]/50 cursor-pointer"
                >
                  <option>Mercado</option>
                  <option>Límite</option>
                  <option>Stop</option>
                </select>
              </div>

              {/* SL and TP grid */}
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <label
                    className={`text-[11px] uppercase font-semibold tracking-wider transition-colors ${
                      isSlInvalid ? "text-[#EF5350]" : "text-[#787b86]"
                    }`}
                  >
                    Stop Loss
                  </label>
                  <input
                    type="text"
                    value={sl}
                    onChange={(e) => setSl(e.target.value)}
                    className={`w-full bg-[#121417] border rounded-lg px-3 py-2 text-[13px] text-zinc-200 focus:outline-none focus:border-[#2962FF]/50 font-mono transition-all ${
                      isSlInvalid
                        ? "border-[#EF5350]/30 bg-[#161214] shadow-[0_0_8px_rgba(239,83,80,0.05)]"
                        : "border-white/[0.06]"
                    }`}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] text-[#787b86] uppercase font-semibold tracking-wider">Take Profit</label>
                  <input
                    type="text"
                    value={tp}
                    onChange={(e) => setTp(e.target.value)}
                    className="w-full bg-[#121417] border border-white/[0.06] rounded-lg px-3 py-2 text-[13px] text-zinc-200 focus:outline-none focus:border-[#2962FF]/50 font-mono"
                  />
                </div>
              </div>

              {/* Refined Risk Selector (% Cuenta) - Premium Slider with no native spinners */}
              <div className="flex flex-col gap-2">
                <div className="flex justify-between items-center">
                  <label className="text-[11px] text-[#787b86] uppercase font-semibold tracking-wider">Riesgo (% Cuenta)</label>
                </div>
                
                <div className="flex items-center gap-3">
                  {/* Custom Visual Range Slider with Floating Tooltip & Anchor Points */}
                  <div className="flex-1 relative h-6 flex items-center group">
                    {/* Background Track - Extremely Thin 1.5px anthracite line */}
                    <div className="absolute left-0 right-0 h-[1.5px] bg-zinc-800 rounded-full pointer-events-none" />
                    
                    {/* Active Track - Subtly illuminated thin blue line */}
                    <div
                      className="absolute left-0 h-[1.5px] bg-[#2962FF] rounded-full pointer-events-none"
                      style={{ width: `${riskPercentVal}%` }}
                    />
                    
                    {/* Anchor Points (0.5%, 1.0%, 2.0%) */}
                    <div className="absolute left-[8.16%] w-1.5 h-1.5 -ml-0.75 rounded-full bg-zinc-700 pointer-events-none" />
                    <div className="absolute left-[18.36%] w-1.5 h-1.5 -ml-0.75 rounded-full bg-zinc-700 pointer-events-none" />
                    <div className="absolute left-[38.77%] w-1.5 h-1.5 -ml-0.75 rounded-full bg-zinc-700 pointer-events-none" />

                    {/* Floating Tooltip Indicator */}
                    <div
                      className="absolute -top-8 -translate-x-1/2 bg-[#1f2229] border border-white/[0.08] text-white text-[10px] font-semibold px-2 py-0.5 rounded shadow-lg pointer-events-none whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center"
                      style={{ left: `${riskPercentVal}%` }}
                    >
                      <span className="tabular-nums">{riskPercent.toFixed(1)}%</span>
                      <span className="text-[8px] text-[#787b86] font-mono tabular-nums">
                        ${(riskPercent * balance * 0.01).toFixed(2)}
                      </span>
                    </div>

                    {/* Slider Thumb - Technical vertical rectangle pill (3px wide x 12px high) */}
                    <div
                      className="absolute w-[3px] h-[12px] -ml-[1.5px] bg-[#2962FF] rounded-full pointer-events-none hover:scale-x-150 transition-all shadow-[0_0_4px_rgba(41,98,255,0.8)]"
                      style={{ left: `${riskPercentVal}%` }}
                    />

                    {/* Native Slider Overlay (Invisible but Interactive) */}
                    <input
                      type="range"
                      min={riskSliderMin}
                      max={riskSliderMax}
                      step="0.1"
                      value={riskPercent}
                      onChange={(e) => setRiskPercent(+e.target.value)}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    />
                  </div>

                  {/* Manual Numeric input on the right (Spinners stripped globally via CSS) */}
                  <div className="flex items-center bg-[#121417] border border-white/[0.06] rounded-lg px-2.5 py-1.5 w-16 select-text">
                    <input
                      type="number"
                      step="0.1"
                      min={riskSliderMin}
                      max={riskSliderMax}
                      value={riskPercent}
                      onChange={(e) => setRiskPercent(Math.max(riskSliderMin, Math.min(riskSliderMax, +e.target.value)))}
                      className="w-full bg-transparent text-[12px] text-zinc-200 text-right focus:outline-none font-mono"
                    />
                    <span className="text-[10px] text-[#787b86] ml-0.5">%</span>
                  </div>
                </div>
              </div>

              {/* Lot / Risk calculated results card */}
              <div className="rounded-lg bg-white/[0.01] border border-white/[0.03] p-3 text-[12px] flex flex-col gap-2 shadow-[inset_0_1px_rgba(255,255,255,0.01)]">
                <div className="flex justify-between">
                  <span className="text-[#787b86]">Lotaje calculado:</span>
                  <span className="font-bold text-white font-mono tabular-nums">0.68 Lotes</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#787b86]">Riesgo máximo estimado:</span>
                  <span className="font-semibold text-white font-mono tabular-nums">
                    {(riskPercent * balance * 0.01).toFixed(2)} $
                  </span>
                </div>
              </div>

              {/* Error messages if SL is missing (Strictly Vectorized) */}
              {isSlInvalid && (
                <div className="text-[11px] text-[#EF5350] bg-[#EF5350]/5 border border-[#EF5350]/15 rounded-lg p-3 flex items-start gap-2.5 animate-fadeIn">
                  <AlertCircle className="h-4 w-4 text-[#EF5350] flex-shrink-0 mt-0.5" />
                  <span>Se requiere definir un Stop Loss para poder abrir la operación de forma segura.</span>
                </div>
              )}

              {/* Primary action execution button (Conditional state) */}
              <button
                disabled={isSlInvalid}
                onClick={openPosition}
                className={`w-full py-3 rounded-lg font-bold text-[14px] transition-all flex items-center justify-center gap-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2962FF] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0b0c0e] ${
                  isSlInvalid
                    ? "bg-[#16171a] text-zinc-600 border border-white/[0.03] opacity-40 cursor-not-allowed"
                    : tradeType === "BUY"
                    ? "bg-[#26A69A] text-white hover:bg-[#2bbbb1] active:scale-[0.98] shadow-[0_4px_12px_rgba(38,166,154,0.3)] cursor-pointer"
                    : "bg-[#EF5350] text-white hover:bg-[#ff5d5a] active:scale-[0.98] shadow-[0_4px_12px_rgba(239,83,80,0.3)] cursor-pointer"
                }`}
              >
                {orderType === "Mercado"
                  ? tradeType === "BUY"
                    ? "Comprar a Mercado"
                    : "Vender a Mercado"
                  : tradeType === "BUY"
                  ? `Colocar Límite Compra`
                  : `Colocar Límite Venta`}
              </button>
            </div>

            {/* Combined operations list: Active & Pending */}
            <div className="flex flex-col gap-4 mt-2">
              {/* 1. Active positions */}
              <div className="flex flex-col gap-2.5">
                <div className="flex justify-between items-center">
                  <span className="text-[11px] text-[#787b86] uppercase font-semibold tracking-wider">Operaciones Activas</span>
                  <span className="text-[10px] text-zinc-500 font-mono">{activePositions.length}</span>
                </div>

                {activePositions.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-6 px-4 rounded-xl border border-dashed border-white/[0.04] bg-white/[0.005] text-center">
                    <BarChart2 className="h-6 w-6 text-zinc-600 mb-1.5" />
                    <p className="text-[11px] text-[#787b86] font-medium">No hay posiciones activas</p>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    {activePositions.map((pos) => (
                      <div
                        key={pos.id}
                        className="flex items-center justify-between p-3 rounded-lg bg-[#121417] border border-white/[0.04] shadow-[0_1px_3px_rgba(0,0,0,0.1)]"
                      >
                        <div className="flex items-center gap-2">
                          <span
                            className={`text-[9px] font-bold px-1.5 py-0.5 rounded font-mono ${
                              pos.type === "BUY"
                                ? "bg-[#26A69A]/10 text-[#26A69A]"
                                : "bg-[#EF5350]/10 text-[#EF5350]"
                            }`}
                          >
                            {pos.type}
                          </span>
                          <div className="flex flex-col">
                            <span className="text-[12px] font-semibold text-white font-mono tabular-nums">
                              {pos.lots} Lotes
                            </span>
                            <span className="text-[10px] text-[#787b86] font-mono tabular-nums">
                              {pos.entryPrice.toFixed(2)} → {pos.currentPrice.toFixed(2)}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <span
                            className={`text-[13px] font-bold font-mono tabular-nums ${
                              pos.pnl >= 0 ? "text-[#26A69A]" : "text-[#EF5350]"
                            }`}
                          >
                            {pos.pnl >= 0 ? "+" : ""}
                            {pos.pnl.toFixed(2)} $
                          </span>
                          <button
                            onClick={() => closePosition(pos.id)}
                            className="h-6 w-6 rounded-md hover:bg-white/5 flex items-center justify-center text-[#787b86] hover:text-white transition-colors cursor-pointer"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* 2. Pending orders */}
              <div className="flex flex-col gap-2.5">
                <div className="flex justify-between items-center">
                  <span className="text-[11px] text-[#787b86] uppercase font-semibold tracking-wider">Órdenes Pendientes</span>
                  <span className="text-[10px] text-zinc-500 font-mono">{pendingOrders.length}</span>
                </div>

                {pendingOrders.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-6 px-4 rounded-xl border border-dashed border-white/[0.04] bg-white/[0.005] text-center">
                    <Clock className="h-6 w-6 text-zinc-600 mb-1.5" />
                    <p className="text-[11px] text-[#787b86] font-medium">No hay órdenes pendientes</p>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    {pendingOrders.map((pos) => (
                      <div
                        key={pos.id}
                        className="flex items-center justify-between p-3 rounded-lg bg-[#121417] border border-white/[0.04] shadow-[0_1px_3px_rgba(0,0,0,0.1)]"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded font-mono bg-amber-500/10 text-amber-500 border border-amber-500/20">
                            {pos.type === "BUY" ? "COMPRA" : "VENTA"} {pos.orderType.toUpperCase()}
                          </span>
                          <div className="flex flex-col">
                            <span className="text-[12px] font-semibold text-white font-mono tabular-nums">
                              {pos.lots} Lotes
                            </span>
                            <span className="text-[10px] text-[#787b86] font-mono tabular-nums">
                              Objetivo: {pos.entryPrice.toFixed(2)}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <span className="text-[11px] font-semibold font-mono text-amber-500 bg-amber-500/5 px-2 py-0.5 rounded border border-amber-500/10">
                            Pendiente
                          </span>
                          <button
                            onClick={() => closePosition(pos.id)}
                            className="h-6 w-6 rounded-md hover:bg-white/5 flex items-center justify-center text-[#787b86] hover:text-white transition-colors cursor-pointer"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Bottom Actions */}
            <div className="grid grid-cols-2 gap-3 pt-4 border-t border-white/[0.04] mt-4">
              <button className="py-2.5 rounded-lg text-[12px] font-bold bg-[#121417] border border-white/[0.06] hover:border-white/[0.12] hover:bg-white/[0.02] text-zinc-300 active:scale-95 transition-all cursor-pointer">
                Resumen
              </button>
              <button className="py-2.5 rounded-lg text-[12px] font-bold bg-[#EF5350]/10 border border-[#EF5350]/20 hover:border-[#EF5350]/40 text-[#EF5350] hover:bg-[#EF5350]/20 active:scale-95 transition-all cursor-pointer">
                Terminar sesión
              </button>
            </div>
          </div>
        )}

        {/* ============================================== */}
        {/* 2. AJUSTES TAB */}
        {/* ============================================== */}
        {activeTab === "settings" && (
          <div className="flex flex-col gap-5 animate-fadeIn relative">
            <div>
              <h2 className="text-[18px] font-semibold text-white tracking-wide">Ajustes</h2>
              <p className="text-[11px] text-[#787b86] mt-0.5">Personalización del gráfico y simulación</p>
            </div>

            {/* Theme selector */}
            <div className="flex flex-col gap-2">
              <label className="text-[11px] text-[#787b86] uppercase font-semibold">Tema</label>
              <div className="grid grid-cols-2 p-1 bg-[#07080a] rounded-lg border border-white/[0.04]">
                <button
                  onClick={() => setTheme("dark")}
                  className={`py-1.5 rounded-md text-[12px] font-medium transition-all cursor-pointer ${
                    theme === "dark" ? "bg-[#121417] text-white shadow-sm" : "text-[#787b86] hover:text-zinc-200"
                  }`}
                >
                  Oscuro
                </button>
                <button
                  onClick={() => {
                    setTheme("light")
                    // Auto restore light theme colors
                    setColors((prev) => ({
                      ...prev,
                      background: "#FFFFFF",
                      grid: "#E0E3EB",
                    }))
                  }}
                  className={`py-1.5 rounded-md text-[12px] font-medium transition-all cursor-pointer ${
                    theme === "light" ? "bg-[#121417] text-white shadow-sm" : "text-[#787b86] hover:text-zinc-200"
                  }`}
                >
                  Claro
                </button>
              </div>
            </div>

            {/* Candle presets */}
            <div className="flex flex-col gap-2">
              <label className="text-[11px] text-[#787b86] uppercase font-semibold">Presets de velas</label>
              <div className="grid grid-cols-2 gap-2">
                {PRESETS.map((p) => (
                  <button
                    key={p.id}
                    onClick={() =>
                      applyPreset({
                        upColor: p.up,
                        downColor: p.down,
                        wickUp: p.wickUp,
                        wickDown: p.wickDown,
                      })
                    }
                    className="flex items-center gap-2 p-2 bg-[#121417] border border-white/[0.04] hover:border-white/[0.1] hover:bg-white/[0.01] rounded-lg text-[11px] text-zinc-300 text-left transition-all active:scale-[0.98] cursor-pointer"
                  >
                    <div className="flex gap-1">
                      <div className="w-2.5 h-2.5 rounded-full border border-white/10" style={{ backgroundColor: p.up }} />
                      <div className="w-2.5 h-2.5 rounded-full border border-white/10" style={{ backgroundColor: p.down }} />
                    </div>
                    <span>{p.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Interactive Candle Customizer */}
            <div className="flex flex-col gap-2 relative">
              <div className="flex items-center justify-between">
                <label className="text-[11px] text-[#787b86] uppercase font-semibold">
                  Personalizar Velas (Click en gráfico)
                </label>
                <button
                  onClick={restoreDefaultColors}
                  className="text-[#787b86] hover:text-white flex items-center gap-1 transition-colors cursor-pointer"
                  title="Restaurar colores del tema"
                >
                  <RotateCcw className="h-3 w-3" />
                </button>
              </div>

              {/* Interactive Vector Candle Canvas */}
              <div className="relative rounded-xl border border-white/[0.04] bg-[#121417] p-6 flex justify-around items-center h-[180px] shadow-[inset_0_1px_rgba(255,255,255,0.02)]">
                {/* 1. Bullish Candle (Vela Alcista) */}
                <div className="flex flex-col items-center group/candle relative">
                  <span className="text-[10px] text-zinc-500 font-semibold mb-2">Alcista</span>
                  <div className="w-[40px] h-[100px] relative flex justify-center items-center">
                    {/* Wick */}
                    <button
                      onClick={(e) => openColorPicker("wickUp", "Mecha Alcista", e.currentTarget)}
                      onMouseEnter={() => setHoveredPart("wickUp")}
                      onMouseLeave={() => setHoveredPart(null)}
                      className="absolute w-[2px] h-[85px] hover:w-[4px] rounded transition-all cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2962FF] z-10"
                      style={{
                        backgroundColor: hoveredPart === "wickUp" ? "#4dffd2" : colors.wickUp,
                        boxShadow: hoveredPart === "wickUp" ? `0 0 8px ${colors.wickUp}` : "none",
                      }}
                      title="Editar Mecha Alcista"
                    />

                    {/* Body */}
                    <button
                      onClick={(e) => openColorPicker("upColor", "Cuerpo Alcista", e.currentTarget)}
                      onMouseEnter={() => setHoveredPart("upColor")}
                      onMouseLeave={() => setHoveredPart(null)}
                      className="absolute w-[28px] h-[45px] hover:scale-[1.03] transition-all cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2962FF] rounded z-20"
                      style={{
                        backgroundColor: colors.upColor,
                        border: hoveredPart === "borderUpColor"
                          ? "2.5px solid #2962FF"
                          : hoveredPart === "upColor"
                          ? `1.5px solid #ffffff`
                          : `1.5px solid ${colors.borderUpColor}`,
                        boxShadow: hoveredPart === "upColor"
                          ? `0 0 12px ${colors.upColor}`
                          : "none",
                        filter: hoveredPart === "upColor" ? "brightness(1.15)" : "none",
                      }}
                      title="Editar Cuerpo Alcista"
                    />

                    {/* Border clickable spots */}
                    <button
                      onClick={(e) => openColorPicker("borderUpColor", "Borde Alcista", e.currentTarget)}
                      onMouseEnter={() => setHoveredPart("borderUpColor")}
                      onMouseLeave={() => setHoveredPart(null)}
                      className="absolute -left-1.5 w-[7px] h-[45px] hover:bg-white/10 rounded cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2962FF] z-30"
                      title="Editar Borde Alcista"
                    />
                    <button
                      onClick={(e) => openColorPicker("borderUpColor", "Borde Alcista", e.currentTarget)}
                      onMouseEnter={() => setHoveredPart("borderUpColor")}
                      onMouseLeave={() => setHoveredPart(null)}
                      className="absolute -right-1.5 w-[7px] h-[45px] hover:bg-white/10 rounded cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2962FF] z-30"
                      title="Editar Borde Alcista"
                    />
                  </div>
                </div>

                {/* 2. Bearish Candle (Vela Bajista) */}
                <div className="flex flex-col items-center group/candle relative">
                  <span className="text-[10px] text-zinc-500 font-semibold mb-2">Bajista</span>
                  <div className="w-[40px] h-[100px] relative flex justify-center items-center">
                    {/* Wick */}
                    <button
                      onClick={(e) => openColorPicker("wickDown", "Mecha Bajista", e.currentTarget)}
                      onMouseEnter={() => setHoveredPart("wickDown")}
                      onMouseLeave={() => setHoveredPart(null)}
                      className="absolute w-[2px] h-[85px] hover:w-[4px] rounded transition-all cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2962FF] z-10"
                      style={{
                        backgroundColor: hoveredPart === "wickDown" ? "#ff8a88" : colors.wickDown,
                        boxShadow: hoveredPart === "wickDown" ? `0 0 8px ${colors.wickDown}` : "none",
                      }}
                      title="Editar Mecha Bajista"
                    />

                    {/* Body */}
                    <button
                      onClick={(e) => openColorPicker("downColor", "Cuerpo Bajista", e.currentTarget)}
                      onMouseEnter={() => setHoveredPart("downColor")}
                      onMouseLeave={() => setHoveredPart(null)}
                      className="absolute w-[28px] h-[45px] hover:scale-[1.03] transition-all cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2962FF] rounded z-20"
                      style={{
                        backgroundColor: colors.downColor,
                        border: hoveredPart === "borderDownColor"
                          ? "2.5px solid #2962FF"
                          : hoveredPart === "downColor"
                          ? `1.5px solid #ffffff`
                          : `1.5px solid ${colors.borderDownColor}`,
                        boxShadow: hoveredPart === "downColor"
                          ? `0 0 12px ${colors.downColor}`
                          : "none",
                        filter: hoveredPart === "downColor" ? "brightness(1.15)" : "none",
                      }}
                      title="Editar Cuerpo Bajista"
                    />

                    {/* Border clickable spots */}
                    <button
                      onClick={(e) => openColorPicker("borderDownColor", "Borde Bajista", e.currentTarget)}
                      onMouseEnter={() => setHoveredPart("borderDownColor")}
                      onMouseLeave={() => setHoveredPart(null)}
                      className="absolute -left-1.5 w-[7px] h-[45px] hover:bg-white/10 rounded cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2962FF] z-30"
                      title="Editar Borde Bajista"
                    />
                    <button
                      onClick={(e) => openColorPicker("borderDownColor", "Borde Bajista", e.currentTarget)}
                      onMouseEnter={() => setHoveredPart("borderDownColor")}
                      onMouseLeave={() => setHoveredPart(null)}
                      className="absolute -right-1.5 w-[7px] h-[45px] hover:bg-white/10 rounded cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2962FF] z-30"
                      title="Editar Borde Bajista"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Collapsible card group: Fondo y Cuadrícula */}
            <div className="rounded-xl border border-white/[0.04] bg-[#121417] overflow-hidden">
              <div className="px-4 py-3 bg-white/[0.01] border-b border-white/[0.03] flex items-center justify-between">
                <span className="text-[12px] font-bold text-white">Fondo y Cuadrícula</span>
                <Sliders className="h-3.5 w-3.5 text-zinc-500" />
              </div>
              <div className="p-4 flex flex-col gap-4">
                {/* Background color */}
                <div className="flex justify-between items-center text-[12px]">
                  <span className="text-zinc-400">Color del Fondo</span>
                  <div className="flex items-center gap-1.5">
                    {/* Custom Picker Trigger Swatch */}
                    <button
                      onClick={(e) => openColorPicker("background", "Color de Fondo", e.currentTarget)}
                      className="w-5 h-5 rounded border border-white/10 relative overflow-hidden flex items-center justify-center bg-zinc-950 cursor-pointer shadow-[inset_0_1px_rgba(255,255,255,0.05)]"
                      style={{ backgroundColor: colors.background }}
                    />
                    <span className="text-[11px] font-mono text-zinc-400">{colors.background}</span>
                  </div>
                </div>

                {/* Scales text color */}
                <div className="flex justify-between items-center text-[12px]">
                  <span className="text-zinc-400">Texto de Escalas</span>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={(e) => openColorPicker("text", "Texto de Escalas", e.currentTarget)}
                      className="w-5 h-5 rounded border border-white/10 relative overflow-hidden flex items-center justify-center bg-zinc-950 cursor-pointer shadow-[inset_0_1px_rgba(255,255,255,0.05)]"
                      style={{ backgroundColor: colors.text }}
                    />
                    <span className="text-[11px] font-mono text-zinc-400">{colors.text}</span>
                  </div>
                </div>

                {/* Divider */}
                <div className="h-[1px] bg-white/[0.03]" />

                {/* Custom switch for grid visibility */}
                <div className="flex items-center justify-between text-[12px] text-zinc-400">
                  <span>Mostrar cuadrícula</span>
                  <CustomSwitch checked={gridVisible} onChange={setGridVisible} />
                </div>

                {/* Grid Color and Opacity */}
                {gridVisible && (
                  <div className="flex flex-col gap-3 pl-2 border-l border-white/[0.04] animate-fadeIn">
                    <div className="flex justify-between items-center text-[12px]">
                      <span className="text-zinc-500">Color de Cuadrícula</span>
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={(e) => openColorPicker("grid", "Color de Cuadrícula", e.currentTarget)}
                          className="w-5 h-5 rounded border border-white/10 relative overflow-hidden flex items-center justify-center bg-zinc-950 cursor-pointer shadow-[inset_0_1px_rgba(255,255,255,0.05)]"
                          style={{ backgroundColor: colors.grid }}
                        />
                        <span className="text-[11px] font-mono text-zinc-500">{colors.grid}</span>
                      </div>
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <div className="flex justify-between items-center text-[11px] text-zinc-500">
                        <span>Opacidad de Cuadrícula</span>
                        <span className="font-mono text-zinc-300 font-bold tabular-nums">{gridOpacity}%</span>
                      </div>
                      {/* Premium Low-Profile Opacity Slider */}
                      <CustomOpacitySlider
                        min={5}
                        max={100}
                        value={gridOpacity}
                        onChange={setGridOpacity}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Collapsible card group: Ejecución (Zonas de Trade) */}
            <div className="rounded-xl border border-white/[0.04] bg-[#121417] overflow-hidden">
              <div className="px-4 py-3 bg-white/[0.01] border-b border-white/[0.03] flex items-center justify-between">
                <span className="text-[12px] font-bold text-white">Ejecución (Zonas de Trade)</span>
                <Sliders className="h-3.5 w-3.5 text-zinc-500" />
              </div>
              <div className="p-4 flex flex-col gap-4">
                {/* TP zone color */}
                <div className="flex justify-between items-center text-[12px]">
                  <span className="text-zinc-400">Color de Zona TP</span>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={(e) => openColorPicker("tpZone", "Color de Zona TP", e.currentTarget)}
                      className="w-5 h-5 rounded border border-white/10 relative overflow-hidden flex items-center justify-center bg-zinc-950 cursor-pointer shadow-[inset_0_1px_rgba(255,255,255,0.05)]"
                      style={{ backgroundColor: colors.tpZone }}
                    />
                    <span className="text-[11px] font-mono text-zinc-400">{colors.tpZone}</span>
                  </div>
                </div>

                {/* SL zone color */}
                <div className="flex justify-between items-center text-[12px]">
                  <span className="text-zinc-400">Color de Zona SL</span>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={(e) => openColorPicker("slZone", "Color de Zona SL", e.currentTarget)}
                      className="w-5 h-5 rounded border border-white/10 relative overflow-hidden flex items-center justify-center bg-zinc-950 cursor-pointer shadow-[inset_0_1px_rgba(255,255,255,0.05)]"
                      style={{ backgroundColor: colors.slZone }}
                    />
                    <span className="text-[11px] font-mono text-zinc-400">{colors.slZone}</span>
                  </div>
                </div>

                {/* Divider */}
                <div className="h-[1px] bg-white/[0.03]" />

                {/* Trade Box fill opacity */}
                <div className="flex flex-col gap-1.5">
                  <div className="flex justify-between items-center text-[11px] text-zinc-400">
                    <span>Opacidad del relleno</span>
                    <span className="font-mono text-zinc-300 font-bold tabular-nums">{fillOpacity}%</span>
                  </div>
                  {/* Premium Low-Profile Slider */}
                  <CustomOpacitySlider
                    min={5}
                    max={50}
                    value={fillOpacity}
                    onChange={setFillOpacity}
                  />
                </div>

                {/* Trade Box border opacity */}
                <div className="flex flex-col gap-1.5">
                  <div className="flex justify-between items-center text-[11px] text-zinc-400">
                    <span>Opacidad del borde</span>
                    <span className="font-mono text-zinc-300 font-bold tabular-nums">{borderOpacity}%</span>
                  </div>
                  {/* Premium Low-Profile Slider */}
                  <CustomOpacitySlider
                    min={10}
                    max={100}
                    value={borderOpacity}
                    onChange={setBorderOpacity}
                  />
                </div>
              </div>
            </div>

            {/* Popover / Custom Tooltip Color Picker (Rendered at Root level of settings tab for scroll safety) */}
            {activePicker && (
              <div
                className="absolute z-50 bg-[#1a1a1a] border border-white/[0.08] rounded-xl p-3 shadow-[0_8px_30px_rgba(0,0,0,0.5)] flex flex-col gap-3 w-[200px] animate-scaleIn"
                style={{
                  left: 55, // perfectly centered horizontally inside the 310px wide content panel
                  top: activePicker.y,
                }}
              >
                <div className="flex justify-between items-center pb-1.5 border-b border-white/[0.04]">
                  <span className="text-[10px] font-bold text-white uppercase truncate">
                    {activePicker.label}
                  </span>
                  <button
                    onClick={() => setActivePicker(null)}
                    className="text-zinc-500 hover:text-white cursor-pointer"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>

                {/* DOM-integrated premium HSL/HSV Color Picker */}
                <CustomColorPicker
                  color={colors[activePicker.key]}
                  onChange={(hex) => handleColorChange(activePicker.key, hex)}
                />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

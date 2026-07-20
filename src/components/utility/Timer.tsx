import { useState, useCallback, useEffect, useRef } from 'react'

type TimerMode = 'stopwatch' | 'countdown'

interface Lap {
  index: number
  time: number
  lapTime: number
}

function fmt(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  const centis = Math.floor((ms % 1000) / 10)

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(centis).padStart(2, '0')}`
  }
  return `${minutes}:${String(seconds).padStart(2, '0')}.${String(centis).padStart(2, '0')}`
}

function fmtLap(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  const centis = Math.floor((ms % 1000) / 10)
  return `${minutes}:${String(seconds).padStart(2, '0')}.${String(centis).padStart(2, '0')}`
}

interface TimerProps {
  expanded?: boolean
}

export function Timer({ expanded = false }: TimerProps) {
  const [mode, setMode] = useState<TimerMode>('stopwatch')
  const [running, setRunning] = useState(false)
  const [finished, setFinished] = useState(false)

  // Stopwatch state
  const [elapsed, setElapsed] = useState(0)
  const [laps, setLaps] = useState<Lap[]>([])

  // Countdown state
  const [cdHours, setCdHours] = useState(0)
  const [cdMinutes, setCdMinutes] = useState(5)
  const [cdSeconds, setCdSeconds] = useState(0)
  const [remaining, setRemaining] = useState(0)       // ms
  const totalRef = useRef(0)                           // total ms for countdown

  const baseRef = useRef(0)
  const startRef = useRef(0)
  const rafRef = useRef(0)
  const lastVibrateRef = useRef(0)

  const tick = useCallback(() => {
    if (mode === 'stopwatch') {
      setElapsed(baseRef.current + (Date.now() - startRef.current))
    } else {
      const rem = totalRef.current - (Date.now() - startRef.current)
      if (rem <= 0) {
        setRemaining(0)
        setRunning(false)
        setFinished(true)
        // Vibrate on finish
        if (navigator.vibrate && Date.now() - lastVibrateRef.current > 3000) {
          navigator.vibrate([200, 100, 200, 100, 400])
          lastVibrateRef.current = Date.now()
        }
        return
      }
      setRemaining(rem)
    }
    rafRef.current = requestAnimationFrame(tick)
  }, [mode])

  // ---- Controls ----
  const handleStart = useCallback(() => {
    if (running) return
    setFinished(false)

    if (mode === 'countdown') {
      const total = (cdHours * 3600 + cdMinutes * 60 + cdSeconds) * 1000
      if (total <= 0) return
      totalRef.current = total
      baseRef.current = total
      startRef.current = Date.now()
      setRemaining(total)
    } else {
      baseRef.current = elapsed
      startRef.current = Date.now()
    }

    setRunning(true)
    rafRef.current = requestAnimationFrame(tick)
  }, [running, mode, elapsed, cdHours, cdMinutes, cdSeconds, tick])

  const handlePause = useCallback(() => {
    if (!running) return
    cancelAnimationFrame(rafRef.current)
    if (mode === 'stopwatch') {
      baseRef.current = elapsed
    } else {
      baseRef.current = remaining
    }
    setRunning(false)
  }, [running, mode, elapsed, remaining])

  const handleReset = useCallback(() => {
    cancelAnimationFrame(rafRef.current)
    setRunning(false)
    setFinished(false)
    setElapsed(0)
    setLaps([])
    baseRef.current = 0
  }, [])

  const handleLap = useCallback(() => {
    if (!running || mode !== 'stopwatch') return
    const prevTotal = laps.length > 0 ? laps[laps.length - 1].time : 0
    setLaps(prev => [...prev, { index: prev.length + 1, time: elapsed, lapTime: elapsed - prevTotal }])
  }, [running, mode, elapsed, laps])

  const switchMode = useCallback((m: TimerMode) => {
    if (running) return
    cancelAnimationFrame(rafRef.current)
    setMode(m)
    setFinished(false)
    setElapsed(0)
    setLaps([])
    setRemaining(0)
    baseRef.current = 0
  }, [running])

  useEffect(() => () => cancelAnimationFrame(rafRef.current), [])

  // ---- Display value ----
  const displayMs = mode === 'countdown' ? remaining : elapsed
  const isFlashing = finished

  // Lap stats
  const lapTimes = laps.map(l => l.lapTime)
  const bestLap = lapTimes.length > 1 ? Math.min(...lapTimes) : null
  const worstLap = lapTimes.length > 1 ? Math.max(...lapTimes) : null

  // Progress percentage for countdown
  const countdownPct = totalRef.current > 0 ? (remaining / totalRef.current) * 100 : 0

  const textSizeClass = expanded
    ? 'text-6xl'
    : displayMs >= 3600000
      ? 'text-3xl'
      : 'text-5xl'

  return (
    <div className="select-none">
      {/* Mode tabs */}
      <div className="flex border-b border-gray-100 mb-3">
        <button
          onClick={() => switchMode('stopwatch')}
          className={`flex-1 py-2 text-xs font-medium transition ${
            mode === 'stopwatch'
              ? 'text-gray-900 border-b-2 border-gray-800'
              : 'text-gray-400 hover:text-gray-600'
          }`}
        >
          ⏱ 计时
        </button>
        <button
          onClick={() => switchMode('countdown')}
          className={`flex-1 py-2 text-xs font-medium transition ${
            mode === 'countdown'
              ? 'text-gray-900 border-b-2 border-gray-800'
              : 'text-gray-400 hover:text-gray-600'
          }`}
        >
          ⏳ 倒计时
        </button>
      </div>

      {/* Display */}
      <div className="text-center py-4">
        {/* Progress ring for countdown */}
        {mode === 'countdown' && running && (
          <div className="w-full bg-gray-100 rounded-full h-2 mb-3 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-300 ${
                countdownPct > 20 ? 'bg-gray-700' : 'bg-red-500'
              }`}
              style={{ width: `${countdownPct}%` }}
            />
          </div>
        )}

        <div className={`font-mono font-black tracking-wider tabular-nums transition-all ${textSizeClass} ${
          running ? 'text-gray-900' : finished ? 'text-red-500 animate-pulse' : 'text-gray-500'
        }`}>
          {mode === 'countdown' && !running && !finished ? (
            <span className="text-gray-300 select-auto">{fmt((cdHours * 3600 + cdMinutes * 60 + cdSeconds) * 1000)}</span>
          ) : (
            fmt(displayMs)
          )}
        </div>

        {mode === 'countdown' && finished && (
          <div className="text-red-500 text-sm font-bold mt-1 animate-bounce">⏰ 时间到！</div>
        )}
      </div>

      {/* Countdown setting */}
      {mode === 'countdown' && !running && !finished && (
        <div className="flex items-center justify-center gap-2 mb-4">
          <TimeInput value={cdHours} min={0} max={99} label="时" onChange={setCdHours} />
          <span className="text-gray-300 text-xl font-bold">:</span>
          <TimeInput value={cdMinutes} min={0} max={59} label="分" onChange={setCdMinutes} />
          <span className="text-gray-300 text-xl font-bold">:</span>
          <TimeInput value={cdSeconds} min={0} max={59} label="秒" onChange={setCdSeconds} />
        </div>
      )}

      {/* Controls */}
      <div className="flex items-center justify-center gap-4 mb-4">
        {/* Start / Pause */}
        {mode === 'countdown' && finished ? (
          <button
            onClick={handleReset}
            className={`w-16 h-16 rounded-full flex items-center justify-center text-white font-bold text-lg shadow-lg transition active:scale-90 bg-gray-700 hover:bg-gray-800 shadow-gray-200`}
          >
            ↺
          </button>
        ) : (
          <button
            onClick={running ? handlePause : handleStart}
            className={`w-16 h-16 rounded-full flex items-center justify-center text-white font-bold text-lg shadow-lg transition active:scale-90 ${
              running
                ? 'bg-amber-500 hover:bg-amber-600 shadow-amber-200'
                : 'bg-green-500 hover:bg-green-600 shadow-green-200'
            }`}
          >
            {running ? '⏸' : '▶'}
          </button>
        )}

        {/* Lap — only for stopwatch */}
        {mode === 'stopwatch' && (
          <button
            onClick={handleLap}
            disabled={!running}
            className="w-12 h-12 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-600 font-bold text-sm transition active:scale-90 disabled:opacity-30 disabled:cursor-not-allowed shadow-sm"
          >
            🫎
          </button>
        )}

        {/* Reset */}
        <button
          onClick={handleReset}
          disabled={!running && (mode === 'stopwatch' ? elapsed === 0 : false)}
          className="w-12 h-12 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-500 transition active:scale-90 disabled:opacity-30 disabled:cursor-not-allowed shadow-sm flex items-center justify-center text-lg"
          title="重置"
        >
          ↺
        </button>
      </div>

      {/* Lap list (stopwatch only) */}
      {mode === 'stopwatch' && laps.length > 0 && (
        <div className="border-t border-gray-100 pt-3">
          <div className="flex items-center justify-between text-[10px] text-gray-400 px-1 mb-1">
            <span>圈数</span>
            <span>单圈</span>
            <span>总时间</span>
          </div>
          <div className="max-h-40 overflow-y-auto space-y-0.5">
            {[...laps].reverse().map(lap => {
              const isBest = bestLap !== null && lap.lapTime === bestLap
              const isWorst = worstLap !== null && lap.lapTime === worstLap
              return (
                <div
                  key={lap.index}
                  className={`flex items-center justify-between px-2 py-1 rounded text-xs font-mono tabular-nums ${
                    isBest && isWorst ? 'text-gray-500'
                      : isBest ? 'bg-green-50 text-green-600'
                        : isWorst ? 'bg-red-50 text-red-500'
                          : 'text-gray-600'
                  }`}
                >
                  <span>{isBest && !isWorst && '🏆 '}{lap.index}</span>
                  <span>{fmtLap(lap.lapTime)}</span>
                  <span>{fmtLap(lap.time)}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

/* ── Time input sub-component ── */
function TimeInput({
  value, min, max, label, onChange,
}: {
  value: number
  min: number
  max: number
  label: string
  onChange: (v: number) => void
}) {
  return (
    <div className="flex flex-col items-center">
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={e => {
          const v = Math.max(min, Math.min(max, parseInt(e.target.value) || 0))
          onChange(v)
        }}
        className="w-14 text-center text-lg font-bold border border-gray-200 rounded-lg py-1.5 focus:outline-none focus:ring-2 focus:ring-gray-400 focus:border-gray-400 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
      />
      <span className="text-[10px] text-gray-400 mt-0.5">{label}</span>
    </div>
  )
}
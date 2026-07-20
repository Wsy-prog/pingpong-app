import { useState, useCallback, useEffect, useReducer } from 'react'

const LS_KEY = 'pingpong_scoreboard_settings'

interface ScoreboardSettings {
  winPoints: number
  redName: string
  blueName: string
}

function loadSettings(): ScoreboardSettings {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (raw) return JSON.parse(raw)
  } catch { /* ignore */ }
  return { winPoints: 11, redName: '', blueName: '' }
}

function saveSettings(s: ScoreboardSettings) {
  localStorage.setItem(LS_KEY, JSON.stringify(s))
}

interface GameState {
  redPoints: number
  bluePoints: number
  redGames: number
  blueGames: number
  winner: 'red' | 'blue' | null
}

interface PointRecord {
  side: 'red' | 'blue'
  redAfter: number
  blueAfter: number
  isGameEnd: boolean
}

interface ScoreboardProps {
  expanded?: boolean
}

type Side = 'red' | 'blue'

/* ── Side Panel Component ── */
function SidePanel({
  side,
  points,
  games,
  winner,
  expanded,
  onAdjust,
  displayName,
}: {
  side: Side
  points: number
  games: number
  winner: Side | null
  expanded: boolean
  onAdjust: (delta: number) => void
  displayName: string
}) {
  const isRed = side === 'red'

  const emoji = isRed ? '🔴' : '🔵'
  const label = isRed ? '红方' : '蓝方'
  const nameDisplay = displayName || label

  // Tailwind class sets — static strings only
  const bgGrad = isRed
    ? 'from-red-50 via-red-50 to-white'
    : 'from-blue-50 via-blue-50 to-white'
  const labelColor = isRed ? 'text-red-600' : 'text-blue-600'
  const scoreBoxActive = isRed
    ? 'bg-red-100 border-red-400 shadow-lg shadow-red-200'
    : 'bg-blue-100 border-blue-400 shadow-lg shadow-blue-200'
  const scoreBoxDefault = isRed
    ? 'bg-white border-red-200 shadow-inner'
    : 'bg-white border-blue-200 shadow-inner'
  const scoreTextActive = isRed ? 'text-red-500' : 'text-blue-500'
  const scoreTextDefault = isRed ? 'text-red-600' : 'text-blue-600'
  const gamesBoxBg = isRed ? 'bg-red-100 border-red-200' : 'bg-blue-100 border-blue-200'
  const gamesLabelColor = isRed ? 'text-red-400' : 'text-blue-400'
  const gamesTextColor = isRed ? 'text-red-600' : 'text-blue-600'
  const btnMinusCls = isRed
    ? 'bg-red-100 hover:bg-red-200 text-red-600 border-red-200'
    : 'bg-blue-100 hover:bg-blue-200 text-blue-600 border-blue-200'
  const btnPlusCls = isRed
    ? 'bg-red-500 hover:bg-red-600 shadow-red-200'
    : 'bg-blue-500 hover:bg-blue-600 shadow-blue-200'

  const isWinner = winner === side

  return (
    <div className={`flex-1 bg-gradient-to-b ${bgGrad} p-5 flex flex-col items-center gap-3`}>
      <div className={`text-sm font-bold ${labelColor} uppercase tracking-wider`}>
        {emoji} {nameDisplay}
      </div>

      {/* 小分 — Large Box */}
      <div
        className={`
          rounded-2xl flex items-center justify-center border-2 transition-all
          ${expanded ? 'w-36 h-36' : 'w-24 h-24 sm:w-28 sm:h-28'}
          ${isWinner ? scoreBoxActive : scoreBoxDefault}
        `}
      >
        <span
          className={`font-black tabular-nums transition-all ${
            expanded ? 'text-7xl' : 'text-5xl sm:text-6xl'
          } ${isWinner ? `${scoreTextActive} scale-110` : scoreTextDefault}`}
        >
          {points}
        </span>
      </div>

      {/* 局分 — Small Box */}
      <div className="flex items-center gap-1.5">
        <span className={`text-[10px] ${gamesLabelColor} font-medium`}>局分</span>
        <div className={`min-w-[2.5rem] h-9 rounded-lg ${gamesBoxBg} flex items-center justify-center border`}>
          <span className={`text-lg font-bold ${gamesTextColor} tabular-nums`}>{games}</span>
        </div>
      </div>

      {/* +/- Buttons */}
      <div className={`flex items-center gap-3 mt-1 ${expanded ? 'gap-4' : 'gap-3'}`}>
        <button
          onClick={() => onAdjust(-1)}
          disabled={points === 0}
          className={`rounded-full font-bold transition active:scale-90 flex items-center justify-center border disabled:opacity-30 disabled:cursor-not-allowed ${btnMinusCls} ${
            expanded ? 'w-12 h-12 text-2xl' : 'w-9 h-9 text-lg'
          }`}
        >
          −
        </button>
        <button
          onClick={() => onAdjust(1)}
          className={`rounded-full text-white font-bold transition active:scale-90 flex items-center justify-center shadow-md ${btnPlusCls} ${
            expanded ? 'w-14 h-14 text-2xl' : 'w-11 h-11 text-xl'
          }`}
        >
          +
        </button>
      </div>
    </div>
  )
}

/* ── Export Modal ── */
function ExportModal({
  redLabel,
  blueLabel,
  winPoints,
  redGames,
  blueGames,
  history,
  onClose,
}: {
  redLabel: string
  blueLabel: string
  winPoints: number
  redGames: number
  blueGames: number
  history: PointRecord[]
  onClose: () => void
}) {
  const [copied, setCopied] = useState(false)

  // Split history into completed games
  // First deduplicate: remove consecutive records with identical scores (StrictMode guard)
  const deduped = history.filter((p, i, arr) => {
    if (i === 0) return true
    const prev = arr[i - 1]
    return prev.redAfter !== p.redAfter || prev.blueAfter !== p.blueAfter || prev.side !== p.side
  })

  const completedGames: PointRecord[][] = []
  let current: PointRecord[] = []
  for (const p of deduped) {
    current.push(p)
    if (p.isGameEnd) {
      completedGames.push(current)
      current = []
    }
  }
  // `current` has the ongoing game's points — ignored in export

  // Generate plain text for copy/download
  const now = new Date()
  const dateStr = now.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })

  const lines: string[] = []
  lines.push('= 乒乓球比赛记录 =')
  lines.push(`日期：${dateStr}`)
  lines.push(`赛制：${winPoints}分制`)
  lines.push(`红方：${redLabel}  vs  蓝方：${blueLabel}`)
  lines.push(`总比分：${redLabel} ${redGames} - ${blueGames} ${blueLabel}`)
  lines.push('')
  for (let g = 0; g < completedGames.length; g++) {
    const pts = completedGames[g]
    const last = pts[pts.length - 1]
    const winner = last.isGameEnd ? last.side : null
    const wEmoji = winner === 'red' ? '(红)' : '(蓝)'
    const wName = winner === 'red' ? redLabel : blueLabel
    lines.push(`第${g + 1}局  ${wEmoji}${wName} ${last.redAfter}-${last.blueAfter}`)
    for (const p of pts) {
      const m = p.side === 'red' ? '[红]' : '[蓝]'
      lines.push(`  ${m}+1  ${p.redAfter}-${p.blueAfter}`)
    }
    lines.push('')
  }
  const exportText = lines.join('\n')

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(exportText)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      const ta = document.createElement('textarea')
      ta.value = exportText
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const handleDownload = () => {
    const blob = new Blob([exportText], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `比赛记录_${redLabel}vs${blueLabel}_${now.toISOString().slice(0, 10)}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  // Total games played
  const totalGames = completedGames.length

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b shrink-0">
          <h3 className="font-bold text-base flex items-center gap-2">📋 比赛记录</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>

        {/* Score summary card */}
        <div className="px-5 py-4 border-b shrink-0">
          <div className="text-[10px] text-gray-400 mb-3">{dateStr}</div>
          <div className="flex items-center gap-3">
            {/* Red side */}
            <div className="flex-1 text-right">
              <div className="text-xs text-red-500 font-medium">{redLabel}</div>
            </div>
            {/* Score big */}
            <div className="flex items-center gap-2 bg-gray-50 rounded-xl px-4 py-2">
              <span className={`text-2xl font-black tabular-nums ${redGames > blueGames ? 'text-red-500' : 'text-gray-400'}`}>
                {redGames}
              </span>
              <span className="text-gray-300 text-lg font-bold">:</span>
              <span className={`text-2xl font-black tabular-nums ${blueGames > redGames ? 'text-blue-500' : 'text-gray-400'}`}>
                {blueGames}
              </span>
            </div>
            {/* Blue side */}
            <div className="flex-1 text-left">
              <div className="text-xs text-blue-500 font-medium">{blueLabel}</div>
            </div>
          </div>
          {redGames !== blueGames && (
            <div className="text-center mt-2 text-xs font-bold text-amber-600">
              🏆 {redGames > blueGames ? '🔴' : '🔵'} {redGames > blueGames ? redLabel : blueLabel} 获胜
            </div>
          )}
          <div className="text-center text-[10px] text-gray-400 mt-1">
            {winPoints}分制 · 共{totalGames}局
          </div>
        </div>

        {/* Game list */}
        <div className="flex-1 overflow-auto p-4 space-y-3">
          {completedGames.length === 0 && (
            <div className="text-center text-gray-400 text-sm py-8">暂无已完成的对局</div>
          )}
          {completedGames.map((pts, idx) => {
            const last = pts[pts.length - 1]
            const winner = last.isGameEnd ? last.side : null
            const wEmoji = winner === 'red' ? '🔴' : '🔵'
            const wName = winner === 'red' ? redLabel : blueLabel

            return (
              <div key={idx} className="border border-gray-100 rounded-lg overflow-hidden">
                <div className="flex items-center justify-between bg-gray-50 px-3 py-1.5 border-b border-gray-100">
                  <span className="font-bold text-xs text-gray-500">第{idx + 1}局</span>
                  <span className="text-xs font-bold">
                    {wEmoji} {wName}
                    <span className="text-gray-600 ml-2 font-mono">{last.redAfter}:{last.blueAfter}</span>
                  </span>
                </div>
                {/* Single-column point sequence */}
                <div className="px-3 py-2 space-y-0.5">
                  {pts.map((p, i) => (
                    <div key={i} className={`text-[11px] font-mono leading-5 ${p.isGameEnd ? 'font-bold' : ''}`}>
                      <span className={p.side === 'red' ? 'text-red-500' : 'text-blue-500'}>
                        {p.side === 'red' ? '🔴' : '🔵'}
                      </span>
                      <span className="text-gray-700 ml-1 tabular-nums">
                        {p.redAfter} - {p.blueAfter}
                      </span>
                      {p.isGameEnd && <span className="text-yellow-600 ml-1">🏁 胜</span>}
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 px-5 py-3 border-t bg-gray-50 shrink-0">
          <button
            onClick={handleDownload}
            className="px-4 py-2 text-xs bg-gray-700 hover:bg-gray-800 text-white rounded-lg transition font-medium"
          >
            ⬇️ 下载文件
          </button>
          <button
            onClick={handleCopy}
            className={`px-4 py-2 text-xs rounded-lg transition font-medium ${
              copied
                ? 'bg-green-100 text-green-700'
                : 'bg-gray-200 hover:bg-gray-300 text-gray-700'
            }`}
          >
            {copied ? '✅ 已复制' : '📋 复制文本'}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ── Reducer: game state + point history in one ── */
interface ScoreboardState extends GameState {
  pointHistory: PointRecord[]
}

type ScoreboardAction =
  | { type: 'POINT'; side: Side; delta: number; winPoints: number }
  | { type: 'RESET_GAME' }
  | { type: 'RESET_ALL' }
  | { type: 'SETTINGS_CHANGED' }

function scoreboardReducer(state: ScoreboardState, action: ScoreboardAction): ScoreboardState {
  switch (action.type) {
    case 'POINT': {
      const { side, delta, winPoints } = action
      let { redPoints, bluePoints, redGames, blueGames, pointHistory } = state

      if (side === 'red') redPoints = Math.max(0, redPoints + delta)
      else bluePoints = Math.max(0, bluePoints + delta)

      // Game-winning point
      if (redPoints >= winPoints && redPoints - bluePoints >= 2) {
        return {
          redPoints: 0, bluePoints: 0, redGames: redGames + 1, blueGames, winner: 'red',
          pointHistory: [...pointHistory, { side: 'red', redAfter: redPoints, blueAfter: bluePoints, isGameEnd: true }],
        }
      }
      if (bluePoints >= winPoints && bluePoints - redPoints >= 2) {
        return {
          redPoints: 0, bluePoints: 0, redGames, blueGames: blueGames + 1, winner: 'blue',
          pointHistory: [...pointHistory, { side: 'blue', redAfter: redPoints, blueAfter: bluePoints, isGameEnd: true }],
        }
      }

      // Normal point — only record +1
      const newHistory = delta > 0
        ? [...pointHistory, { side, redAfter: redPoints, blueAfter: bluePoints, isGameEnd: false }]
        : pointHistory

      return { redPoints, bluePoints, redGames, blueGames, winner: null, pointHistory: newHistory }
    }

    case 'RESET_GAME': {
      const { pointHistory } = state
      const lastEnd = [...pointHistory].reverse().findIndex(p => p.isGameEnd)
      const kept = lastEnd === -1 ? [] : pointHistory.slice(0, pointHistory.length - lastEnd - 1)
      return { ...state, redPoints: 0, bluePoints: 0, winner: null, pointHistory: kept }
    }

    case 'RESET_ALL':
      return { redPoints: 0, bluePoints: 0, redGames: 0, blueGames: 0, winner: null, pointHistory: [] }

    case 'SETTINGS_CHANGED':
      return { ...state, redPoints: 0, bluePoints: 0, winner: null }

    default:
      return state
  }
}

/* ── Main Scoreboard ── */
export function Scoreboard({ expanded = false }: ScoreboardProps) {
  const [settings, setSettings] = useState<ScoreboardSettings>(loadSettings)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [draft, setDraft] = useState<ScoreboardSettings>({ ...settings })
  const [exportOpen, setExportOpen] = useState(false)
  const [flipped, setFlipped] = useState(false)

  const [state, dispatch] = useReducer(scoreboardReducer, {
    redPoints: 0,
    bluePoints: 0,
    redGames: 0,
    blueGames: 0,
    winner: null,
    pointHistory: [],
  })

  // Persist settings on change
  useEffect(() => { saveSettings(settings) }, [settings])

  const { winPoints, redName, blueName } = settings

  const handleAdjust = useCallback((side: Side, delta: number) => {
    dispatch({ type: 'POINT', side, delta, winPoints })
  }, [winPoints])

  const handleResetGame = useCallback(() => {
    dispatch({ type: 'RESET_GAME' })
  }, [])

  const handleResetAll = useCallback(() => {
    dispatch({ type: 'RESET_ALL' })
  }, [])

  const handleFlip = useCallback(() => {
    setFlipped(prev => !prev)
  }, [])

  // Settings
  const openSettings = useCallback(() => {
    setDraft({ ...settings })
    setSettingsOpen(true)
  }, [settings])

  const applySettings = useCallback(() => {
    const wp = Math.max(1, Math.min(500, draft.winPoints || 11))
    setSettings({ winPoints: wp, redName: draft.redName.trim(), blueName: draft.blueName.trim() })
    setSettingsOpen(false)
    dispatch({ type: 'SETTINGS_CHANGED' })
  }, [draft])

  const cancelSettings = useCallback(() => {
    setSettingsOpen(false)
  }, [])

  const openExport = useCallback(() => {
    setExportOpen(true)
  }, [])

  const closeExport = useCallback(() => {
    setExportOpen(false)
  }, [])

  const { redPoints, bluePoints, redGames, blueGames, winner, pointHistory } = state
  const showDeuce = redPoints >= winPoints - 1 && bluePoints >= winPoints - 1 && redPoints === bluePoints

  // Win announcement text
  const redLabel = redName || '红方'
  const blueLabel = blueName || '蓝方'

  // Panels — swap sides when flipped
  const LeftPanel = flipped ? (
    <SidePanel side="blue" points={bluePoints} games={blueGames} winner={winner} expanded={expanded} onAdjust={d => handleAdjust('blue', d)} displayName={blueLabel} />
  ) : (
    <SidePanel side="red" points={redPoints} games={redGames} winner={winner} expanded={expanded} onAdjust={d => handleAdjust('red', d)} displayName={redLabel} />
  )

  const RightPanel = flipped ? (
    <SidePanel side="red" points={redPoints} games={redGames} winner={winner} expanded={expanded} onAdjust={d => handleAdjust('red', d)} displayName={redLabel} />
  ) : (
    <SidePanel side="blue" points={bluePoints} games={blueGames} winner={winner} expanded={expanded} onAdjust={d => handleAdjust('blue', d)} displayName={blueLabel} />
  )

  return (
    <div className="bg-white rounded-xl shadow-sm overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-gray-700 to-gray-900 px-5 py-3 flex items-center justify-between">
        <h3 className="text-white font-bold text-base flex items-center gap-2">
          🏓 记分牌
        </h3>
        <div className="flex items-center gap-2">
          {showDeuce && (
            <span className="text-yellow-300 text-xs font-bold animate-pulse">⚡ DEUCE</span>
          )}
          {winner && (
            <span
              className={`text-xs font-bold px-2 py-0.5 rounded-full animate-bounce ${
                winner === 'red' ? 'bg-red-500 text-white' : 'bg-blue-500 text-white'
              }`}
            >
              {winner === 'red' ? `🔴 ${redLabel}得局！` : `🔵 ${blueLabel}得局！`}
            </span>
          )}
          {flipped && <span className="text-gray-400 text-xs">已换边</span>}
          <span className="text-gray-400 text-xs">{winPoints}分制</span>
        </div>
      </div>

      {/* Settings Panel */}
      {settingsOpen && (
        <div className="border-b bg-gray-50 px-5 py-4 space-y-3 animate-slideDown">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">🔴 红方</label>
              <input
                type="text"
                value={draft.redName}
                onChange={e => setDraft(p => ({ ...p, redName: e.target.value }))}
                placeholder="输入选手名"
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-400 focus:border-red-400"
                maxLength={16}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">🔵 蓝方</label>
              <input
                type="text"
                value={draft.blueName}
                onChange={e => setDraft(p => ({ ...p, blueName: e.target.value }))}
                placeholder="输入选手名"
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-blue-400"
                maxLength={16}
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">
              每局目标分
            </label>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={1}
                max={500}
                value={draft.winPoints}
                onChange={e => setDraft(p => ({ ...p, winPoints: Number(e.target.value) }))}
                className="flex-1 accent-gray-700"
              />
              <input
                type="number"
                min={1}
                max={500}
                value={draft.winPoints}
                onChange={e => {
                  const v = e.target.value === '' ? 1 : Math.max(1, Math.min(500, Number(e.target.value)))
                  setDraft(p => ({ ...p, winPoints: v }))
                }}
                className="w-16 text-center text-sm font-bold border border-gray-300 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-gray-400 focus:border-gray-400 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              />
              <span className="text-xs text-gray-400">分</span>
            </div>
            <div className="flex justify-between text-[10px] text-gray-400 mt-0.5">
              <span>1</span>
              <span>11</span>
              <span>21</span>
              <span>50</span>
              <span>100</span>
              <span>500</span>
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-1">
            <button onClick={cancelSettings} className="px-4 py-1.5 text-xs text-gray-500 hover:text-gray-700 hover:bg-gray-200 rounded-lg transition">
              取消
            </button>
            <button onClick={applySettings} className="px-4 py-1.5 text-xs bg-gray-700 hover:bg-gray-800 text-white rounded-lg transition font-medium">
              应用
            </button>
          </div>
        </div>
      )}

      {/* Main Score Area */}
      <div key={flipped ? 'flipped' : 'normal'} className="flex transition-all duration-300">
        {LeftPanel}

        {/* VS Divider */}
        <div className="relative flex flex-col items-center justify-center w-0">
          <div className="absolute w-10 h-10 rounded-full bg-gray-800 flex items-center justify-center shadow-lg z-10">
            <span className="text-white text-[10px] font-black">VS</span>
          </div>
        </div>

        {RightPanel}
      </div>

      {/* Footer Actions */}
      <div className="bg-gray-50 border-t px-5 py-2.5 flex items-center justify-center gap-6">
        <button onClick={openSettings} className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700 hover:bg-gray-200 rounded-lg transition" title="设置">
          ⚙️ 设置
        </button>

        <button onClick={handleFlip} className={`px-3 py-1.5 text-xs rounded-lg transition font-medium flex items-center gap-1 ${
          flipped ? 'bg-indigo-100 text-indigo-600 hover:bg-indigo-200' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200'
        }`}>
          ↔ {flipped ? '恢复' : '换边'}
        </button>

        <button
          onClick={openExport}
          className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700 hover:bg-gray-200 rounded-lg transition"
          title="导出得分记录"
        >
          📋 导出
        </button>

        <button onClick={handleResetGame} className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700 hover:bg-gray-200 rounded-lg transition">
          重置小分
        </button>

        <button onClick={handleResetAll} className="px-3 py-1.5 text-xs text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition font-medium">
          全部重置
        </button>
      </div>

      {/* Export Modal */}
      {exportOpen && (
        <ExportModal
          redLabel={redLabel}
          blueLabel={blueLabel}
          winPoints={winPoints}
          redGames={redGames}
          blueGames={blueGames}
          history={pointHistory}
          onClose={closeExport}
        />
      )}
    </div>
  )
}
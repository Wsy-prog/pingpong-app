import { useState, useCallback } from 'react'

const WIN_POINTS = 11

interface GameState {
  redPoints: number
  bluePoints: number
  redGames: number
  blueGames: number
  winner: 'red' | 'blue' | null
}

interface ScoreboardProps {
  expanded?: boolean
}

export function Scoreboard({ expanded = false }: ScoreboardProps) {
  const [state, setState] = useState<GameState>({
    redPoints: 0,
    bluePoints: 0,
    redGames: 0,
    blueGames: 0,
    winner: null,
  })

  const handleAdjust = useCallback((side: 'red' | 'blue', delta: number) => {
    setState(prev => {
      if (prev.winner) {
        // If there's a winner, clear it first but apply the adjustment
      }

      let { redPoints, bluePoints, redGames, blueGames } = prev

      if (side === 'red') {
        redPoints = Math.max(0, redPoints + delta)
      } else {
        bluePoints = Math.max(0, bluePoints + delta)
      }

      // Check win condition: reach WIN_POINTS and lead by at least 2
      if (redPoints >= WIN_POINTS && redPoints - bluePoints >= 2) {
        return {
          redPoints: 0,
          bluePoints: 0,
          redGames: redGames + 1,
          blueGames,
          winner: 'red' as const,
        }
      }
      if (bluePoints >= WIN_POINTS && bluePoints - redPoints >= 2) {
        return {
          redPoints: 0,
          bluePoints: 0,
          redGames,
          blueGames: blueGames + 1,
          winner: 'blue' as const,
        }
      }

      return {
        redPoints,
        bluePoints,
        redGames,
        blueGames,
        winner: null,
      }
    })
  }, [])

  const handleResetGame = useCallback(() => {
    setState(prev => ({
      ...prev,
      redPoints: 0,
      bluePoints: 0,
      winner: null,
    }))
  }, [])

  const handleResetAll = useCallback(() => {
    setState({
      redPoints: 0,
      bluePoints: 0,
      redGames: 0,
      blueGames: 0,
      winner: null,
    })
  }, [])

  const { redPoints, bluePoints, redGames, blueGames, winner } = state
  const isDeuce = redPoints >= 10 && bluePoints >= 10 && redPoints === bluePoints

  return (
    <div className="bg-white rounded-xl shadow-sm overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-gray-700 to-gray-900 px-5 py-3 flex items-center justify-between">
        <h3 className="text-white font-bold text-base flex items-center gap-2">
          🏓 记分牌
        </h3>
        <div className="flex items-center gap-2">
          {isDeuce && (
            <span className="text-yellow-300 text-xs font-bold animate-pulse">
              ⚡ DEUCE
            </span>
          )}
          {winner && (
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full animate-bounce ${
              winner === 'red'
                ? 'bg-red-500 text-white'
                : 'bg-blue-500 text-white'
            }`}>
              {winner === 'red' ? '🔴 红方得局！' : '🔵 蓝方得局！'}
            </span>
          )}
          <span className="text-gray-400 text-xs">11分制</span>
        </div>
      </div>

      {/* Main Score Area */}
      <div className="flex">
        {/* Red Side */}
        <div className="flex-1 bg-gradient-to-b from-red-50 via-red-50 to-white p-5 flex flex-col items-center gap-3">
          <div className="text-sm font-bold text-red-600 uppercase tracking-wider">
            🔴 红方
          </div>

          {/* 小分 - Large Box */}
          <div className={`
            rounded-2xl flex items-center justify-center border-2 transition-all
            ${expanded ? 'w-36 h-36' : 'w-24 h-24 sm:w-28 sm:h-28'}
            ${winner === 'red'
              ? 'bg-red-100 border-red-400 shadow-lg shadow-red-200'
              : 'bg-white border-red-200 shadow-inner'
            }
          `}>
            <span className={`font-black tabular-nums transition-all ${
              expanded ? 'text-7xl' : 'text-5xl sm:text-6xl'
            } ${winner === 'red' ? 'text-red-500 scale-110' : 'text-red-600'}`}>
              {redPoints}
            </span>
          </div>

          {/* 局分 - Small Box */}
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-red-400 font-medium">局分</span>
            <div className="min-w-[2.5rem] h-9 rounded-lg bg-red-100 flex items-center justify-center border border-red-200">
              <span className="text-lg font-bold text-red-600 tabular-nums">
                {redGames}
              </span>
            </div>
          </div>

          {/* +/- Buttons */}
          <div className={`flex items-center gap-3 mt-1 ${expanded ? 'gap-4' : 'gap-3'}`}>
            <button
              onClick={() => handleAdjust('red', -1)}
              disabled={redPoints === 0}
              className={`rounded-full bg-red-100 hover:bg-red-200 text-red-600 font-bold transition active:scale-90 flex items-center justify-center border border-red-200 disabled:opacity-30 disabled:cursor-not-allowed ${
                expanded ? 'w-12 h-12 text-2xl' : 'w-9 h-9 text-lg'
              }`}
            >
              −
            </button>
            <button
              onClick={() => handleAdjust('red', 1)}
              className={`rounded-full bg-red-500 hover:bg-red-600 text-white font-bold transition active:scale-90 flex items-center justify-center shadow-md shadow-red-200 ${
                expanded ? 'w-14 h-14 text-2xl' : 'w-11 h-11 text-xl'
              }`}
            >
              +
            </button>
          </div>
        </div>

        {/* VS Divider */}
        <div className="relative flex flex-col items-center justify-center w-0">
          <div className="absolute w-10 h-10 rounded-full bg-gray-800 flex items-center justify-center shadow-lg z-10">
            <span className="text-white text-[10px] font-black">VS</span>
          </div>
          {/* Vertical line */}
          <div className="h-full w-px bg-gray-200" />
        </div>

        {/* Blue Side */}
        <div className="flex-1 bg-gradient-to-b from-blue-50 via-blue-50 to-white p-5 flex flex-col items-center gap-3">
          <div className="text-sm font-bold text-blue-600 uppercase tracking-wider">
            🔵 蓝方
          </div>

          {/* 小分 - Large Box */}
          <div className={`
            rounded-2xl flex items-center justify-center border-2 transition-all
            ${expanded ? 'w-36 h-36' : 'w-24 h-24 sm:w-28 sm:h-28'}
            ${winner === 'blue'
              ? 'bg-blue-100 border-blue-400 shadow-lg shadow-blue-200'
              : 'bg-white border-blue-200 shadow-inner'
            }
          `}>
            <span className={`font-black tabular-nums transition-all ${
              expanded ? 'text-7xl' : 'text-5xl sm:text-6xl'
            } ${winner === 'blue' ? 'text-blue-500 scale-110' : 'text-blue-600'}`}>
              {bluePoints}
            </span>
          </div>

          {/* 局分 - Small Box */}
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-blue-400 font-medium">局分</span>
            <div className="min-w-[2.5rem] h-9 rounded-lg bg-blue-100 flex items-center justify-center border border-blue-200">
              <span className="text-lg font-bold text-blue-600 tabular-nums">
                {blueGames}
              </span>
            </div>
          </div>

          {/* +/- Buttons */}
          <div className={`flex items-center mt-1 ${expanded ? 'gap-4' : 'gap-3'}`}>
            <button
              onClick={() => handleAdjust('blue', -1)}
              disabled={bluePoints === 0}
              className={`rounded-full bg-blue-100 hover:bg-blue-200 text-blue-600 font-bold transition active:scale-90 flex items-center justify-center border border-blue-200 disabled:opacity-30 disabled:cursor-not-allowed ${
                expanded ? 'w-12 h-12 text-2xl' : 'w-9 h-9 text-lg'
              }`}
            >
              −
            </button>
            <button
              onClick={() => handleAdjust('blue', 1)}
              className={`rounded-full bg-blue-500 hover:bg-blue-600 text-white font-bold transition active:scale-90 flex items-center justify-center shadow-md shadow-blue-200 ${
                expanded ? 'w-14 h-14 text-2xl' : 'w-11 h-11 text-xl'
              }`}
            >
              +
            </button>
          </div>
        </div>
      </div>

      {/* Footer Actions */}
      <div className="bg-gray-50 border-t px-5 py-2.5 flex items-center justify-center gap-6">
        <button
          onClick={handleResetGame}
          className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700 hover:bg-gray-200 rounded-lg transition"
        >
          重置小分
        </button>
        <button
          onClick={handleResetAll}
          className="px-3 py-1.5 text-xs text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition font-medium"
        >
          全部重置
        </button>
      </div>
    </div>
  )
}

import { useEffect, useState } from 'react'
import { useFullscreen } from '../hooks/useFullscreen'
import { Scoreboard } from '../components/utility/Scoreboard'
import { UtilityTool } from '../components/utility/UtilityTool'
import { Timer } from '../components/utility/Timer'

type ToolTab = 'scoreboard' | 'timer'

export function UtilityPage() {
  const { isFullscreen, isLandscape, apiSupported, enterFullscreen, exitFullscreen } = useFullscreen()
  const [isMobile, setIsMobile] = useState(false)
  const [toolTab, setToolTab] = useState<ToolTab>('scoreboard')

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  return (
    <div className={`space-y-4 ${isFullscreen && isLandscape ? 'flex flex-col h-full' : ''}`}>
      {/* Header — minimal in fullscreen */}
      <div className={`flex items-center gap-2 ${isFullscreen && isLandscape ? 'px-2 pt-1 shrink-0' : ''}`}>
        {isFullscreen && isLandscape ? (
          <>
            <button onClick={exitFullscreen} className="text-gray-400 hover:text-gray-600 text-lg leading-none px-1">✕</button>
            {/* Tab switcher */}
            <div className="flex bg-gray-100 rounded-lg p-0.5 flex-1 max-w-xs mx-auto">
              <button
                onClick={() => setToolTab('scoreboard')}
                className={`flex-1 py-1 text-xs font-medium rounded-md transition ${
                  toolTab === 'scoreboard' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-400'
                }`}
              >
                🏓 记分牌
              </button>
              <button
                onClick={() => setToolTab('timer')}
                className={`flex-1 py-1 text-xs font-medium rounded-md transition ${
                  toolTab === 'timer' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-400'
                }`}
              >
                ⏱ 计时器
              </button>
            </div>
          </>
        ) : (
          <>
            <h1 className="text-xl font-bold flex items-center gap-2">🧰 实用工具</h1>
            {isMobile && (
              <button
                onClick={enterFullscreen}
                className="ml-auto px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition active:scale-95"
              >
                📱 全屏横屏模式
              </button>
            )}
          </>
        )}
      </div>

      {/* Fallback hint */}
      {isMobile && !apiSupported && !isFullscreen && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-center gap-2">
          <span className="text-amber-500 text-lg">📱</span>
          <p className="text-sm text-amber-700">建议将手机横屏使用，获得更好的体验</p>
        </div>
      )}

      {/* Fullscreen mode: show selected tool */}
      {isFullscreen && isLandscape ? (
        <div className="flex-1 flex items-center justify-center overflow-auto px-2 pb-2">
          {toolTab === 'scoreboard' ? (
            <div className="w-full max-w-2xl">
              <Scoreboard expanded />
            </div>
          ) : (
            <div className="w-full max-w-md">
              <Timer expanded />
            </div>
          )}
        </div>
      ) : (
        <>
          {/* Scoreboard */}
          <div className="max-w-lg mx-auto">
            <Scoreboard />
          </div>

          {/* More tools */}
          <div className="bg-white rounded-xl shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b">
              <h2 className="font-bold flex items-center gap-2">🔧 更多工具</h2>
            </div>
            <div>
              <UtilityTool title="⏱️ 计时器" defaultOpen>
                <Timer />
              </UtilityTool>
              <UtilityTool title="📋 比赛记录" defaultOpen={false}>
                <p className="text-gray-400 text-sm py-4 text-center">即将推出...</p>
              </UtilityTool>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
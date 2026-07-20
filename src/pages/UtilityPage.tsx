import { useEffect, useState } from 'react'
import { useFullscreen } from '../hooks/useFullscreen'
import { Scoreboard } from '../components/utility/Scoreboard'
import { UtilityTool } from '../components/utility/UtilityTool'

export function UtilityPage() {
  const { isFullscreen, isLandscape, apiSupported, enterFullscreen, exitFullscreen } = useFullscreen()
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold flex items-center gap-2">
          🧰 实用工具
        </h1>
        {isMobile && (
          <button
            onClick={isFullscreen ? exitFullscreen : enterFullscreen}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition active:scale-95"
          >
            {isFullscreen ? '退出全屏' : '📱 全屏横屏模式'}
          </button>
        )}
      </div>

      {/* Fallback hint when API not supported */}
      {isMobile && !apiSupported && !isFullscreen && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-center gap-2">
          <span className="text-amber-500 text-lg">📱</span>
          <p className="text-sm text-amber-700">
            建议将手机横屏使用，获得更好的记分体验
          </p>
        </div>
      )}

      {/* Scoreboard — always visible */}
      <div className={
        isFullscreen && isLandscape
          ? 'flex items-center justify-center min-h-[80vh]'
          : ''
      }>
        <div className={
          isFullscreen && isLandscape
            ? 'w-full max-w-2xl'
            : 'max-w-lg mx-auto'
        }>
          <Scoreboard expanded={isFullscreen && isLandscape} />
        </div>
      </div>

      {/* More tools section — hidden in fullscreen */}
      {!(isFullscreen && isLandscape) && (
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b">
            <h2 className="font-bold flex items-center gap-2">
              🔧 更多工具
            </h2>
          </div>
          <div>
            <UtilityTool title="⏱️ 计时器" defaultOpen={false}>
              <p className="text-gray-400 text-sm py-4 text-center">即将推出...</p>
            </UtilityTool>
            <UtilityTool title="📋 比赛记录" defaultOpen={false}>
              <p className="text-gray-400 text-sm py-4 text-center">即将推出...</p>
            </UtilityTool>
          </div>
        </div>
      )}
    </div>
  )
}

import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import type { HealthCheckin, HealthWeeklyScore } from '../types'

function getWeekStart(d: Date): string {
  const dt = new Date(d)
  const day = dt.getDay()
  const diff = dt.getDate() - day + (day === 0 ? -6 : 1)
  dt.setDate(diff)
  return dt.toISOString().split('T')[0]
}

function getLastWeekStart(): string {
  const d = new Date()
  d.setDate(d.getDate() - 7)
  return getWeekStart(d)
}

/** 单次时长评分 (0~5) */
function calcDurationScore(minutes: number): number {
  if (minutes >= 30 && minutes <= 90) return 5
  if (minutes < 30) return +(minutes / 30 * 5).toFixed(1)
  return Math.round((5 + Math.max(0, 5 * (1 - (minutes - 90) / 90))) * 10) / 10
}

export function HealthCheckinPage() {
  const { user } = useAuth()
  const [todayCheckin, setTodayCheckin] = useState<HealthCheckin | null>(null)
  const [thisWeek, setThisWeek] = useState<HealthCheckin[]>([])
  const [weeklyScore, setWeeklyScore] = useState<HealthWeeklyScore | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  const [duration, setDuration] = useState(60)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const [todayResult, setTodayResult] = useState<{
    durScore: number; daysAdded: number; streakAdded: number; total: number
  } | null>(null)

  // 上周是否有数据可导出
  const [hasLastWeekData, setHasLastWeekData] = useState(false)
  const [exporting, setExporting] = useState(false)

  useEffect(() => {
    if (user) loadData()
  }, [user])

  async function loadData() {
    if (!user) return
    const today = new Date().toISOString().split('T')[0]
    const ws = getWeekStart(new Date())

    const { data: todayD } = await supabase.from('health_checkins').select('*')
      .eq('profile_id', user.id).eq('checkin_date', today).maybeSingle()
    if (todayD) setTodayCheckin(todayD as HealthCheckin)

    const { data: weekD } = await supabase.from('health_checkins').select('*')
      .eq('profile_id', user.id).gte('checkin_date', ws).lte('checkin_date', today)
      .order('checkin_date', { ascending: true })
    if (weekD) setThisWeek(weekD as HealthCheckin[])

    const { data: scoreD } = await supabase.from('health_weekly_scores').select('*')
      .eq('profile_id', user.id).eq('week_start', ws).maybeSingle()
    if (scoreD) setWeeklyScore(scoreD as HealthWeeklyScore)

    // 如果今天已打卡，计算今日得分展示
    if (todayD) {
      const d = todayD as HealthCheckin
      const durScore = calcDurationScore(d.duration_minutes)
      const daysAdded = +(40 / 7).toFixed(1)
      const checkins = (weekD || []) as HealthCheckin[]
      const streakInfo = calcStreakContribution(checkins, d.duration_minutes)
      const streakAdded = streakInfo.streak >= 2
        ? [0, 2, 5, 8, 10, 12, 15][Math.min(streakInfo.streak, 7)] -
          (streakInfo.streak > 2 ? [0, 2, 5, 8, 10, 12, 15][Math.min(streakInfo.streak - 1, 7)] : 0)
        : 0
      setTodayResult({ durScore, daysAdded, streakAdded, total: +(durScore + daysAdded + streakAdded).toFixed(1) })
    }

    // 检查上周是否有打卡记录
    const lws = getLastWeekStart()
    const lwe = new Date(lws)
    lwe.setDate(lwe.getDate() + 6)
    const { count } = await supabase.from('health_checkins').select('*', { count: 'exact', head: true })
      .eq('profile_id', user.id).gte('checkin_date', lws).lte('checkin_date', lwe.toISOString().split('T')[0])
    setHasLastWeekData((count || 0) > 0)

    setLoading(false)
  }

  /** 计算连续天数变化 */
  function calcStreakContribution(checkins: HealthCheckin[], _newMinutes: number): { streak: number; added: number } {
    const all = [...checkins, { checkin_date: new Date().toISOString().split('T')[0] } as HealthCheckin]
    const dates = all.map(c => c.checkin_date).sort()
    let maxStreak = 0, cur = 0, prev = ''
    for (const d of dates) {
      const dateObj = new Date(d)
      if (prev) {
        const diffDays = (dateObj.getTime() - new Date(prev).getTime()) / 86400000
        if (diffDays === 1) cur++
        else cur = 1
      } else { cur = 1 }
      if (cur > maxStreak) maxStreak = cur
      prev = d
    }
    const streakScore = (s: number) => s < 2 ? 0 : [0, 0, 2, 5, 8, 10, 12, 15][Math.min(s, 7)]
    return { streak: maxStreak, added: streakScore(maxStreak) }
  }

  async function handleCheckin() {
    if (!user) return
    setError(''); setSuccess(''); setTodayResult(null); setSubmitting(true)

    const { error: err } = await supabase.from('health_checkins').upsert({
      profile_id: user.id,
      checkin_date: new Date().toISOString().split('T')[0],
      sport_type: '乒乓球',
      duration_minutes: duration,
    }, { onConflict: 'profile_id, checkin_date' })

    if (err) { setError(err.message); setSubmitting(false); return }

    const ws = getWeekStart(new Date())
    await supabase.rpc('calculate_weekly_health', { p_profile_id: user.id, p_week_start: ws })

    const durScore = calcDurationScore(duration)
    const daysAdded = +(40 / 7).toFixed(1)
    const streakInfo = calcStreakContribution(thisWeek, duration)
    const streakAdded = streakInfo.streak >= 2
      ? [0, 2, 5, 8, 10, 12, 15][Math.min(streakInfo.streak, 7)] -
        (streakInfo.streak > 2 ? [0, 2, 5, 8, 10, 12, 15][Math.min(streakInfo.streak - 1, 7)] : 0)
      : 0

    setTodayResult({ durScore, daysAdded, streakAdded, total: +(durScore + daysAdded + streakAdded).toFixed(1) })
    setSuccess('✅ 今日打卡成功！')
    setSubmitting(false)
    loadData()
  }

  const scoreLevel = (s: number) => {
    if (s >= 90) return { label: '优秀 🏆', color: 'text-green-600 bg-green-50 border-green-200' }
    if (s >= 75) return { label: '良好 👍', color: 'text-blue-600 bg-blue-50 border-blue-200' }
    if (s >= 60) return { label: '一般 📊', color: 'text-yellow-600 bg-yellow-50 border-yellow-200' }
    return { label: '需加强 💪', color: 'text-red-600 bg-red-50 border-red-200' }
  }

  /** 导出上周周报 */
  async function exportLastWeek() {
    if (!user) return
    setExporting(true)
    const ws = getLastWeekStart()
    const dateObj = new Date(ws)
    const weekEnd = new Date(dateObj)
    weekEnd.setDate(dateObj.getDate() + 6)
    const weekEndStr = weekEnd.toISOString().split('T')[0]

    const { data: checkins } = await supabase.from('health_checkins').select('*')
      .eq('profile_id', user.id).gte('checkin_date', ws).lte('checkin_date', weekEndStr)
      .order('checkin_date', { ascending: true })

    await supabase.rpc('calculate_weekly_health', { p_profile_id: user.id, p_week_start: ws })
    const { data: score } = await supabase.from('health_weekly_scores').select('*')
      .eq('profile_id', user.id).eq('week_start', ws).maybeSingle()

    const days = (checkins || []) as HealthCheckin[]
    const sc = score as HealthWeeklyScore | null
    const level = sc ? scoreLevel(sc.score).label : '暂无'

    const fmt = (d: string) => {
      const dt = new Date(d)
      return `${dt.getMonth() + 1}月${dt.getDate()}日`
    }

    let text = '═══════════════════════════════════════\n'
    text += `        🏓 健康周报 (${fmt(ws)} ~ ${fmt(weekEndStr)})\n`
    text += '═══════════════════════════════════════\n\n'
    text += `👤 用户: ${user.nickname || user.username}\n`
    text += `📅 周期: ${ws} ~ ${weekEndStr}\n`
    text += `📊 健康指数: ${sc ? sc.score + ' 分' : '未评估'}\n`
    text += `🏆 评价等级: ${level}\n\n`

    text += '── 每日运动明细 ──\n\n'
    if (days.length === 0) {
      text += '   上周暂无打卡记录\n'
    } else {
      for (const d of days) {
        const durScore = calcDurationScore(d.duration_minutes)
        const dayOfWeek = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][new Date(d.checkin_date).getDay()]
        text += `  ${fmt(d.checkin_date)} (${dayOfWeek})\n`
        text += `    运动: 🏓 乒乓球 | 时长: ${d.duration_minutes} 分钟\n`
        text += `    时长评分: +${durScore}\n\n`
      }
    }

    if (sc) {
      text += '── 上周评分明细 ──\n\n'
      text += `  ① 运动天数: ${sc.detail.days_count}/7 天  (${sc.detail.freq_score}/40 分)\n`
      text += `  ② 运动时长: 共 ${sc.detail.total_minutes} 分钟  (${sc.detail.dur_score}/45 分)\n`
      text += `  ③ 连续运动: 最长 ${sc.detail.max_streak} 天  (${sc.detail.streak_score}/15 分)\n`
      text += `  ────────────────────────────\n`
      text += `  总分: ${sc.score} / 100  等级: ${level}\n`
    }

    text += '\n═══════════════════════════════════════\n'
    text += `  生成时间: ${new Date().toLocaleString('zh-CN')}\n`
    text += '═══════════════════════════════════════\n'

    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `健康周报_上周_${ws}.txt`
    a.click()
    URL.revokeObjectURL(url)
    setExporting(false)
  }

  const weekDays = ['一', '二', '三', '四', '五', '六', '日']

  if (loading) return <div className="text-center py-10 text-gray-400">加载中...</div>

  return (
    <div className="max-w-lg mx-auto space-y-6">
      {/* 今日打卡 */}
      <div className="bg-white rounded-xl p-6 shadow-sm">
        <h1 className="text-lg font-bold mb-1">🏃 健康打卡</h1>
        <p className="text-xs text-gray-400 mb-4">每天记录运动情况，每周生成健康指数</p>

        <details className="mb-4 group">
          <summary className="text-xs text-blue-600 cursor-pointer hover:text-blue-700 select-none">
            📖 查看评估规则
          </summary>
          <div className="mt-3 bg-blue-50 rounded-xl p-4 text-xs space-y-3 border border-blue-100">
            <p className="font-medium text-blue-800">📊 健康指数满分 100 分，每周一评估上周</p>
            <div>
              <p className="font-medium text-blue-700 mb-1">① 运动天数分 (0~40)</p>
              <p className="text-blue-600">天数 ÷ 7 × 40，每周 3~5 天最佳</p>
            </div>
            <div>
              <p className="font-medium text-blue-700 mb-1">② 运动时长分 (0~45)</p>
              <p className="text-blue-600">每次 30~90 分钟得满分 5 分/次</p>
              <p className="text-blue-500">&lt;30 分钟按比例，&gt;90 分钟递减</p>
            </div>
            <div>
              <p className="font-medium text-blue-700 mb-1">③ 连续运动加分 (0~15)</p>
              <div className="text-blue-600 space-y-0.5">
                <p>连续 2 天 +2 &nbsp;|&nbsp; 3 天 +5 &nbsp;|&nbsp; 4 天 +8</p>
                <p>连续 5 天 +10 | 6 天 +12 | 7 天全勤 +15</p>
              </div>
            </div>
            <div className="border-t border-blue-200 pt-2">
              <p className="font-medium text-blue-800 mb-1">🏆 评级标准</p>
              <div className="grid grid-cols-4 gap-2 text-center">
                <div className="bg-green-100 rounded-lg py-1.5"><span className="font-bold text-green-700">90~100</span><p className="text-green-600">优秀 🏆</p></div>
                <div className="bg-blue-100 rounded-lg py-1.5"><span className="font-bold text-blue-700">75~89</span><p className="text-blue-600">良好 👍</p></div>
                <div className="bg-yellow-100 rounded-lg py-1.5"><span className="font-bold text-yellow-700">60~74</span><p className="text-yellow-600">一般 📊</p></div>
                <div className="bg-red-100 rounded-lg py-1.5"><span className="font-bold text-red-700">&lt;60</span><p className="text-red-600">需加强 💪</p></div>
              </div>
            </div>
          </div>
        </details>

        {todayCheckin ? (
          <div className="bg-green-50 border border-green-200 rounded-xl p-4">
            <p className="text-green-700 font-medium text-sm">✅ 今日已打卡</p>
            <p className="text-xs text-green-600 mt-1">🏓 乒乓球 · {todayCheckin.duration_minutes} 分钟</p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-700">🏓 乒乓球</span>
              <span className="text-xs text-gray-400">（固定项目）</span>
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">运动时长（分钟）</label>
              <div className="flex items-center gap-3">
                <input type="range" min={10} max={180} step={5} value={duration}
                  onChange={e => setDuration(parseInt(e.target.value))}
                  className="flex-1 accent-blue-600" />
                <span className="text-sm font-bold text-blue-600 w-12 text-right">{duration}分</span>
              </div>
            </div>
            {error && <p className="text-red-500 text-xs">{error}</p>}
            {success && <p className="text-green-600 text-xs">{success}</p>}
            <button onClick={handleCheckin} disabled={submitting}
              className="w-full py-2.5 bg-gradient-to-r from-green-400 to-green-600 text-white rounded-xl text-sm font-bold hover:from-green-500 hover:to-green-700 transition disabled:opacity-50 shadow-sm">
              {submitting ? '提交中...' : '📝 今日打卡'}
            </button>
          </div>
        )}
      </div>

      {/* 今日得分展示 */}
      {todayResult && (
        <div className="bg-white rounded-xl p-6 shadow-sm border-l-4 border-l-green-500">
          <h2 className="font-bold text-sm mb-3">🎯 今日得分</h2>
          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600">⏱ 时长评分（{duration}分钟）</span>
              <span className="font-bold text-blue-600">+{todayResult.durScore}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600">📅 天数贡献（1/7 周）</span>
              <span className="font-bold text-blue-600">+{todayResult.daysAdded}</span>
            </div>
            {todayResult.streakAdded > 0 && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-orange-600">🔥 连续运动加分</span>
                <span className="font-bold text-orange-600">+{todayResult.streakAdded}</span>
              </div>
            )}
            <div className="border-t pt-2 flex items-center justify-between">
              <span className="text-sm font-medium text-gray-700">今日合计贡献</span>
              <span className="text-lg font-bold text-green-600">{todayResult.total} 分</span>
            </div>
          </div>

          {weeklyScore && (
            <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between">
              <span className="text-sm text-gray-600">📊 本周当前分数</span>
              <span className={`text-lg font-bold ${weeklyScore.score >= 75 ? 'text-green-600' : weeklyScore.score >= 60 ? 'text-yellow-600' : 'text-red-500'}`}>
                {weeklyScore.score}
              </span>
            </div>
          )}
        </div>
      )}

      {/* 本周概览 */}
      <div className="bg-white rounded-xl p-6 shadow-sm">
        <h2 className="font-bold text-sm mb-3">📅 本周打卡</h2>

        <div className="grid grid-cols-7 gap-2 mb-4">
          {weekDays.map((d, i) => {
            const dateObj = new Date(getWeekStart(new Date()))
            dateObj.setDate(dateObj.getDate() + i)
            const dateStr = dateObj.toISOString().split('T')[0]
            const isToday = dateStr === new Date().toISOString().split('T')[0]
            const checked = thisWeek.find(c => c.checkin_date === dateStr)
            return (
              <div key={i} className="text-center">
                <p className="text-xs text-gray-400 mb-1">{d}</p>
                <div className={'w-8 h-8 mx-auto rounded-full flex items-center justify-center text-xs font-medium ' +
                  (checked ? 'bg-green-500 text-white' : isToday ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-400')}>
                  {checked ? '✓' : dateObj.getDate()}
                </div>
              </div>
            )
          })}
        </div>

        {thisWeek.length > 0 && (
          <div className="space-y-1.5">
            {thisWeek.map(c => (
              <div key={c.id} className="flex items-center justify-between text-xs py-1.5 border-b border-gray-50 last:border-0">
                <span className="text-gray-500">{c.checkin_date.slice(5)}</span>
                <span className="font-medium text-blue-600">{c.duration_minutes} 分钟</span>
              </div>
            ))}
            <p className="text-xs text-gray-400 pt-2">
              本周运动 {thisWeek.length} 天，共 {thisWeek.reduce((s, c) => s + c.duration_minutes, 0)} 分钟
            </p>
          </div>
        )}
        {thisWeek.length === 0 && !todayResult && (
          <p className="text-xs text-gray-400 text-center py-4">本周还没有打卡记录</p>
        )}
      </div>

      {/* 本周详细评分 */}
      {weeklyScore && (
        <div className="bg-white rounded-xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-bold text-sm">📊 本周健康评估</h2>
            <button onClick={async () => {
              if (!user) return
              const ws = weeklyScore.week_start
              const dateObj = new Date(ws)
              const weekEnd = new Date(dateObj)
              weekEnd.setDate(dateObj.getDate() + 6)
              const weekEndStr = weekEnd.toISOString().split('T')[0]

              const { data: checkins } = await supabase.from('health_checkins').select('*')
                .eq('profile_id', user.id).gte('checkin_date', ws).lte('checkin_date', weekEndStr)
                .order('checkin_date', { ascending: true })

              const days = (checkins || []) as HealthCheckin[]
              const level = scoreLevel(weeklyScore.score).label
              const fmt = (d: string) => {
                const dt = new Date(d)
                return `${dt.getMonth() + 1}月${dt.getDate()}日`
              }

              let text = '═══════════════════════════════════════\n'
              text += `        🏓 健康周报 (${fmt(ws)} ~ ${fmt(weekEndStr)})\n`
              text += '═══════════════════════════════════════\n\n'
              text += `👤 用户: ${user.nickname || user.username}\n`
              text += `📅 周期: ${ws} ~ ${weekEndStr}\n`
              text += `📊 健康指数: ${weeklyScore.score} 分\n`
              text += `🏆 评价等级: ${level}\n\n`
              text += '── 每日运动明细 ──\n\n'
              if (days.length === 0) {
                text += '   本周暂无打卡记录\n'
              } else {
                for (const d of days) {
                  const durScore = calcDurationScore(d.duration_minutes)
                  const dayOfWeek = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][new Date(d.checkin_date).getDay()]
                  text += `  ${fmt(d.checkin_date)} (${dayOfWeek})\n`
                  text += `    运动: 🏓 乒乓球 | 时长: ${d.duration_minutes} 分钟\n`
                  text += `    时长评分: +${durScore}\n\n`
                }
              }
              text += '── 本周评分明细 ──\n\n'
              text += `  ① 运动天数: ${weeklyScore.detail.days_count}/7 天  (${weeklyScore.detail.freq_score}/40 分)\n`
              text += `  ② 运动时长: 共 ${weeklyScore.detail.total_minutes} 分钟  (${weeklyScore.detail.dur_score}/45 分)\n`
              text += `  ③ 连续运动: 最长 ${weeklyScore.detail.max_streak} 天  (${weeklyScore.detail.streak_score}/15 分)\n`
              text += `  ────────────────────────────\n`
              text += `  总分: ${weeklyScore.score} / 100  等级: ${level}\n`
              text += '\n═══════════════════════════════════════\n'
              text += `  生成时间: ${new Date().toLocaleString('zh-CN')}\n`
              text += '═══════════════════════════════════════\n'

              const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
              const url = URL.createObjectURL(blob)
              const a = document.createElement('a')
              a.href = url
              a.download = `健康周报_本周_${ws}.txt`
              a.click()
              URL.revokeObjectURL(url)
            }}
              className="text-xs px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition">
              📥 导出本周周报
            </button>
          </div>
          <div className="mb-4 text-center">
            <div className="text-4xl font-bold" style={{ color: weeklyScore.score >= 75 ? '#16a34a' : weeklyScore.score >= 60 ? '#ca8a04' : '#dc2626' }}>
              {weeklyScore.score}
            </div>
            <p className="text-xs text-gray-400 mt-1">健康指数</p>
          </div>

          <div className="space-y-2">
            <div>
              <div className="flex justify-between text-xs text-gray-500 mb-1">
                <span>运动天数 ({weeklyScore.detail.days_count}/7)</span>
                <span>{weeklyScore.detail.freq_score}/40</span>
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full bg-blue-500 rounded-full" style={{ width: `${(weeklyScore.detail.freq_score / 40) * 100}%` }} />
              </div>
            </div>
            <div>
              <div className="flex justify-between text-xs text-gray-500 mb-1">
                <span>运动时长 ({weeklyScore.detail.total_minutes}分钟)</span>
                <span>{weeklyScore.detail.dur_score}/45</span>
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full bg-green-500 rounded-full" style={{ width: `${(weeklyScore.detail.dur_score / 45) * 100}%` }} />
              </div>
            </div>
            <div>
              <div className="flex justify-between text-xs text-gray-500 mb-1">
                <span>连续运动 (最长{weeklyScore.detail.max_streak}天)</span>
                <span>{weeklyScore.detail.streak_score}/15</span>
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full bg-yellow-500 rounded-full" style={{ width: `${(weeklyScore.detail.streak_score / 15) * 100}%` }} />
              </div>
            </div>
          </div>

          <p className="text-xs text-gray-400 mt-3 text-center">
            评估周期: {weeklyScore.week_start.slice(5)} ~ {weeklyScore.week_end.slice(5)}
          </p>
        </div>
      )}

      {/* 导出上周周报 */}
      <div className="bg-white rounded-xl p-6 shadow-sm border-l-4 border-l-blue-500">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-bold text-sm">📤 上周周报</h2>
            <p className="text-xs text-gray-400 mt-1">
              {hasLastWeekData ? '导出上周的完整运动记录和健康评估，该报告有效期为本周' : '上周暂无打卡记录'}
            </p>
          </div>
          <button onClick={exportLastWeek} disabled={exporting || !hasLastWeekData}
            className={'shrink-0 px-4 py-2 rounded-lg text-sm font-medium transition disabled:opacity-40 shadow-sm ' +
              (hasLastWeekData ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-gray-200 text-gray-500 cursor-not-allowed')}>
            {exporting ? '生成中...' : '📥 导出上周周报'}
          </button>
        </div>
      </div>
    </div>
  )
}

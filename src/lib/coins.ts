import { supabase } from './supabase'
import type { CoinTransaction } from '../types'

/**
 * 获取用户金币余额
 */
export async function getUserCoins(userId: string): Promise<number> {
  const { data } = await supabase
    .from('profiles')
    .select('coins')
    .eq('id', userId)
    .single()
  return data?.coins ?? 0
}

/**
 * 每日签到
 */
export async function dailyCheckin(userId: string) {
  const { data, error } = await supabase.rpc('daily_checkin', { p_user_id: userId })
  if (error) throw error
  return data as { coins_earned: number; streak_count: number; balance: number }
}

/**
 * 获取签到状态（今日是否已签 + 连续天数）
 */
export async function getCheckinStatus(userId: string) {
  const today = new Date().toISOString().slice(0, 10)
  const { data: todayCheckin } = await supabase
    .from('daily_checkins')
    .select('streak_count')
    .eq('user_id', userId)
    .eq('checkin_date', today)
    .maybeSingle()

  if (todayCheckin) {
    return { checkedIn: true, streak: todayCheckin.streak_count }
  }

  // 获取最近一次签到
  const { data: lastCheckin } = await supabase
    .from('daily_checkins')
    .select('checkin_date, streak_count')
    .eq('user_id', userId)
    .order('checkin_date', { ascending: false })
    .limit(1)
    .maybeSingle()

  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  const yesterdayStr = yesterday.toISOString().slice(0, 10)
  const streakContinues = lastCheckin?.checkin_date === yesterdayStr

  return {
    checkedIn: false,
    streak: streakContinues ? (lastCheckin?.streak_count ?? 0) : 0,
  }
}

/**
 * 投注
 */
export async function placeBet(userId: string, eventId: string, optionIndex: number, amount: number) {
  const { data, error } = await supabase.rpc('place_bet', {
    p_user_id: userId,
    p_event_id: eventId,
    p_option_index: optionIndex,
    p_amount: amount,
  })
  if (error) throw error
  return data
}

/**
 * 结算竞猜事件（管理员）
 */
export async function settlePredictionEvent(eventId: string, winningOption: number) {
  const { data, error } = await supabase.rpc('settle_prediction_event', {
    p_event_id: eventId,
    p_winning_option: winningOption,
  })
  if (error) throw error
  return data
}

/**
 * 取消竞猜事件（管理员）
 */
export async function cancelPredictionEvent(eventId: string) {
  const { data, error } = await supabase.rpc('cancel_prediction_event', {
    p_event_id: eventId,
  })
  if (error) throw error
  return data
}

/**
 * 兑换奖励
 */
export async function redeemReward(userId: string, itemId: string) {
  const { data, error } = await supabase.rpc('redeem_reward', {
    p_user_id: userId,
    p_item_id: itemId,
  })
  if (error) throw error
  return data
}

/**
 * 管理员发币
 */
export async function adminGrantCoins(adminId: string, targetId: string, amount: number, note: string) {
  const { data, error } = await supabase.rpc('admin_grant_coins', {
    p_admin_id: adminId,
    p_target_id: targetId,
    p_amount: amount,
    p_note: note,
  })
  if (error) throw error
  return data
}

/**
 * 获取金币流水
 */
export async function getCoinTransactions(userId: string, type?: string): Promise<CoinTransaction[]> {
  let query = supabase
    .from('coin_transactions')
    .select('*')
    .eq('profile_id', userId)
    .order('created_at', { ascending: false })
    .limit(50)

  if (type && type !== 'all') {
    query = query.eq('type', type)
  }

  const { data, error } = await query
  if (error) throw error
  return (data || []) as CoinTransaction[]
}

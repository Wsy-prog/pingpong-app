import { useEffect } from 'react'
import { supabase } from '../lib/supabase'

export function useChatCleanup() {
  useEffect(() => {
    triggerCleanupIfNeeded()
  }, [])

  async function triggerCleanupIfNeeded() {
    try {
      const { data: config } = await supabase
        .from('chat_cleanup_config')
        .select('*')
        .eq('id', 1)
        .single()

      if (!config) return

      const now = new Date()
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      const lastCleanup = config.last_cleanup ? new Date(config.last_cleanup) : null
      if (lastCleanup && lastCleanup >= todayStart) return

      if (config.global_days > 0) {
        await supabase.rpc('cleanup_messages', { p_type: 'global', p_days: config.global_days })
      }
      if (config.private_days > 0) {
        await supabase.rpc('cleanup_messages', { p_type: 'private', p_days: config.private_days })
      }
      await supabase.from('chat_cleanup_config').update({ last_cleanup: now.toISOString(), updated_at: now.toISOString() }).eq('id', 1)
    } catch (e) {}
  }
}

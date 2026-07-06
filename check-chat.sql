-- 看看 messages 表结构
SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'messages' ORDER BY ordinal_position;

-- 看看有没有数据
SELECT id, sender_id, receiver_id, content, created_at FROM messages ORDER BY created_at DESC LIMIT 10;

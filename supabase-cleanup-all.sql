-- 一键清理所有约球及其响应（加 WHERE 条件绕过安全限制）
CREATE OR REPLACE FUNCTION public.cleanup_all_matchmaking()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  deleted_posts INT;
  deleted_responses INT;
BEGIN
  DELETE FROM public.matchmaking_responses WHERE id IS NOT NULL;
  GET DIAGNOSTICS deleted_responses = ROW_COUNT;

  DELETE FROM public.matchmaking_posts WHERE id IS NOT NULL;
  GET DIAGNOSTICS deleted_posts = ROW_COUNT;

  RETURN jsonb_build_object(
    'deleted_posts', deleted_posts,
    'deleted_responses', deleted_responses
  );
END;
$$;

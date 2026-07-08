DROP FUNCTION IF EXISTS public.cleanup_old_matchmaking();

CREATE OR REPLACE FUNCTION public.cleanup_old_matchmaking()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  deleted_posts INT;
  deleted_responses INT;
BEGIN
  DELETE FROM public.matchmaking_responses
  WHERE post_id IN (
    SELECT id FROM public.matchmaking_posts
    WHERE status = 'open'
      AND (
        (match_end_time IS NOT NULL AND match_end_time < NOW())
        OR
        (match_end_time IS NULL AND match_time < NOW() - INTERVAL '1 day')
      )
  );
  GET DIAGNOSTICS deleted_responses = ROW_COUNT;

  UPDATE public.matchmaking_posts
  SET status = 'closed', updated_at = NOW()
  WHERE status = 'open'
    AND (
      (match_end_time IS NOT NULL AND match_end_time < NOW())
      OR
      (match_end_time IS NULL AND match_time < NOW() - INTERVAL '1 day')
    );
  GET DIAGNOSTICS deleted_posts = ROW_COUNT;

  RETURN jsonb_build_object(
    'deleted_posts', deleted_posts,
    'deleted_responses', deleted_responses
  );
END;
$$;

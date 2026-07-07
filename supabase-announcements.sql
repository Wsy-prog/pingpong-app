-- =============================================
-- 乒协资讯系统 — 表
-- =============================================
CREATE TABLE IF NOT EXISTS public.announcements (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title             TEXT NOT NULL,
  content           TEXT NOT NULL,
  created_by        UUID NOT NULL,
  created_by_name   TEXT NOT NULL,
  priority          TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high')),
  expires_at        TIMESTAMPTZ,
  is_active         BOOLEAN NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_announcements_active ON announcements(is_active);
CREATE INDEX IF NOT EXISTS idx_announcements_expires ON announcements(expires_at) WHERE expires_at IS NOT NULL;

ALTER TABLE public.announcements DISABLE ROW LEVEL SECURITY;

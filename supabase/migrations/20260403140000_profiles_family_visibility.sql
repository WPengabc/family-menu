-- 家庭成员展示邮箱/昵称：公开表 profiles（id = auth.users.id），同家庭可读。
-- 在 Supabase → SQL Editor 执行一次；已有同名对象会先 DROP / REPLACE。

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  email text,
  display_name text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 若项目里已有 Supabase 官方模板 profiles，只补列即可
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS display_name text;

COMMENT ON TABLE public.profiles IS '与 auth 同步的展示信息；家庭成员可互看邮箱/昵称';

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_select_same_family" ON public.profiles;
CREATE POLICY "profiles_select_same_family"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  id = (SELECT auth.uid())
  OR EXISTS (
    SELECT 1
    FROM public.family_members me
    INNER JOIN public.family_members them ON me.family_id = them.family_id
    WHERE me.user_id = (SELECT auth.uid())
      AND them.user_id = profiles.id
  )
);

DROP POLICY IF EXISTS "profiles_insert_own" ON public.profiles;
CREATE POLICY "profiles_insert_own"
ON public.profiles
FOR INSERT
TO authenticated
WITH CHECK (id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
CREATE POLICY "profiles_update_own"
ON public.profiles
FOR UPDATE
TO authenticated
USING (id = (SELECT auth.uid()))
WITH CHECK (id = (SELECT auth.uid()));

GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;

-- 新用户注册时写入/更新 profiles（邮箱来自 Auth）
CREATE OR REPLACE FUNCTION public.handle_auth_user_profiles()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, updated_at)
  VALUES (NEW.id, NEW.email, now())
  ON CONFLICT (id) DO UPDATE
  SET email = EXCLUDED.email, updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_profiles ON auth.users;
CREATE TRIGGER on_auth_user_created_profiles
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE PROCEDURE public.handle_auth_user_profiles();

DROP TRIGGER IF EXISTS on_auth_user_updated_email_profiles ON auth.users;
CREATE TRIGGER on_auth_user_updated_email_profiles
  AFTER UPDATE OF email ON auth.users
  FOR EACH ROW
  EXECUTE PROCEDURE public.handle_auth_user_profiles();

-- 已有账号补全一行
INSERT INTO public.profiles (id, email, updated_at)
SELECT id, email, now()
FROM auth.users
ON CONFLICT (id) DO UPDATE
SET email = EXCLUDED.email, updated_at = now();

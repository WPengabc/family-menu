-- 同家庭成员可互相查看 family_members 行（用于「家庭成员」列表）。
-- 若你库里的策略名不同，请在 SQL Editor 里先查：
--   select policyname from pg_policies where tablename = 'family_members';
-- 再手动 drop 仅允许 user_id = auth.uid() 的旧 SELECT 策略。

DROP POLICY IF EXISTS "family_members_select_self" ON public.family_members;
DROP POLICY IF EXISTS "family_members_select_own" ON public.family_members;
DROP POLICY IF EXISTS "Users can view own family_members" ON public.family_members;

CREATE POLICY "family_members_select_if_member"
ON public.family_members
FOR SELECT
TO authenticated
USING (public.is_member(family_id));

-- 多端即时：为 orders / dishes / categories 打开 Supabase Realtime（客户端已订阅 postgres_changes）
-- 若某表已在 publication 中，对应行会报错，可忽略或注释掉该行后重跑。

ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
ALTER PUBLICATION supabase_realtime ADD TABLE public.dishes;
ALTER PUBLICATION supabase_realtime ADD TABLE public.categories;

-- 订单展示「下单人」：与客户端 orders 行里的 placed_by_label / created_by_user_id 对齐
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS created_by_user_id uuid,
  ADD COLUMN IF NOT EXISTS placed_by_label text;

COMMENT ON COLUMN public.orders.placed_by_label IS '下单时的展示名（昵称优先，否则邮箱）；历史快照';

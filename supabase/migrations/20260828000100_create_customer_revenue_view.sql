-- 顧客ごとの月別取引額（R8年4月までは手入力の移行データ、R8年5月以降は請求データから自動集計）
create view public.customer_revenue_by_month
with (security_invoker = true)
as
select customer_id, year_month, amount, source
from public.customer_monthly_revenue
union all
select
  c.id as customer_id,
  d.billing_month as year_month,
  sum(d.amount) as amount,
  'auto_invoice' as source
from public.customers c
join public.invoices i on i.billing_destination = c.billing_destination_alias
join public.invoice_details d on d.invoice_id = i.id
where c.billing_destination_alias is not null
  and d.billing_month is not null
  and d.billing_month <> ''
  and d.billing_month >= '2026-05'
group by c.id, d.billing_month;

-- 顧客マスタ（顧客名簿.xlsx からの移行 + 案件アプリの請求データとの連携用）
create table public.customers (
  id uuid primary key default gen_random_uuid(),
  legacy_codes text[] not null default '{}',
  category text not null check (category in ('役所関係','会社関係','工場関係','建築関係','一般顧客')),
  company_name text not null,
  contact_name text,
  department text,
  postal_code text,
  address1 text,
  address2 text,
  phone text,
  fax text,
  email text,
  closing_day text,
  payment_due text,
  notes text,
  billing_destination_alias text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on column public.customers.legacy_codes is '顧客名簿.xlsx の顧客コード（統合された旧コードも含む）';
comment on column public.customers.billing_destination_alias is 'invoices.billing_destination と照合済みの表記。ここに一致した請求のみ月次取引額を自動集計する';

-- 月別取引額（R8年4月までは顧客名簿からの移行値、R8年5月以降は invoices/invoice_details からの自動集計値）
create table public.customer_monthly_revenue (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  year_month text not null,
  amount numeric not null default 0,
  source text not null check (source in ('manual_excel', 'auto_invoice')),
  created_at timestamptz not null default now(),
  unique (customer_id, year_month)
);

create index customer_monthly_revenue_customer_id_idx on public.customer_monthly_revenue (customer_id);
create index customer_monthly_revenue_year_month_idx on public.customer_monthly_revenue (year_month);

alter table public.customers enable row level security;
alter table public.customer_monthly_revenue enable row level security;

create policy "Only billing-access users can access customers"
  on public.customers for all
  using (has_billing_access())
  with check (has_billing_access());

create policy "Only billing-access users can access customer_monthly_revenue"
  on public.customer_monthly_revenue for all
  using (has_billing_access())
  with check (has_billing_access());

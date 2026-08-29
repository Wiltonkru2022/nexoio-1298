create table if not exists platform_support_tickets (
  id uuid primary key,
  business_id uuid references businesses(id) on delete set null,
  requester_name text,
  requester_email text,
  subject text not null,
  description text not null,
  status text not null default 'open',
  priority text not null default 'normal',
  category text,
  assigned_to uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index if not exists platform_support_tickets_status_idx on platform_support_tickets(status, priority, created_at desc);

create table if not exists platform_incidents (
  id uuid primary key,
  title text not null,
  description text,
  severity text not null default 'minor',
  status text not null default 'investigating',
  service text,
  public_message text,
  started_at timestamptz not null default now(),
  resolved_at timestamptz,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists platform_incidents_status_idx on platform_incidents(status, severity, started_at desc);

create table if not exists site_templates (
  id uuid primary key,
  code text not null unique,
  name text not null,
  category text not null,
  version integer not null default 1,
  status text not null default 'active',
  config_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into site_templates(id,code,name,category,version,status)
select gen_random_uuid(),v.code,v.name,v.category,1,'active'
from (values
('beauty-01','Elegância','Beleza'),('beauty-02','Editorial','Beleza'),('barber-01','Barbearia clássica','Beleza'),
('restaurant-01','Bistrô','Alimentação'),('restaurant-02','Urbano','Alimentação'),('restaurant-03','Delivery direto','Alimentação'),
('store-01','Vitrine','Varejo'),('store-02','Catálogo minimalista','Varejo'),('service-01','Profissional','Serviços'),
('service-02','Portfólio','Serviços'),('clinic-01','Clínica leve','Saúde'),('clinic-02','Especialidades','Saúde'),
('gym-01','Energia','Fitness'),('studio-01','Movimento','Fitness'),('generic-01','Essencial','Geral'),('premium-01','Premium','Geral')
) as v(code,name,category)
on conflict(code) do nothing;

create table if not exists platform_finance_entries (
  id uuid primary key,
  kind text not null check(kind in ('income','expense')),
  category text not null,
  description text not null,
  amount numeric(14,2) not null,
  competence_date date not null,
  paid_at timestamptz,
  status text not null default 'pending',
  external_reference text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists platform_finance_entries_date_idx on platform_finance_entries(competence_date desc,status);

create table if not exists public.ajustes_fracionados (
  id uuid primary key default gen_random_uuid(),
  data date not null default current_date,
  produto_fracionado_id uuid not null references public.produtos_fracionados(id) on delete restrict,
  saldo_anterior numeric(14,3) not null default 0,
  novo_saldo numeric(14,3) not null check (novo_saldo >= 0),
  diferenca numeric(14,3) not null,
  motivo text not null,
  responsavel text not null,
  criado_por uuid references auth.users(id) on delete set null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

alter table public.ajustes_fracionados enable row level security;
create policy "ajustes fracionados leitura" on public.ajustes_fracionados for select to authenticated using (true);
create policy "ajustes fracionados escrita" on public.ajustes_fracionados for all to authenticated using (true) with check (true);

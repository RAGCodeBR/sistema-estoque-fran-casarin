-- Pontos de recuperação antes de cada sincronização do legado.
-- Eles ficam fora das tabelas operacionais para possibilitar restauração caso
-- uma aba antiga ou uma falha de rede tente substituir o estoque.

create table if not exists public.estoque_checkpoints (
  id bigint generated always as identity primary key,
  dados jsonb not null,
  total_movimentos integer not null default 0,
  criado_por uuid references auth.users(id) on delete set null,
  criado_em timestamptz not null default now()
);

create index if not exists idx_estoque_checkpoints_criado_em
  on public.estoque_checkpoints (criado_em desc);

alter table public.estoque_checkpoints enable row level security;

drop policy if exists "checkpoints_admin_select" on public.estoque_checkpoints;
create policy "checkpoints_admin_select" on public.estoque_checkpoints
for select to authenticated
using (public.usuario_tem_papel(array['master','administrador']));

drop policy if exists "checkpoints_admin_insert" on public.estoque_checkpoints;
create policy "checkpoints_admin_insert" on public.estoque_checkpoints
for insert to authenticated
with check (
  -- O Controle de Fracionados tambem registra producoes e saidas. A
  -- sincronizacao dessas movimentacoes cria um checkpoint antes de gravar;
  -- sem esta permissao o lancamento ficava apenas no navegador e era
  -- substituido pela proxima atualizacao do banco.
  public.usuario_tem_papel(array['master','administrador','controle_fracionados'])
  and criado_por = auth.uid()
);

-- Mantém os 40 checkpoints mais recentes. Assim há recuperação suficiente
-- sem consumo indefinido do plano Free.
create or replace function public.limitar_estoque_checkpoints()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.estoque_checkpoints
  where id in (
    select id
    from public.estoque_checkpoints
    order by criado_em desc, id desc
    offset 40
  );
  return new;
end;
$$;

drop trigger if exists limitar_estoque_checkpoints on public.estoque_checkpoints;
create trigger limitar_estoque_checkpoints
after insert on public.estoque_checkpoints
for each statement execute function public.limitar_estoque_checkpoints();

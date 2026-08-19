-- A data do ajuste pode ser igual para vários registros e criado_em usa now(),
-- que é idêntico dentro de uma sincronização atômica. A sequência define de
-- forma estável qual é o último ajuste (a contagem física vigente).
create sequence if not exists public.ajustes_estoque_ordem_seq;
create sequence if not exists public.ajustes_fracionados_ordem_seq;

alter table public.ajustes_estoque add column if not exists ordem bigint;
alter table public.ajustes_fracionados add column if not exists ordem bigint;

-- A numeração dos registros já existentes é uma manutenção de esquema; não
-- representa uma alteração de saldo por usuário. Os gatilhos são religados
-- antes do término da transação da migração.
alter table public.ajustes_estoque disable trigger exigir_usuario_ajustes_estoque;
alter table public.ajustes_fracionados disable trigger exigir_usuario_ajustes_fracionados;

with ordenados as (
  select id, row_number() over (order by data, criado_em, id) as ordem
  from public.ajustes_estoque
)
update public.ajustes_estoque a set ordem = o.ordem from ordenados o where a.id = o.id and a.ordem is null;

with ordenados as (
  select id, row_number() over (order by data, criado_em, id) as ordem
  from public.ajustes_fracionados
)
update public.ajustes_fracionados a set ordem = o.ordem from ordenados o where a.id = o.id and a.ordem is null;

select setval('public.ajustes_estoque_ordem_seq', greatest(1, coalesce((select max(ordem) from public.ajustes_estoque), 0)), true);
select setval('public.ajustes_fracionados_ordem_seq', greatest(1, coalesce((select max(ordem) from public.ajustes_fracionados), 0)), true);

alter table public.ajustes_estoque alter column ordem set default nextval('public.ajustes_estoque_ordem_seq');
alter table public.ajustes_fracionados alter column ordem set default nextval('public.ajustes_fracionados_ordem_seq');
alter table public.ajustes_estoque alter column ordem set not null;
alter table public.ajustes_fracionados alter column ordem set not null;

create index if not exists idx_ajustes_estoque_ordem on public.ajustes_estoque(ordem);
create index if not exists idx_ajustes_fracionados_ordem on public.ajustes_fracionados(ordem);

alter table public.ajustes_fracionados enable trigger exigir_usuario_ajustes_fracionados;
alter table public.ajustes_estoque enable trigger exigir_usuario_ajustes_estoque;

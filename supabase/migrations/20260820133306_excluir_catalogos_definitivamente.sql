-- Exclusao fisica segura dos cadastros-mestre.
-- Os identificadores e nomes abaixo sao copias historicas sem FK: permitem
-- remover o cadastro e reutilizar o nome sem atribuir movimentos antigos ao
-- novo registro.
set lock_timeout = '5s';

-- A copia tecnica roda sem sessao de usuario. Suspendemos somente o gatilho
-- que exige auth.uid(); os locks da propria migracao impedem gravacoes
-- concorrentes e qualquer falha reverte esta mudanca junto com a transacao.
do $$
declare
  v_tabela text;
begin
  foreach v_tabela in array array[
    'categorias', 'locais', 'produtos_brutos', 'produtos_fracionados',
    'entradas_central', 'saidas_central', 'producoes', 'saidas_fracionado',
    'ajustes_estoque', 'ajustes_fracionados', 'pedidos_compra',
    'itens_manuais_compra'
  ] loop
    execute pg_catalog.format(
      'alter table public.%I disable trigger %I',
      v_tabela,
      'exigir_usuario_' || v_tabela
    );
  end loop;
end;
$$;

alter table public.entradas_central
  add column if not exists produto_bruto_historico_id uuid,
  add column if not exists produto_nome_historico text;

alter table public.saidas_central
  add column if not exists produto_bruto_historico_id uuid,
  add column if not exists produto_nome_historico text,
  add column if not exists destino_local_historico_id uuid,
  add column if not exists destino_nome_historico text;

alter table public.producoes
  add column if not exists produto_bruto_historico_id uuid,
  add column if not exists produto_bruto_nome_historico text,
  add column if not exists produto_fracionado_historico_id uuid,
  add column if not exists produto_fracionado_nome_historico text;

alter table public.saidas_fracionado
  add column if not exists produto_fracionado_historico_id uuid,
  add column if not exists produto_nome_historico text,
  add column if not exists destino_local_historico_id uuid,
  add column if not exists destino_nome_historico text;

alter table public.ajustes_estoque
  add column if not exists produto_bruto_historico_id uuid,
  add column if not exists produto_nome_historico text;

alter table public.ajustes_fracionados
  add column if not exists produto_fracionado_historico_id uuid,
  add column if not exists produto_nome_historico text;

alter table public.pedidos_compra
  add column if not exists produto_bruto_historico_id uuid,
  add column if not exists produto_nome_historico text;

alter table public.produtos_fracionados
  add column if not exists origem_bruto_historico_id uuid,
  add column if not exists origem_bruto_nome_historico text;

-- Copia o estado atual antes de permitir que as FKs sejam desligadas.
update public.entradas_central e
set produto_bruto_historico_id = p.id,
    produto_nome_historico = p.nome
from public.produtos_brutos p
where e.produto_bruto_id = p.id;

update public.saidas_central s
set produto_bruto_historico_id = p.id,
    produto_nome_historico = p.nome
from public.produtos_brutos p
where s.produto_bruto_id = p.id;

update public.saidas_central s
set destino_local_historico_id = l.id,
    destino_nome_historico = l.nome
from public.locais l
where s.destino_local_id = l.id;

update public.producoes x
set produto_bruto_historico_id = p.id,
    produto_bruto_nome_historico = p.nome
from public.produtos_brutos p
where x.produto_bruto_id = p.id;

update public.producoes x
set produto_fracionado_historico_id = p.id,
    produto_fracionado_nome_historico = p.nome
from public.produtos_fracionados p
where x.produto_fracionado_id = p.id;

update public.saidas_fracionado s
set produto_fracionado_historico_id = p.id,
    produto_nome_historico = p.nome
from public.produtos_fracionados p
where s.produto_fracionado_id = p.id;

update public.saidas_fracionado s
set destino_local_historico_id = l.id,
    destino_nome_historico = l.nome
from public.locais l
where s.destino_local_id = l.id;

update public.ajustes_estoque a
set produto_bruto_historico_id = p.id,
    produto_nome_historico = p.nome
from public.produtos_brutos p
where a.produto_bruto_id = p.id;

update public.ajustes_fracionados a
set produto_fracionado_historico_id = p.id,
    produto_nome_historico = p.nome
from public.produtos_fracionados p
where a.produto_fracionado_id = p.id;

update public.pedidos_compra x
set produto_bruto_historico_id = p.id,
    produto_nome_historico = p.nome
from public.produtos_brutos p
where x.produto_bruto_id = p.id;

update public.produtos_fracionados f
set origem_bruto_historico_id = p.id,
    origem_bruto_nome_historico = p.nome
from public.produtos_brutos p
where f.origem_bruto_id = p.id;

-- O historico permanece; somente a referencia viva passa a NULL quando o
-- cadastro pai e removido. Nenhuma linha de movimento usa CASCADE.
alter table public.entradas_central alter column produto_bruto_id drop not null;
alter table public.saidas_central alter column produto_bruto_id drop not null;
alter table public.saidas_central alter column destino_local_id drop not null;
alter table public.producoes alter column produto_bruto_id drop not null;
alter table public.producoes alter column produto_fracionado_id drop not null;
alter table public.saidas_fracionado alter column produto_fracionado_id drop not null;
alter table public.saidas_fracionado alter column destino_local_id drop not null;
alter table public.ajustes_estoque alter column produto_bruto_id drop not null;
alter table public.ajustes_fracionados alter column produto_fracionado_id drop not null;
alter table public.pedidos_compra alter column produto_bruto_id drop not null;

alter table public.entradas_central drop constraint entradas_central_produto_bruto_id_fkey;
alter table public.entradas_central add constraint entradas_central_produto_bruto_id_fkey
  foreign key (produto_bruto_id) references public.produtos_brutos(id) on delete set null;

alter table public.saidas_central drop constraint saidas_central_produto_bruto_id_fkey;
alter table public.saidas_central add constraint saidas_central_produto_bruto_id_fkey
  foreign key (produto_bruto_id) references public.produtos_brutos(id) on delete set null;
alter table public.saidas_central drop constraint saidas_central_destino_local_id_fkey;
alter table public.saidas_central add constraint saidas_central_destino_local_id_fkey
  foreign key (destino_local_id) references public.locais(id) on delete set null;

alter table public.producoes drop constraint producoes_produto_bruto_id_fkey;
alter table public.producoes add constraint producoes_produto_bruto_id_fkey
  foreign key (produto_bruto_id) references public.produtos_brutos(id) on delete set null;
alter table public.producoes drop constraint producoes_produto_fracionado_id_fkey;
alter table public.producoes add constraint producoes_produto_fracionado_id_fkey
  foreign key (produto_fracionado_id) references public.produtos_fracionados(id) on delete set null;

alter table public.saidas_fracionado drop constraint saidas_fracionado_produto_fracionado_id_fkey;
alter table public.saidas_fracionado add constraint saidas_fracionado_produto_fracionado_id_fkey
  foreign key (produto_fracionado_id) references public.produtos_fracionados(id) on delete set null;
alter table public.saidas_fracionado drop constraint saidas_fracionado_destino_local_id_fkey;
alter table public.saidas_fracionado add constraint saidas_fracionado_destino_local_id_fkey
  foreign key (destino_local_id) references public.locais(id) on delete set null;

alter table public.ajustes_estoque drop constraint ajustes_estoque_produto_bruto_id_fkey;
alter table public.ajustes_estoque add constraint ajustes_estoque_produto_bruto_id_fkey
  foreign key (produto_bruto_id) references public.produtos_brutos(id) on delete set null;

alter table public.ajustes_fracionados drop constraint ajustes_fracionados_produto_fracionado_id_fkey;
alter table public.ajustes_fracionados add constraint ajustes_fracionados_produto_fracionado_id_fkey
  foreign key (produto_fracionado_id) references public.produtos_fracionados(id) on delete set null;

alter table public.pedidos_compra drop constraint pedidos_compra_produto_bruto_id_fkey;
alter table public.pedidos_compra add constraint pedidos_compra_produto_bruto_id_fkey
  foreign key (produto_bruto_id) references public.produtos_brutos(id) on delete set null;

alter table public.produtos_fracionados drop constraint produtos_fracionados_origem_bruto_id_fkey;
alter table public.produtos_fracionados add constraint produtos_fracionados_origem_bruto_id_fkey
  foreign key (origem_bruto_id) references public.produtos_brutos(id) on delete set null;

create index if not exists entradas_central_produto_bruto_id_idx on public.entradas_central(produto_bruto_id);
create index if not exists saidas_central_produto_bruto_id_idx on public.saidas_central(produto_bruto_id);
create index if not exists saidas_central_destino_local_id_idx on public.saidas_central(destino_local_id);
create index if not exists producoes_produto_bruto_id_idx on public.producoes(produto_bruto_id);
create index if not exists producoes_produto_fracionado_id_idx on public.producoes(produto_fracionado_id);
create index if not exists saidas_fracionado_produto_fracionado_id_idx on public.saidas_fracionado(produto_fracionado_id);
create index if not exists saidas_fracionado_destino_local_id_idx on public.saidas_fracionado(destino_local_id);
create index if not exists ajustes_estoque_produto_bruto_id_idx on public.ajustes_estoque(produto_bruto_id);
create index if not exists ajustes_fracionados_produto_fracionado_id_idx on public.ajustes_fracionados(produto_fracionado_id);
create index if not exists pedidos_compra_produto_bruto_id_idx on public.pedidos_compra(produto_bruto_id);
create index if not exists produtos_fracionados_origem_bruto_id_idx on public.produtos_fracionados(origem_bruto_id);

create or replace function public.excluir_registro_definitivo(p_tipo text, p_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_nome text;
  v_afetados integer;
begin
  if auth.uid() is null
     or not public.usuario_tem_papel(array['master','administrador']) then
    raise exception 'Sem permissao para excluir cadastros.' using errcode = '42501';
  end if;

  if p_tipo = 'categoria' then
    delete from public.categorias where id = p_id;

  elsif p_tipo = 'local' then
    select nome into v_nome from public.locais where id = p_id for update;
    if v_nome is not null then
      update public.saidas_central
      set destino_local_historico_id = p_id,
          destino_nome_historico = v_nome
      where destino_local_id = p_id;
      update public.saidas_fracionado
      set destino_local_historico_id = p_id,
          destino_nome_historico = v_nome
      where destino_local_id = p_id;
    end if;
    delete from public.locais where id = p_id;

  elsif p_tipo = 'bruto' then
    perform pg_advisory_xact_lock(pg_catalog.hashtextextended('saldo-bruto:' || p_id::text, 0));
    select nome into v_nome from public.produtos_brutos where id = p_id for update;
    if v_nome is not null then
      update public.entradas_central set produto_bruto_historico_id=p_id, produto_nome_historico=v_nome where produto_bruto_id=p_id;
      update public.saidas_central set produto_bruto_historico_id=p_id, produto_nome_historico=v_nome where produto_bruto_id=p_id;
      update public.producoes set produto_bruto_historico_id=p_id, produto_bruto_nome_historico=v_nome where produto_bruto_id=p_id;
      update public.ajustes_estoque set produto_bruto_historico_id=p_id, produto_nome_historico=v_nome where produto_bruto_id=p_id;
      update public.pedidos_compra set produto_bruto_historico_id=p_id, produto_nome_historico=v_nome where produto_bruto_id=p_id;
      update public.produtos_fracionados set origem_bruto_historico_id=p_id, origem_bruto_nome_historico=v_nome where origem_bruto_id=p_id;
    end if;
    delete from public.produtos_brutos where id = p_id;

  elsif p_tipo = 'fracionado' then
    perform pg_advisory_xact_lock(pg_catalog.hashtextextended('saldo-fracionado:' || p_id::text, 0));
    select nome into v_nome from public.produtos_fracionados where id = p_id for update;
    if v_nome is not null then
      update public.producoes set produto_fracionado_historico_id=p_id, produto_fracionado_nome_historico=v_nome where produto_fracionado_id=p_id;
      update public.saidas_fracionado set produto_fracionado_historico_id=p_id, produto_nome_historico=v_nome where produto_fracionado_id=p_id;
      update public.ajustes_fracionados set produto_fracionado_historico_id=p_id, produto_nome_historico=v_nome where produto_fracionado_id=p_id;
    end if;
    delete from public.produtos_fracionados where id = p_id;

  else
    raise exception 'Tipo de cadastro invalido.' using errcode = '22023';
  end if;

  get diagnostics v_afetados = row_count;
  if v_afetados = 0 then
    raise exception 'Registro nao encontrado ou ja excluido.' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.excluir_registro_definitivo(text, uuid) from public, anon;
grant execute on function public.excluir_registro_definitivo(text, uuid) to authenticated;

-- Compatibilidade com navegadores que ainda estejam com a versao anterior.
create or replace function public.arquivar_local(p_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform public.excluir_registro_definitivo('local', p_id);
end;
$$;

create or replace function public.arquivar_categoria(p_nome text)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
begin
  select id into v_id from public.categorias where nome = p_nome;
  if v_id is null then
    raise exception 'Categoria nao encontrada.' using errcode = 'P0002';
  end if;
  perform public.excluir_registro_definitivo('categoria', v_id);
end;
$$;

revoke all on function public.arquivar_local(uuid) from public, anon;
grant execute on function public.arquivar_local(uuid) to authenticated;
revoke all on function public.arquivar_categoria(text) from public, anon;
grant execute on function public.arquivar_categoria(text) to authenticated;

-- Remove fisicamente os registros que ja estavam arquivados. As copias
-- historicas foram preenchidas acima e as FKs agora apenas ficam nulas.
delete from public.produtos_fracionados where ativo = false;
delete from public.produtos_brutos where ativo = false;
delete from public.categorias where ativo = false;
delete from public.locais where ativo = false;

do $$
declare
  v_tabela text;
begin
  foreach v_tabela in array array[
    'categorias', 'locais', 'produtos_brutos', 'produtos_fracionados',
    'entradas_central', 'saidas_central', 'producoes', 'saidas_fracionado',
    'ajustes_estoque', 'ajustes_fracionados', 'pedidos_compra',
    'itens_manuais_compra'
  ] loop
    execute pg_catalog.format(
      'alter table public.%I enable trigger %I',
      v_tabela,
      'exigir_usuario_' || v_tabela
    );
  end loop;
end;
$$;

notify pgrst, 'reload schema';

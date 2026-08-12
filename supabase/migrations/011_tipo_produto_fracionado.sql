-- Armazena o tipo exibido no cadastro de Produtos Fracionados.
alter table public.produtos_fracionados
  add column if not exists tipo_produto text not null default 'Fracionado'
  check (tipo_produto in ('Bruto', 'Fracionado'));

update public.produtos_fracionados
set tipo_produto = 'Fracionado'
where tipo_produto is null or tipo_produto = 'Bruto';

create or replace function public.atualizar_tipo_produto_fracionado(
  p_nome text,
  p_tipo text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.usuario_tem_papel(array['master','administrador']) then
    raise exception 'Sem permissao para alterar o tipo do produto.' using errcode = '42501';
  end if;
  if p_tipo not in ('Bruto', 'Fracionado') then
    raise exception 'Tipo de produto invalido.' using errcode = '22023';
  end if;
  update public.produtos_fracionados
  set tipo_produto = p_tipo, atualizado_em = now()
  where nome = p_nome;
  if not found then raise exception 'Produto nao encontrado.' using errcode = 'P0002'; end if;
end;
$$;
revoke all on function public.atualizar_tipo_produto_fracionado(text, text) from public;
grant execute on function public.atualizar_tipo_produto_fracionado(text, text) to authenticated;

-- Completa a sincronização atômica para preservar o campo em novos cadastros
-- e em alterações de outros dados da ficha do produto fracionado.
do $migration$
declare
  definition text;
  old_insert text := 'insert into public.produtos_fracionados(nome, categoria_id, unidade, origem_bruto_id, rendimento_percent, estoque_minimo, validade_dias, ativo)';
  new_insert text := 'insert into public.produtos_fracionados(nome, categoria_id, tipo_produto, unidade, origem_bruto_id, rendimento_percent, estoque_minimo, validade_dias, ativo)';
  old_select text := 'select x.nome, c.id, coalesce(nullif(x.unidade, ''''), ''UN''), b.id, coalesce(nullif(x.rendimento, 0), 100), coalesce(x.estoque_minimo, 0), coalesce(x.validade_dias, 0), true';
  new_select text := 'select x.nome, c.id, coalesce(nullif(x.tipo_produto, ''''), ''Fracionado''), coalesce(nullif(x.unidade, ''''), ''UN''), b.id, coalesce(nullif(x.rendimento, 0), 100), coalesce(x.estoque_minimo, 0), coalesce(x.validade_dias, 0), true';
  old_recordset text := 'as x(nome text, categoria text, unidade text, origem text, rendimento numeric, estoque_minimo numeric, validade_dias integer)';
  new_recordset text := 'as x(nome text, categoria text, tipo_produto text, unidade text, origem text, rendimento numeric, estoque_minimo numeric, validade_dias integer)';
begin
  select pg_get_functiondef('public.sincronizar_estoque_atomico(jsonb,bigint,text)'::regprocedure) into definition;
  if position(old_insert in definition) = 0 then raise exception 'A função de sincronização esperada não foi encontrada.'; end if;
  definition := replace(definition, old_insert, new_insert);
  definition := replace(definition, old_select, new_select);
  definition := replace(definition, old_recordset, new_recordset);
  execute definition;
end;
$migration$;

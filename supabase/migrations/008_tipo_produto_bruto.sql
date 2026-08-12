-- Armazena o tipo exibido no cadastro de Produtos Brutos.
alter table public.produtos_brutos
  add column if not exists tipo_produto text not null default 'Bruto'
  check (tipo_produto in ('Bruto', 'Fracionado'));

update public.produtos_brutos
set tipo_produto = 'Bruto'
where tipo_produto is null;

-- Inclui o novo atributo na sincronização atômica, mantendo compatibilidade
-- com os dados enviados pelas versões anteriores do sistema.
do $migration$
declare
  definition text;
  old_insert text := 'insert into public.produtos_brutos(nome, categoria_id, unidade, estoque_minimo, fornecedor, preco_medio, validade_dias, ativo)';
  new_insert text := 'insert into public.produtos_brutos(nome, categoria_id, tipo_produto, unidade, estoque_minimo, fornecedor, preco_medio, validade_dias, ativo)';
  old_select text := 'select x.nome, c.id, coalesce(nullif(x.unidade, ''''), ''UN''), coalesce(x.estoque_minimo, 0), nullif(trim(x.fornecedor), ''''), coalesce(x.preco_medio, 0), coalesce(x.validade_dias, 0), true';
  new_select text := 'select x.nome, c.id, coalesce(nullif(x.tipo_produto, ''''), ''Bruto''), coalesce(nullif(x.unidade, ''''), ''UN''), coalesce(x.estoque_minimo, 0), nullif(trim(x.fornecedor), ''''), coalesce(x.preco_medio, 0), coalesce(x.validade_dias, 0), true';
  old_recordset text := 'as x(nome text, categoria text, unidade text, estoque_minimo numeric, fornecedor text, preco_medio numeric, validade_dias integer)';
  new_recordset text := 'as x(nome text, categoria text, tipo_produto text, unidade text, estoque_minimo numeric, fornecedor text, preco_medio numeric, validade_dias integer)';
  old_update text := 'on conflict (nome) do update set categoria_id = excluded.categoria_id, unidade = excluded.unidade, estoque_minimo = excluded.estoque_minimo, fornecedor = excluded.fornecedor, preco_medio = excluded.preco_medio, validade_dias = excluded.validade_dias, ativo = true';
  new_update text := 'on conflict (nome) do update set categoria_id = excluded.categoria_id, tipo_produto = excluded.tipo_produto, unidade = excluded.unidade, estoque_minimo = excluded.estoque_minimo, fornecedor = excluded.fornecedor, preco_medio = excluded.preco_medio, validade_dias = excluded.validade_dias, ativo = true';
begin
  select pg_get_functiondef('public.sincronizar_estoque_atomico(jsonb,bigint,text)'::regprocedure) into definition;
  if position(old_insert in definition) = 0 then
    raise exception 'A função de sincronização esperada não foi encontrada. Aplique primeiro a migração 006.';
  end if;
  definition := replace(definition, old_insert, new_insert);
  definition := replace(definition, old_select, new_select);
  definition := replace(definition, old_recordset, new_recordset);
  definition := replace(definition, old_update, new_update);
  execute definition;
end;
$migration$;

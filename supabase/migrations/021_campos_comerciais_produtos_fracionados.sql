-- Produtos fracionados tambem possuem fornecedor e preco medio para que a
-- mesma janela de edicao seja usada em todos os cadastros.
alter table public.produtos_fracionados
  add column if not exists fornecedor text,
  add column if not exists preco_medio numeric not null default 0;

do $migration$
declare
  definition text;
begin
  select pg_get_functiondef('public.sincronizar_estoque_atomico(jsonb,bigint,text)'::regprocedure)
  into definition;

  definition := replace(
    definition,
    'insert into public.produtos_fracionados(nome, categoria_id, tipo_produto, unidade, origem_bruto_id, rendimento_percent, estoque_minimo, validade_dias, ativo)',
    'insert into public.produtos_fracionados(nome, categoria_id, tipo_produto, unidade, origem_bruto_id, rendimento_percent, estoque_minimo, fornecedor, preco_medio, validade_dias, ativo)'
  );
  definition := replace(
    definition,
    'b.id, coalesce(nullif(x.rendimento, 0), 100), coalesce(x.estoque_minimo, 0), coalesce(x.validade_dias, 0), true',
    'b.id, coalesce(nullif(x.rendimento, 0), 100), coalesce(x.estoque_minimo, 0), nullif(trim(x.fornecedor), ''''), coalesce(x.preco_medio, 0), coalesce(x.validade_dias, 0), true'
  );
  definition := replace(
    definition,
    'origem text, rendimento numeric, estoque_minimo numeric, validade_dias integer)',
    'origem text, rendimento numeric, estoque_minimo numeric, fornecedor text, preco_medio numeric, validade_dias integer)'
  );
  definition := replace(
    definition,
    'estoque_minimo = excluded.estoque_minimo, validade_dias = excluded.validade_dias, ativo = true',
    'estoque_minimo = excluded.estoque_minimo, fornecedor = excluded.fornecedor, preco_medio = excluded.preco_medio, validade_dias = excluded.validade_dias, ativo = true'
  );

  execute definition;
end;
$migration$;

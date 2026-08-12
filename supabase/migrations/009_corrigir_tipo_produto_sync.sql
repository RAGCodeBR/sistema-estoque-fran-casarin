-- Corrige a função publicada pela versão inicial da migração 008: o campo
-- tipo_produto pertence somente a produtos_brutos, nunca a fracionados.
do $migration$
declare
  definition text;
  invalid_update text := 'on conflict (nome) do update set categoria_id = excluded.categoria_id, tipo_produto = excluded.tipo_produto, unidade = excluded.unidade, origem_bruto_id = excluded.origem_bruto_id, rendimento_percent = excluded.rendimento_percent, estoque_minimo = excluded.estoque_minimo, validade_dias = excluded.validade_dias, ativo = true';
  correct_update text := 'on conflict (nome) do update set categoria_id = excluded.categoria_id, unidade = excluded.unidade, origem_bruto_id = excluded.origem_bruto_id, rendimento_percent = excluded.rendimento_percent, estoque_minimo = excluded.estoque_minimo, validade_dias = excluded.validade_dias, ativo = true';
begin
  select pg_get_functiondef('public.sincronizar_estoque_atomico(jsonb,bigint,text)'::regprocedure) into definition;
  if position(invalid_update in definition) = 0 then
    raise exception 'A correção esperada da função de sincronização não foi encontrada.';
  end if;
  execute replace(definition, invalid_update, correct_update);
end;
$migration$;

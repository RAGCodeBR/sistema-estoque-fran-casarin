-- A interface envia validade como texto (AAAA-MM-DD); a coluna do banco usa
-- date. Converte o valor na funcao atomica antes da insercao.
do $migration$
declare
  definition text;
  original text := 'nullif(trim(x.validade), '''')';
  corrigido text := 'nullif(trim(x.validade), '''')::date';
begin
  select pg_get_functiondef('public.sincronizar_estoque_atomico(jsonb,bigint,text)'::regprocedure)
  into definition;

  if position(original in definition) = 0 then
    raise exception 'A conversao de validade esperada nao foi encontrada.';
  end if;

  definition := replace(definition, original, corrigido);
  execute definition;
end;
$migration$;

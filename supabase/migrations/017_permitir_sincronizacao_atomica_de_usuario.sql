-- O modo pg_safeupdate do PostgREST rejeita DELETE ... WHERE true, mesmo
-- dentro da transacao atomica. Usar a chave primaria mantem o mesmo escopo
-- (todos os registros) e permite que a sincronizacao seja concluida apenas
-- para o usuario autenticado que chamou a funcao.
do $migration$
declare
  definition text;
begin
  select pg_get_functiondef('public.sincronizar_estoque_atomico(jsonb,bigint,text)'::regprocedure)
  into definition;

  if position('where true' in definition) = 0 then
    raise exception 'A funcao de sincronizacao esperada nao possui os DELETEs a corrigir.';
  end if;

  definition := replace(definition, 'where true', 'where id is not null');
  execute definition;
end;
$migration$;

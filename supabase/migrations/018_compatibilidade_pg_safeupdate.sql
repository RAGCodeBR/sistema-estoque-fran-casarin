-- Alguns ambientes com pg_safeupdate exigem uma comparacao explicita sobre a
-- chave, e nao aceitam "id is not null" como filtro de DELETE. A funcao
-- continua removendo somente linhas reais dentro da transacao iniciada por um
-- usuario autenticado.
do $migration$
declare
  definition text;
begin
  select pg_get_functiondef('public.sincronizar_estoque_atomico(jsonb,bigint,text)'::regprocedure)
  into definition;

  if position('where id is not null' in definition) = 0 then
    raise exception 'A funcao de sincronizacao esperada nao possui os DELETEs a corrigir.';
  end if;

  definition := replace(
    definition,
    'where id is not null',
    'where id <> ''00000000-0000-0000-0000-000000000000''::uuid'
  );
  execute definition;
end;
$migration$;

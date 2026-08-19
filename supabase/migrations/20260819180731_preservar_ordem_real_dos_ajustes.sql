-- A sincronização atômica recria as linhas de histórico. Preserve a sequência
-- atribuída no instante do ajuste, em vez de gerar uma nova ordem a cada sync.
do $migration$
declare
  definition text;
  inicio integer;
  fim integer;
  bloco_ajustes text := $sql$
insert into public.ajustes_estoque(data, produto_bruto_id, saldo_anterior, novo_saldo, diferenca, motivo, responsavel, criado_por, ordem)
    select x.data, b.id, coalesce(x.saldo_anterior, 0), coalesce(x.novo_saldo, 0), coalesce(x.diferenca, 0), coalesce(nullif(trim(x.motivo), ''), 'Ajuste'), coalesce(nullif(trim(x.responsavel), ''), 'Sistema'), v_usuario, coalesce(nullif(x.ordem, 0), nextval('public.ajustes_estoque_ordem_seq'))
    from jsonb_to_recordset(coalesce(p_dados->'ajustesEstoque', '[]'::jsonb)) as x(data date, produto text, saldo_anterior numeric, novo_saldo numeric, diferenca numeric, motivo text, responsavel text, ordem bigint)
    join public.produtos_brutos b on b.nome = x.produto;

    insert into public.ajustes_fracionados(data, produto_fracionado_id, saldo_anterior, novo_saldo, diferenca, motivo, responsavel, criado_por, ordem)
    select x.data, f.id, coalesce(x.saldo_anterior, 0), coalesce(x.novo_saldo, 0), coalesce(x.diferenca, 0), coalesce(nullif(trim(x.motivo), ''), 'Ajuste'), coalesce(nullif(trim(x.responsavel), ''), 'Sistema'), v_usuario, coalesce(nullif(x.ordem, 0), nextval('public.ajustes_fracionados_ordem_seq'))
    from jsonb_to_recordset(coalesce(p_dados->'ajustesFracionados', '[]'::jsonb)) as x(data date, produto text, saldo_anterior numeric, novo_saldo numeric, diferenca numeric, motivo text, responsavel text, ordem bigint)
    join public.produtos_fracionados f on f.nome = x.produto;

    $sql$;
begin
  select pg_get_functiondef('public.sincronizar_estoque_atomico(jsonb,bigint,text)'::regprocedure) into definition;
  inicio := position('insert into public.ajustes_estoque' in definition);
  fim := position('insert into public.pedidos_compra' in definition);
  if inicio = 0 or fim = 0 or fim <= inicio then
    raise exception 'A rotina de sincronização não contém os blocos esperados de ajustes.';
  end if;
  definition := left(definition, inicio - 1) || bloco_ajustes || substring(definition from fim);
  execute definition;
end;
$migration$;

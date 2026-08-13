-- Mantém o histórico de ajustes quando o Controle de Fracionados renomeia um
-- produto. O catálogo e as movimentações são sincronizados na mesma transação.
do $migration$
declare
  definition text;
  old_block text := $old$
    delete from public.saidas_fracionado where true;
    delete from public.producoes where true;
    delete from public.saidas_central where true;

    delete from public.produtos_fracionados pf where not exists (
$old$;
  new_block text := $new$
    delete from public.saidas_fracionado where true;
    delete from public.producoes where true;
    delete from public.saidas_central where true;
    delete from public.ajustes_fracionados where true;

    delete from public.produtos_fracionados pf where not exists (
$new$;
  insert_marker text := $marker$
    insert into public.saidas_central(data, documento, produto_bruto_id, destino_local_id, quantidade, criado_por)
$marker$;
  adjustments_block text := $adjustments$
    insert into public.ajustes_fracionados(data, produto_fracionado_id, saldo_anterior, novo_saldo, diferenca, motivo, responsavel, criado_por)
    select x.data, f.id, coalesce(x.saldo_anterior, 0), coalesce(x.novo_saldo, 0), coalesce(x.diferenca, 0), coalesce(nullif(trim(x.motivo), ''), 'Ajuste'), coalesce(nullif(trim(x.responsavel), ''), 'Sistema'), v_usuario
    from jsonb_to_recordset(coalesce(p_dados->'ajustesFracionados', '[]'::jsonb)) as x(data date, produto text, saldo_anterior numeric, novo_saldo numeric, diferenca numeric, motivo text, responsavel text)
    join public.produtos_fracionados f on f.nome = x.produto;

    insert into public.saidas_central(data, documento, produto_bruto_id, destino_local_id, quantidade, criado_por)
$adjustments$;
begin
  select pg_get_functiondef('public.sincronizar_estoque_atomico(jsonb,bigint,text)'::regprocedure) into definition;
  if position(old_block in definition) = 0 or position(insert_marker in definition) = 0 then
    raise exception 'A função de sincronização esperada não foi encontrada. Aplique primeiro a migração 007.';
  end if;
  definition := replace(definition, old_block, new_block);
  definition := replace(definition, insert_marker, adjustments_block);
  execute definition;
end;
$migration$;

do $$
begin
  drop policy if exists "ajustes_fracionados_write_controle_fracionados" on public.ajustes_fracionados;
  create policy "ajustes_fracionados_write_controle_fracionados" on public.ajustes_fracionados
  for all to authenticated
  using (public.usuario_tem_papel(array['controle_fracionados']))
  with check (public.usuario_tem_papel(array['controle_fracionados']));
end $$;

-- Amplia o perfil Controle de Fracionados: cadastro de produtos fracionados e
-- Saída da Central, sem liberar os demais cadastros ou movimentações.
do $migration$
declare
  definition text;
  marker text := '  if p_escopo in (''full'', ''fracionados'') then';
  restricted_block text := $block$
  if p_escopo = 'controle_fracionados_ampliado' then
    -- Somente as saídas da Central e os dados usados pelo setor de
    -- fracionamento são substituídos; os demais cadastros ficam intactos.
    delete from public.saidas_fracionado where true;
    delete from public.producoes where true;
    delete from public.saidas_central where true;

    delete from public.produtos_fracionados pf where not exists (
      select 1 from jsonb_to_recordset(coalesce(p_dados->'fracionados', '[]'::jsonb)) as x(nome text) where x.nome = pf.nome
    );
    insert into public.produtos_fracionados(nome, categoria_id, unidade, origem_bruto_id, rendimento_percent, estoque_minimo, validade_dias, ativo)
    select x.nome, c.id, coalesce(nullif(x.unidade, ''), 'UN'), b.id, coalesce(nullif(x.rendimento, 0), 100), coalesce(x.estoque_minimo, 0), coalesce(x.validade_dias, 0), true
    from jsonb_to_recordset(coalesce(p_dados->'fracionados', '[]'::jsonb)) as x(nome text, categoria text, unidade text, origem text, rendimento numeric, estoque_minimo numeric, validade_dias integer)
    left join public.categorias c on c.nome = x.categoria
    left join public.produtos_brutos b on b.nome = x.origem
    on conflict (nome) do update set categoria_id = excluded.categoria_id, unidade = excluded.unidade, origem_bruto_id = excluded.origem_bruto_id, rendimento_percent = excluded.rendimento_percent, estoque_minimo = excluded.estoque_minimo, validade_dias = excluded.validade_dias, ativo = true;

    insert into public.saidas_central(data, documento, produto_bruto_id, destino_local_id, quantidade, criado_por)
    select x.data, nullif(trim(x.documento), ''), b.id, l.id, x.quantidade, v_usuario
    from jsonb_to_recordset(coalesce(p_dados->'saidasCentral', '[]'::jsonb)) as x(data date, documento text, produto text, destino text, quantidade numeric)
    join public.produtos_brutos b on b.nome = x.produto join public.locais l on l.nome = x.destino;
  end if;

$block$;
begin
  select pg_get_functiondef('public.sincronizar_estoque_atomico(jsonb,bigint,text)'::regprocedure) into definition;
  if position(marker in definition) = 0 then
    raise exception 'A função de sincronização esperada não foi encontrada. Aplique primeiro a migração 006.';
  end if;

  definition := replace(definition, 'p_escopo not in (''full'', ''fracionados'')', 'p_escopo not in (''full'', ''fracionados'', ''controle_fracionados_ampliado'')');
  definition := replace(definition, marker, restricted_block || '  if p_escopo in (''full'', ''fracionados'', ''controle_fracionados_ampliado'') then');
  definition := replace(definition, 'if p_escopo = ''fracionados'' then' || E'\n      delete from public.saidas_fracionado', 'if p_escopo in (''fracionados'', ''controle_fracionados_ampliado'') then' || E'\n      delete from public.saidas_fracionado');
  definition := replace(definition, '  perform pg_advisory_xact_lock', E'  if p_escopo = ''controle_fracionados_ampliado'' and not public.usuario_tem_papel(array[''master'',''administrador'',''controle_fracionados'']) then\n    raise exception ''Sem permissao para sincronizar o Controle de Fracionados.'' using errcode = ''42501'';\n  end if;\n\n  perform pg_advisory_xact_lock');
  execute definition;
end;
$migration$;

do $$
declare tbl text;
begin
  foreach tbl in array array['produtos_fracionados', 'saidas_central'] loop
    execute format('drop policy if exists "%s_write_controle_fracionados" on public.%I', tbl, tbl);
    execute format('create policy "%s_write_controle_fracionados" on public.%I for all to authenticated using (public.usuario_tem_papel(array[''controle_fracionados''])) with check (public.usuario_tem_papel(array[''controle_fracionados'']))', tbl, tbl);
  end loop;
end $$;

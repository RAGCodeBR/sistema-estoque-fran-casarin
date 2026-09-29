-- Importacao de nota fiscal (PDF/XML) por um caminho exclusivo de INSERCAO.
--
-- A importacao antes passava pela sincronizacao geral, que compara a tela
-- inteira com o banco e tambem envia alteracoes e exclusoes. Esta funcao so
-- insere: produtos novos e entradas da nota. Nao altera nem remove nenhum
-- registro existente. A nota inteira e gravada em uma unica transacao: se
-- qualquer item for invalido, nada e gravado.

create or replace function public.importar_nota_fiscal(p_nota jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_usuario uuid := auth.uid();
  v_data date;
  v_nf text := nullif(pg_catalog.btrim(p_nota->>'nf'), '');
  v_fornecedor text := nullif(pg_catalog.btrim(p_nota->>'fornecedor'), '');
  v_chave_nf text;
  v_fornecedor_chave text;
  v_duplicada record;
  v_item jsonb;
  v_indice int;
  v_quantidade numeric;
  v_preco numeric;
  v_produto uuid;
  v_novo jsonb;
  v_nome text;
  v_nome_chave text;
  v_existente text;
  v_categoria uuid;
  v_criados jsonb := '{}'::jsonb;
  v_entradas uuid[] := '{}';
  v_produtos uuid[] := '{}';
  v_nomes_entradas text[] := '{}';
  v_nomes_produtos text[] := '{}';
  v_id uuid;
begin
  if v_usuario is null then
    raise exception 'Autenticação obrigatória.' using errcode = '42501';
  end if;
  if not public.usuario_tem_papel(array['master', 'administrador']) then
    raise exception 'Somente Master ou Administrador pode importar notas fiscais.' using errcode = '42501';
  end if;

  if pg_catalog.jsonb_typeof(p_nota->'itens') is distinct from 'array'
     or pg_catalog.jsonb_array_length(p_nota->'itens') = 0 then
    raise exception 'A nota não possui itens para lançar.' using errcode = '22023';
  end if;
  if pg_catalog.jsonb_array_length(p_nota->'itens') > 500 then
    raise exception 'A nota possui mais de 500 itens.' using errcode = '22023';
  end if;

  begin
    v_data := (p_nota->>'data')::date;
  exception when others then
    v_data := null;
  end;
  if v_data is null then
    raise exception 'Informe a data de emissão da nota.' using errcode = '22023';
  end if;

  -- Bloqueio de nota repetida, com a mesma regra da tela: mesmo numero (so os
  -- digitos, sem zeros a esquerda) e mesmo fornecedor, ou fornecedor ausente
  -- em um dos lados. O lock serializa duas importacoes simultaneas da mesma NF.
  if v_nf is not null then
    v_chave_nf := pg_catalog.ltrim(pg_catalog.regexp_replace(v_nf, '\D', '', 'g'), '0');
    if v_chave_nf = '' then v_chave_nf := public.normalizar_nome_catalogo(v_nf); end if;
    v_fornecedor_chave := public.normalizar_nome_catalogo(coalesce(v_fornecedor, ''));
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('importar-nf:' || v_chave_nf, 0));

    select e.data, e.fornecedor into v_duplicada
    from public.entradas_central e
    where e.nf is not null
      and coalesce(nullif(pg_catalog.ltrim(pg_catalog.regexp_replace(e.nf, '\D', '', 'g'), '0'), ''),
                   public.normalizar_nome_catalogo(e.nf)) = v_chave_nf
      and (v_fornecedor_chave = ''
           or coalesce(e.fornecedor, '') = ''
           or public.normalizar_nome_catalogo(e.fornecedor) = v_fornecedor_chave)
    limit 1;
    if found then
      raise exception 'A NF % já foi lançada em % (fornecedor: %). Nada foi gravado para evitar estoque em dobro.',
        v_nf, pg_catalog.to_char(v_duplicada.data, 'DD/MM/YYYY'), coalesce(v_duplicada.fornecedor, 'não informado')
        using errcode = '23505', detail = 'nf_duplicada';
    end if;
  end if;

  for v_item in select value from pg_catalog.jsonb_array_elements(p_nota->'itens')
  loop
    v_indice := coalesce((v_item->>'indice')::int, 0);

    begin
      v_quantidade := pg_catalog.round((v_item->>'quantidade')::numeric, 3);
    exception when others then
      v_quantidade := null;
    end;
    if v_quantidade is null or v_quantidade <= 0 then
      raise exception 'Item %: quantidade inválida. Informe um valor maior que zero.', v_indice
        using errcode = '22023', detail = 'item:' || v_indice;
    end if;

    begin
      v_preco := coalesce((v_item->>'precoUnitario')::numeric, 0);
    exception when others then
      v_preco := null;
    end;
    if v_preco is null or v_preco < 0 then
      raise exception 'Item %: preço inválido.', v_indice
        using errcode = '22023', detail = 'item:' || v_indice;
    end if;

    v_produto := null;
    if nullif(v_item->>'produtoId', '') is not null then
      select p.id, p.nome into v_produto, v_nome
      from public.produtos_brutos p
      where p.id = (v_item->>'produtoId')::uuid and p.ativo;
      if v_produto is null then
        raise exception 'Item %: o produto vinculado não existe mais ou foi arquivado. Atualize a página e vincule novamente.', v_indice
          using errcode = 'P0002', detail = 'item:' || v_indice;
      end if;
    else
      v_novo := v_item->'novoProduto';
      v_nome := pg_catalog.regexp_replace(pg_catalog.btrim(coalesce(v_novo->>'nome', '')), '[[:space:]]+', ' ', 'g');
      if v_nome = '' then
        raise exception 'Item %: selecione um produto ou informe o nome do produto novo.', v_indice
          using errcode = '22023', detail = 'item:' || v_indice;
      end if;
      v_nome_chave := public.normalizar_nome_catalogo(v_nome);

      if v_criados ? v_nome_chave then
        -- O mesmo produto novo aparece em mais de uma linha da nota.
        v_produto := (v_criados->>v_nome_chave)::uuid;
      else
        perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('produto-bruto:' || v_nome_chave, 0));
        select p.nome into v_existente
        from public.produtos_brutos p
        where public.normalizar_nome_catalogo(p.nome) = v_nome_chave
        limit 1;
        if v_existente is not null then
          raise exception 'Item %: já existe o produto "%" no cadastro. Selecione-o na lista em vez de cadastrar um novo.', v_indice, v_existente
            using errcode = '23505', detail = 'item:' || v_indice;
        end if;

        select c.id into v_categoria
        from public.categorias c
        where c.nome = coalesce(v_novo->>'categoria', '') and c.ativo;

        insert into public.produtos_brutos(nome, categoria_id, tipo_produto, unidade, estoque_minimo, fornecedor, preco_medio, validade_dias, ativo)
        values (
          v_nome, v_categoria, 'Bruto', coalesce(nullif(v_novo->>'unidade', ''), 'UN'),
          greatest(coalesce((v_novo->>'estoqueMinimo')::numeric, 0), 0), v_fornecedor, v_preco,
          greatest(coalesce((v_novo->>'validadeDias')::integer, 0), 0), true
        )
        returning id into v_produto;

        v_criados := v_criados || pg_catalog.jsonb_build_object(v_nome_chave, v_produto);
        v_produtos := v_produtos || v_produto;
        v_nomes_produtos := v_nomes_produtos || v_nome;
      end if;
    end if;

    insert into public.entradas_central(data, nf, produto_bruto_id, fornecedor, quantidade, preco_unitario, validade, criado_por)
    values (v_data, v_nf, v_produto, v_fornecedor, v_quantidade, v_preco, nullif(v_item->>'validade', '')::date, v_usuario)
    returning id into v_id;
    v_entradas := v_entradas || v_id;
    v_nomes_entradas := v_nomes_entradas || v_nome;
  end loop;

  insert into public.logs_sistema(usuario_id, resumo, detalhes)
  values (
    v_usuario,
    'Importou NF ' || coalesce(v_nf, 'sem número') || ': incluiu ' || pg_catalog.cardinality(v_entradas) || ' em Entrada na central'
      || case when pg_catalog.cardinality(v_produtos) > 0 then '; incluiu ' || pg_catalog.cardinality(v_produtos) || ' em Produtos brutos' else '' end,
    pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object('secao', 'Entrada na central', 'acao', 'incluiu', 'quantidade', pg_catalog.cardinality(v_entradas),
        'itens', pg_catalog.to_jsonb(v_nomes_entradas[1:8]))
    ) || case when pg_catalog.cardinality(v_produtos) > 0 then pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object('secao', 'Produtos brutos', 'acao', 'incluiu', 'quantidade', pg_catalog.cardinality(v_produtos),
        'itens', pg_catalog.to_jsonb(v_nomes_produtos[1:8]))
    ) else '[]'::jsonb end
  );

  return pg_catalog.jsonb_build_object(
    'entradas', pg_catalog.cardinality(v_entradas),
    'produtosCriados', pg_catalog.cardinality(v_produtos),
    'entradaIds', pg_catalog.to_jsonb(v_entradas),
    'produtoIds', pg_catalog.to_jsonb(v_produtos)
  );
end;
$$;

revoke all on function public.importar_nota_fiscal(jsonb) from public, anon;
grant execute on function public.importar_nota_fiscal(jsonb) to authenticated;

-- Sincronizacao incremental segura.
--
-- Esta migracao NAO altera, remove nem recria produtos, categorias ou
-- movimentos existentes. O primeiro comando cria uma fotografia integral das
-- tabelas operacionais para recuperacao manual, caso seja necessario.

insert into public.estoque_checkpoints(dados, total_movimentos, criado_por)
select jsonb_build_object(
  '_formato', 'raw_tables_v1',
  '_motivo', 'antes_sincronizacao_incremental_2026_08_19',
  '_revisao', (select revisao from public.estoque_sync_state where singleton),
  'categorias', (select coalesce(jsonb_agg(to_jsonb(t) order by id), '[]'::jsonb) from public.categorias t),
  'locais', (select coalesce(jsonb_agg(to_jsonb(t) order by id), '[]'::jsonb) from public.locais t),
  'produtos_brutos', (select coalesce(jsonb_agg(to_jsonb(t) order by id), '[]'::jsonb) from public.produtos_brutos t),
  'produtos_fracionados', (select coalesce(jsonb_agg(to_jsonb(t) order by id), '[]'::jsonb) from public.produtos_fracionados t),
  'entradas_central', (select coalesce(jsonb_agg(to_jsonb(t) order by id), '[]'::jsonb) from public.entradas_central t),
  'saidas_central', (select coalesce(jsonb_agg(to_jsonb(t) order by id), '[]'::jsonb) from public.saidas_central t),
  'producoes', (select coalesce(jsonb_agg(to_jsonb(t) order by id), '[]'::jsonb) from public.producoes t),
  'saidas_fracionado', (select coalesce(jsonb_agg(to_jsonb(t) order by id), '[]'::jsonb) from public.saidas_fracionado t),
  'ajustes_estoque', (select coalesce(jsonb_agg(to_jsonb(t) order by id), '[]'::jsonb) from public.ajustes_estoque t),
  'ajustes_fracionados', (select coalesce(jsonb_agg(to_jsonb(t) order by id), '[]'::jsonb) from public.ajustes_fracionados t),
  'pedidos_compra', (select coalesce(jsonb_agg(to_jsonb(t) order by id), '[]'::jsonb) from public.pedidos_compra t),
  'itens_manuais_compra', (select coalesce(jsonb_agg(to_jsonb(t) order by id), '[]'::jsonb) from public.itens_manuais_compra t)
),
  (select count(*) from public.entradas_central)
  + (select count(*) from public.saidas_central)
  + (select count(*) from public.producoes)
  + (select count(*) from public.saidas_fracionado)
  + (select count(*) from public.ajustes_estoque)
  + (select count(*) from public.ajustes_fracionados)
  + (select count(*) from public.pedidos_compra),
  null;

-- O cliente passa apenas as linhas efetivamente incluidas, alteradas ou
-- removidas. Todas as operacoes do mesmo clique rodam na mesma transacao.
create or replace function public.aplicar_operacoes_estoque(p_operacoes jsonb)
returns bigint
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_operacao jsonb;
  v_secao text;
  v_acao text;
  v_dados jsonb;
  v_id uuid;
  v_produto uuid;
  v_categoria uuid;
  v_origem uuid;
  v_destino uuid;
  v_atualizado_em timestamptz;
  v_usuario uuid := auth.uid();
  v_papel text;
  v_afetados integer;
  v_revisao bigint;
begin
  if v_usuario is null then
    raise exception 'Autenticacao obrigatoria.' using errcode = '42501';
  end if;

  select papel into v_papel
  from public.perfis
  where user_id = v_usuario and ativo = true;

  if v_papel is null or v_papel = 'visualizador' then
    raise exception 'Este usuario nao possui permissao para alterar o estoque.' using errcode = '42501';
  end if;

  if jsonb_typeof(p_operacoes) <> 'array'
     or jsonb_array_length(p_operacoes) = 0
     or jsonb_array_length(p_operacoes) > 50 then
    raise exception 'Lote incremental invalido.' using errcode = '22023';
  end if;

  for v_operacao in select value from jsonb_array_elements(p_operacoes)
  loop
    v_secao := v_operacao->>'secao';
    v_acao := v_operacao->>'acao';
    v_dados := coalesce(v_operacao->'dados', '{}'::jsonb);
    v_id := nullif(v_operacao->>'id', '')::uuid;
    v_atualizado_em := nullif(v_operacao->>'atualizadoEm', '')::timestamptz;
    v_afetados := 0;

    if v_acao not in ('inserir', 'alterar', 'excluir') then
      raise exception 'Acao incremental invalida.' using errcode = '22023';
    end if;

    if v_papel = 'controle_fracionados'
       and v_secao not in ('fracionados', 'saidasCentral', 'producoes', 'saidasFracionado', 'ajustesFracionados') then
      raise exception 'Sem permissao para alterar esta area do estoque.' using errcode = '42501';
    end if;

    if v_secao = 'categorias' then
      if v_acao = 'inserir' then
        select id into v_id from public.categorias where nome = trim(v_dados->>'nome') for update;
        if v_id is null then
          insert into public.categorias(nome, ativo)
          values (trim(v_dados->>'nome'), true)
          returning id into v_id;
        elsif exists(select 1 from public.categorias where id = v_id and ativo) then
          raise exception 'Ja existe uma categoria com esse nome.' using errcode = '23505';
        else
          update public.categorias set ativo = true where id = v_id;
        end if;
      elsif v_acao = 'alterar' then
        update public.categorias
        set nome = trim(v_dados->>'nome')
        where id = v_id and (v_atualizado_em is null or atualizado_em = v_atualizado_em);
        get diagnostics v_afetados = row_count;
      else
        if exists(select 1 from public.produtos_brutos where categoria_id = v_id and ativo)
           or exists(select 1 from public.produtos_fracionados where categoria_id = v_id and ativo) then
          raise exception 'A categoria ainda possui produtos ativos.' using errcode = '23503';
        end if;
        update public.categorias set ativo = false
        where id = v_id and (v_atualizado_em is null or atualizado_em = v_atualizado_em);
        get diagnostics v_afetados = row_count;
      end if;

    elsif v_secao = 'locais' then
      if v_acao = 'inserir' then
        insert into public.locais(nome, tipo, responsavel)
        values (trim(v_dados->>'nome'), coalesce(nullif(v_dados->>'tipo',''), 'Consumidor'), nullif(trim(v_dados->>'responsavel'),''));
      elsif v_acao = 'alterar' then
        update public.locais
        set nome = trim(v_dados->>'nome'),
            tipo = coalesce(nullif(v_dados->>'tipo',''), 'Consumidor'),
            responsavel = nullif(trim(v_dados->>'responsavel'),'')
        where id = v_id and (v_atualizado_em is null or atualizado_em = v_atualizado_em);
        get diagnostics v_afetados = row_count;
      else
        delete from public.locais
        where id = v_id and (v_atualizado_em is null or atualizado_em = v_atualizado_em);
        get diagnostics v_afetados = row_count;
      end if;

    elsif v_secao = 'brutos' then
      select id into v_categoria from public.categorias where nome = v_dados->>'categoria' and ativo;
      if v_acao = 'inserir' then
        select id into v_id from public.produtos_brutos where nome = trim(v_dados->>'nome') for update;
        if v_id is null then
          insert into public.produtos_brutos(nome, categoria_id, tipo_produto, unidade, estoque_minimo, fornecedor, preco_medio, validade_dias, ativo)
          values (trim(v_dados->>'nome'), v_categoria, coalesce(nullif(v_dados->>'tipoProduto',''),'Bruto'), coalesce(nullif(v_dados->>'unidade',''),'UN'),
                  coalesce((v_dados->>'estoqueMinimo')::numeric,0), nullif(trim(v_dados->>'fornecedor'),''),
                  coalesce((v_dados->>'precoMedio')::numeric,0), coalesce((v_dados->>'validadeDias')::integer,0), true);
        elsif exists(select 1 from public.produtos_brutos where id = v_id and ativo) then
          raise exception 'Ja existe um produto bruto ativo com esse nome.' using errcode = '23505';
        else
          update public.produtos_brutos
          set categoria_id=v_categoria, tipo_produto=coalesce(nullif(v_dados->>'tipoProduto',''),'Bruto'),
              unidade=coalesce(nullif(v_dados->>'unidade',''),'UN'), estoque_minimo=coalesce((v_dados->>'estoqueMinimo')::numeric,0),
              fornecedor=nullif(trim(v_dados->>'fornecedor'),''), preco_medio=coalesce((v_dados->>'precoMedio')::numeric,0),
              validade_dias=coalesce((v_dados->>'validadeDias')::integer,0), ativo=true
          where id=v_id;
        end if;
      elsif v_acao = 'excluir' then
        update public.produtos_brutos set ativo=false
        where id=v_id and (v_atualizado_em is null or atualizado_em=v_atualizado_em);
        get diagnostics v_afetados = row_count;
      else
        raise exception 'Edicoes de produto devem usar a operacao especifica.' using errcode = '22023';
      end if;

    elsif v_secao = 'fracionados' then
      select id into v_categoria from public.categorias where nome = v_dados->>'categoria' and ativo;
      select id into v_origem from public.produtos_brutos where nome = v_dados->>'origem' and ativo;
      if v_acao = 'inserir' then
        select id into v_id from public.produtos_fracionados where nome = trim(v_dados->>'nome') for update;
        if v_id is null then
          insert into public.produtos_fracionados(nome, categoria_id, tipo_produto, unidade, origem_bruto_id, rendimento_percent, estoque_minimo, fornecedor, preco_medio, validade_dias, ativo)
          values (trim(v_dados->>'nome'), v_categoria, coalesce(nullif(v_dados->>'tipoProduto',''),'Fracionado'), coalesce(nullif(v_dados->>'unidade',''),'UN'),
                  v_origem, coalesce(nullif((v_dados->>'rendimento')::numeric,0),100), coalesce((v_dados->>'estoqueMinimo')::numeric,0),
                  nullif(trim(v_dados->>'fornecedor'),''), coalesce((v_dados->>'precoMedio')::numeric,0), coalesce((v_dados->>'validadeDias')::integer,0), true);
        elsif exists(select 1 from public.produtos_fracionados where id = v_id and ativo) then
          raise exception 'Ja existe um produto fracionado ativo com esse nome.' using errcode = '23505';
        else
          update public.produtos_fracionados
          set categoria_id=v_categoria, tipo_produto=coalesce(nullif(v_dados->>'tipoProduto',''),'Fracionado'),
              unidade=coalesce(nullif(v_dados->>'unidade',''),'UN'), origem_bruto_id=v_origem,
              rendimento_percent=coalesce(nullif((v_dados->>'rendimento')::numeric,0),100), estoque_minimo=coalesce((v_dados->>'estoqueMinimo')::numeric,0),
              fornecedor=nullif(trim(v_dados->>'fornecedor'),''), preco_medio=coalesce((v_dados->>'precoMedio')::numeric,0),
              validade_dias=coalesce((v_dados->>'validadeDias')::integer,0), ativo=true
          where id=v_id;
        end if;
      elsif v_acao = 'excluir' then
        update public.produtos_fracionados set ativo=false
        where id=v_id and (v_atualizado_em is null or atualizado_em=v_atualizado_em);
        get diagnostics v_afetados = row_count;
      else
        raise exception 'Edicoes de produto devem usar a operacao especifica.' using errcode = '22023';
      end if;

    elsif v_secao = 'entradasCentral' then
      select id into strict v_produto from public.produtos_brutos where nome=v_dados->>'produto' and ativo;
      if v_acao = 'inserir' then
        insert into public.entradas_central(data,nf,produto_bruto_id,fornecedor,quantidade,preco_unitario,validade,criado_por)
        values ((v_dados->>'data')::date,nullif(trim(v_dados->>'nf'),''),v_produto,nullif(trim(v_dados->>'fornecedor'),''),
                (v_dados->>'quantidade')::numeric,coalesce((v_dados->>'precoUnitario')::numeric,0),nullif(v_dados->>'validade','')::date,v_usuario);
      elsif v_acao = 'alterar' then
        update public.entradas_central
        set data=(v_dados->>'data')::date,nf=nullif(trim(v_dados->>'nf'),''),produto_bruto_id=v_produto,
            fornecedor=nullif(trim(v_dados->>'fornecedor'),''),quantidade=(v_dados->>'quantidade')::numeric,
            preco_unitario=coalesce((v_dados->>'precoUnitario')::numeric,0),validade=nullif(v_dados->>'validade','')::date
        where id=v_id and (v_atualizado_em is null or atualizado_em=v_atualizado_em);
        get diagnostics v_afetados = row_count;
      else
        delete from public.entradas_central where id=v_id and (v_atualizado_em is null or atualizado_em=v_atualizado_em);
        get diagnostics v_afetados = row_count;
      end if;

    elsif v_secao = 'saidasCentral' then
      select id into strict v_produto from public.produtos_brutos where nome=v_dados->>'produto' and ativo;
      select id into strict v_destino from public.locais where nome=v_dados->>'destino';
      perform pg_advisory_xact_lock(hashtextextended('saldo-bruto:' || v_produto::text, 0));
      if v_acao = 'inserir' then
        insert into public.saidas_central(data,documento,produto_bruto_id,destino_local_id,quantidade,criado_por)
        values ((v_dados->>'data')::date,nullif(trim(v_dados->>'documento'),''),v_produto,v_destino,(v_dados->>'quantidade')::numeric,v_usuario);
      elsif v_acao = 'alterar' then
        update public.saidas_central
        set data=(v_dados->>'data')::date,documento=nullif(trim(v_dados->>'documento'),''),produto_bruto_id=v_produto,
            destino_local_id=v_destino,quantidade=(v_dados->>'quantidade')::numeric
        where id=v_id and (v_atualizado_em is null or atualizado_em=v_atualizado_em);
        get diagnostics v_afetados = row_count;
      else
        delete from public.saidas_central where id=v_id and (v_atualizado_em is null or atualizado_em=v_atualizado_em);
        get diagnostics v_afetados = row_count;
      end if;

    elsif v_secao = 'producoes' then
      select id into strict v_produto from public.produtos_brutos where nome=v_dados->>'produtoBruto' and ativo;
      select id into strict v_origem from public.produtos_fracionados where nome=v_dados->>'produtoFracionado' and ativo;
      perform pg_advisory_xact_lock(hashtextextended('saldo-bruto:' || v_produto::text, 0));
      perform pg_advisory_xact_lock(hashtextextended('saldo-fracionado:' || v_origem::text, 0));
      if v_acao = 'inserir' then
        insert into public.producoes(data,produto_bruto_id,quantidade_utilizada,produto_fracionado_id,quantidade_produzida,criado_por)
        values ((v_dados->>'data')::date,v_produto,(v_dados->>'quantidadeUtilizada')::numeric,v_origem,(v_dados->>'quantidadeProduzida')::numeric,v_usuario);
      elsif v_acao = 'alterar' then
        update public.producoes
        set data=(v_dados->>'data')::date,produto_bruto_id=v_produto,quantidade_utilizada=(v_dados->>'quantidadeUtilizada')::numeric,
            produto_fracionado_id=v_origem,quantidade_produzida=(v_dados->>'quantidadeProduzida')::numeric
        where id=v_id and (v_atualizado_em is null or atualizado_em=v_atualizado_em);
        get diagnostics v_afetados = row_count;
      else
        delete from public.producoes where id=v_id and (v_atualizado_em is null or atualizado_em=v_atualizado_em);
        get diagnostics v_afetados = row_count;
      end if;

    elsif v_secao = 'saidasFracionado' then
      select id into strict v_produto from public.produtos_fracionados where nome=v_dados->>'produto' and ativo;
      select id into strict v_destino from public.locais where nome=v_dados->>'destino';
      perform pg_advisory_xact_lock(hashtextextended('saldo-fracionado:' || v_produto::text, 0));
      if v_acao = 'inserir' then
        insert into public.saidas_fracionado(data,documento,produto_fracionado_id,destino_local_id,quantidade,criado_por)
        values ((v_dados->>'data')::date,nullif(trim(v_dados->>'documento'),''),v_produto,v_destino,(v_dados->>'quantidade')::numeric,v_usuario);
      elsif v_acao = 'alterar' then
        update public.saidas_fracionado
        set data=(v_dados->>'data')::date,documento=nullif(trim(v_dados->>'documento'),''),produto_fracionado_id=v_produto,
            destino_local_id=v_destino,quantidade=(v_dados->>'quantidade')::numeric
        where id=v_id and (v_atualizado_em is null or atualizado_em=v_atualizado_em);
        get diagnostics v_afetados = row_count;
      else
        delete from public.saidas_fracionado where id=v_id and (v_atualizado_em is null or atualizado_em=v_atualizado_em);
        get diagnostics v_afetados = row_count;
      end if;

    elsif v_secao in ('ajustesEstoque','ajustesFracionados') then
      if v_secao = 'ajustesEstoque' then
        select id into strict v_produto from public.produtos_brutos where nome=v_dados->>'produto' and ativo;
        perform pg_advisory_xact_lock(hashtextextended('saldo-bruto:' || v_produto::text, 0));
        if v_acao = 'inserir' then
          insert into public.ajustes_estoque(data,produto_bruto_id,saldo_anterior,novo_saldo,diferenca,motivo,responsavel,criado_por,ordem)
          values ((v_dados->>'data')::date,v_produto,coalesce((v_dados->>'saldoAnterior')::numeric,0),(v_dados->>'novoSaldo')::numeric,
                  coalesce((v_dados->>'diferenca')::numeric,0),trim(v_dados->>'motivo'),trim(v_dados->>'responsavel'),v_usuario,
                  coalesce(nullif((v_dados->>'ordem')::bigint,0),nextval('public.ajustes_estoque_ordem_seq')));
        elsif v_acao = 'excluir' then
          delete from public.ajustes_estoque where id=v_id and (v_atualizado_em is null or atualizado_em=v_atualizado_em);
          get diagnostics v_afetados = row_count;
        else
          raise exception 'O historico de ajustes nao pode ser editado.' using errcode = '22023';
        end if;
      else
        select id into strict v_produto from public.produtos_fracionados where nome=v_dados->>'produto' and ativo;
        perform pg_advisory_xact_lock(hashtextextended('saldo-fracionado:' || v_produto::text, 0));
        if v_acao = 'inserir' then
          insert into public.ajustes_fracionados(data,produto_fracionado_id,saldo_anterior,novo_saldo,diferenca,motivo,responsavel,criado_por,ordem)
          values ((v_dados->>'data')::date,v_produto,coalesce((v_dados->>'saldoAnterior')::numeric,0),(v_dados->>'novoSaldo')::numeric,
                  coalesce((v_dados->>'diferenca')::numeric,0),trim(v_dados->>'motivo'),trim(v_dados->>'responsavel'),v_usuario,
                  coalesce(nullif((v_dados->>'ordem')::bigint,0),nextval('public.ajustes_fracionados_ordem_seq')));
        elsif v_acao = 'excluir' then
          delete from public.ajustes_fracionados where id=v_id and (v_atualizado_em is null or atualizado_em=v_atualizado_em);
          get diagnostics v_afetados = row_count;
        else
          raise exception 'O historico de ajustes nao pode ser editado.' using errcode = '22023';
        end if;
      end if;

    elsif v_secao = 'pedidosCompra' then
      select id into strict v_produto from public.produtos_brutos where nome=v_dados->>'produto' and ativo;
      if v_acao = 'inserir' then
        insert into public.pedidos_compra(data,produto_bruto_id,fornecedor,quantidade_pedida,preco_estimado,status,data_recebimento,quantidade_recebida,preco_recebido,criado_por)
        values ((v_dados->>'data')::date,v_produto,nullif(trim(v_dados->>'fornecedor'),''),(v_dados->>'quantidadePedida')::numeric,
                coalesce((v_dados->>'precoEstimado')::numeric,0),coalesce(nullif(v_dados->>'status',''),'pendente'),
                nullif(v_dados->>'dataRecebimento','')::date,nullif(v_dados->>'quantidadeRecebida','')::numeric,
                nullif(v_dados->>'precoRecebido','')::numeric,v_usuario);
      elsif v_acao = 'alterar' then
        update public.pedidos_compra
        set data=(v_dados->>'data')::date,produto_bruto_id=v_produto,fornecedor=nullif(trim(v_dados->>'fornecedor'),''),
            quantidade_pedida=(v_dados->>'quantidadePedida')::numeric,preco_estimado=coalesce((v_dados->>'precoEstimado')::numeric,0),
            status=coalesce(nullif(v_dados->>'status',''),'pendente'),data_recebimento=nullif(v_dados->>'dataRecebimento','')::date,
            quantidade_recebida=nullif(v_dados->>'quantidadeRecebida','')::numeric,preco_recebido=nullif(v_dados->>'precoRecebido','')::numeric
        where id=v_id and (v_atualizado_em is null or atualizado_em=v_atualizado_em);
        get diagnostics v_afetados = row_count;
      else
        delete from public.pedidos_compra where id=v_id and (v_atualizado_em is null or atualizado_em=v_atualizado_em);
        get diagnostics v_afetados = row_count;
      end if;

    elsif v_secao = 'itensManuaisCompra' then
      select id into strict v_produto from public.produtos_brutos where nome=v_dados->>'nome' and ativo;
      if v_acao = 'inserir' then
        insert into public.itens_manuais_compra(produto_bruto_id,criado_por)
        values(v_produto,v_usuario) on conflict (produto_bruto_id) do nothing;
      elsif v_acao = 'excluir' then
        delete from public.itens_manuais_compra where produto_bruto_id=v_produto;
      else
        raise exception 'Operacao invalida para item manual.' using errcode = '22023';
      end if;
    else
      raise exception 'Secao incremental invalida: %', v_secao using errcode = '22023';
    end if;

    if v_acao in ('alterar','excluir') and v_secao <> 'itensManuaisCompra' and v_afetados = 0 then
      raise exception 'Este registro foi alterado em outra sessao. Recarregue a pagina antes de salvar.' using errcode = '40001';
    end if;
  end loop;

  select revisao into v_revisao from public.estoque_sync_state where singleton=true;
  return v_revisao;
end;
$$;

revoke all on function public.aplicar_operacoes_estoque(jsonb) from public, anon;
grant execute on function public.aplicar_operacoes_estoque(jsonb) to authenticated;

-- Uma unica notificacao de revisao substitui a assinatura ampla de todas as
-- tabelas no cliente. A inclusao e idempotente para ambientes ja migrados.
do $$
begin
  alter publication supabase_realtime add table public.estoque_sync_state;
exception when duplicate_object then
  null;
end;
$$;

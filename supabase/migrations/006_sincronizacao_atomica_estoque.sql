-- Sincroniza o banco legado em uma unica transacao. Nenhum cliente observa as
-- tabelas de movimentos vazias entre a remocao e a reinsercao dos registros.

create table if not exists public.estoque_sync_state (
  singleton boolean primary key default true check (singleton),
  revisao bigint not null default 0,
  atualizado_em timestamptz not null default now()
);

insert into public.estoque_sync_state(singleton, revisao)
values (true, 0)
on conflict (singleton) do nothing;

alter table public.estoque_sync_state enable row level security;
drop policy if exists "estoque_sync_state_select_roles" on public.estoque_sync_state;
create policy "estoque_sync_state_select_roles" on public.estoque_sync_state
for select to authenticated
using (public.usuario_tem_papel(array['master','administrador','controle_fracionados','visualizador']));

create or replace function public.obter_revisao_estoque()
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select revisao from public.estoque_sync_state where singleton = true;
$$;

revoke all on function public.obter_revisao_estoque() from public;
grant execute on function public.obter_revisao_estoque() to authenticated;

create or replace function public.sincronizar_estoque_atomico(
  p_dados jsonb,
  p_revisao_esperada bigint,
  p_escopo text default 'full'
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_revisao bigint;
  v_usuario uuid := auth.uid();
begin
  if v_usuario is null then
    raise exception 'Autenticacao obrigatoria.' using errcode = '42501';
  end if;
  if p_escopo not in ('full', 'fracionados') then
    raise exception 'Escopo de sincronizacao invalido.' using errcode = '22023';
  end if;
  if p_escopo = 'full' and not public.usuario_tem_papel(array['master','administrador']) then
    raise exception 'Sem permissao para sincronizar o estoque completo.' using errcode = '42501';
  end if;
  if p_escopo = 'fracionados' and not public.usuario_tem_papel(array['master','administrador','controle_fracionados']) then
    raise exception 'Sem permissao para sincronizar fracionados.' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtext('estoque_sync_atomico'));
  select revisao into v_revisao
  from public.estoque_sync_state
  where singleton = true
  for update;

  if v_revisao <> p_revisao_esperada then
    raise exception 'O estoque foi alterado em outra sessao. Recarregue a pagina antes de salvar.' using errcode = '40001';
  end if;

  if p_escopo = 'full' then
    -- Catálogos primeiro; os movimentos abaixo sao removidos e recriados dentro
    -- desta mesma transacao, portanto uma falha reverte tudo automaticamente.
    with nomes as (
      select nullif(trim(x.nome), '') as nome from jsonb_to_recordset(coalesce(p_dados->'categorias', '[]'::jsonb)) as x(nome text)
      union
      select nullif(trim(x.categoria), '') from jsonb_to_recordset(coalesce(p_dados->'brutos', '[]'::jsonb)) as x(categoria text)
      union
      select nullif(trim(x.categoria), '') from jsonb_to_recordset(coalesce(p_dados->'fracionados', '[]'::jsonb)) as x(categoria text)
      union select 'Outros'
    )
    insert into public.categorias(nome)
    select nome from nomes where nome is not null
    on conflict (nome) do nothing;

    insert into public.locais(nome, tipo, responsavel)
    select x.nome, coalesce(nullif(x.tipo, ''), 'Consumidor'), nullif(trim(x.responsavel), '')
    from jsonb_to_recordset(coalesce(p_dados->'locais', '[]'::jsonb)) as x(nome text, tipo text, responsavel text)
    on conflict (nome) do update set tipo = excluded.tipo, responsavel = excluded.responsavel;

    insert into public.produtos_brutos(nome, categoria_id, unidade, estoque_minimo, fornecedor, preco_medio, validade_dias, ativo)
    select x.nome, c.id, coalesce(nullif(x.unidade, ''), 'UN'), coalesce(x.estoque_minimo, 0), nullif(trim(x.fornecedor), ''), coalesce(x.preco_medio, 0), coalesce(x.validade_dias, 0), true
    from jsonb_to_recordset(coalesce(p_dados->'brutos', '[]'::jsonb)) as x(nome text, categoria text, unidade text, estoque_minimo numeric, fornecedor text, preco_medio numeric, validade_dias integer)
    left join public.categorias c on c.nome = x.categoria
    on conflict (nome) do update set categoria_id = excluded.categoria_id, unidade = excluded.unidade, estoque_minimo = excluded.estoque_minimo, fornecedor = excluded.fornecedor, preco_medio = excluded.preco_medio, validade_dias = excluded.validade_dias, ativo = true;

    insert into public.produtos_fracionados(nome, categoria_id, unidade, origem_bruto_id, rendimento_percent, estoque_minimo, validade_dias, ativo)
    select x.nome, c.id, coalesce(nullif(x.unidade, ''), 'UN'), b.id, coalesce(nullif(x.rendimento, 0), 100), coalesce(x.estoque_minimo, 0), coalesce(x.validade_dias, 0), true
    from jsonb_to_recordset(coalesce(p_dados->'fracionados', '[]'::jsonb)) as x(nome text, categoria text, unidade text, origem text, rendimento numeric, estoque_minimo numeric, validade_dias integer)
    left join public.categorias c on c.nome = x.categoria
    left join public.produtos_brutos b on b.nome = x.origem
    on conflict (nome) do update set categoria_id = excluded.categoria_id, unidade = excluded.unidade, origem_bruto_id = excluded.origem_bruto_id, rendimento_percent = excluded.rendimento_percent, estoque_minimo = excluded.estoque_minimo, validade_dias = excluded.validade_dias, ativo = true;

    delete from public.itens_manuais_compra;
    delete from public.pedidos_compra;
    delete from public.ajustes_fracionados;
    delete from public.ajustes_estoque;
    delete from public.saidas_fracionado;
    delete from public.producoes;
    delete from public.saidas_central;
    delete from public.entradas_central;

    delete from public.produtos_fracionados pf where not exists (
      select 1 from jsonb_to_recordset(coalesce(p_dados->'fracionados', '[]'::jsonb)) as x(nome text) where x.nome = pf.nome
    );
    delete from public.produtos_brutos pb where not exists (
      select 1 from jsonb_to_recordset(coalesce(p_dados->'brutos', '[]'::jsonb)) as x(nome text) where x.nome = pb.nome
    );
    delete from public.locais l where not exists (
      select 1 from jsonb_to_recordset(coalesce(p_dados->'locais', '[]'::jsonb)) as x(nome text) where x.nome = l.nome
    );
    delete from public.categorias c where c.nome <> 'Outros' and not exists (
      select 1 from (
        select nullif(trim(x.nome), '') as nome from jsonb_to_recordset(coalesce(p_dados->'categorias', '[]'::jsonb)) as x(nome text)
        union select nullif(trim(x.categoria), '') from jsonb_to_recordset(coalesce(p_dados->'brutos', '[]'::jsonb)) as x(categoria text)
        union select nullif(trim(x.categoria), '') from jsonb_to_recordset(coalesce(p_dados->'fracionados', '[]'::jsonb)) as x(categoria text)
      ) nomes where nomes.nome = c.nome
    );

    insert into public.entradas_central(data, nf, produto_bruto_id, fornecedor, quantidade, preco_unitario, validade, criado_por)
    select x.data, nullif(trim(x.nf), ''), b.id, nullif(trim(x.fornecedor), ''), x.quantidade, coalesce(x.preco_unitario, 0), nullif(trim(x.validade), ''), v_usuario
    from jsonb_to_recordset(coalesce(p_dados->'entradasCentral', '[]'::jsonb)) as x(data date, nf text, produto text, fornecedor text, quantidade numeric, preco_unitario numeric, validade text)
    join public.produtos_brutos b on b.nome = x.produto;

    insert into public.saidas_central(data, documento, produto_bruto_id, destino_local_id, quantidade, criado_por)
    select x.data, nullif(trim(x.documento), ''), b.id, l.id, x.quantidade, v_usuario
    from jsonb_to_recordset(coalesce(p_dados->'saidasCentral', '[]'::jsonb)) as x(data date, documento text, produto text, destino text, quantidade numeric)
    join public.produtos_brutos b on b.nome = x.produto join public.locais l on l.nome = x.destino;
  end if;

  if p_escopo in ('full', 'fracionados') then
    if p_escopo = 'fracionados' then
      delete from public.saidas_fracionado;
      delete from public.producoes;
    end if;

    insert into public.producoes(data, produto_bruto_id, quantidade_utilizada, produto_fracionado_id, quantidade_produzida, criado_por)
    select x.data, b.id, x.quantidade_utilizada, f.id, x.quantidade_produzida, v_usuario
    from jsonb_to_recordset(coalesce(p_dados->'producoes', '[]'::jsonb)) as x(data date, produto_bruto text, quantidade_utilizada numeric, produto_fracionado text, quantidade_produzida numeric)
    join public.produtos_brutos b on b.nome = x.produto_bruto join public.produtos_fracionados f on f.nome = x.produto_fracionado;

    insert into public.saidas_fracionado(data, documento, produto_fracionado_id, destino_local_id, quantidade, criado_por)
    select x.data, nullif(trim(x.documento), ''), f.id, l.id, x.quantidade, v_usuario
    from jsonb_to_recordset(coalesce(p_dados->'saidasFracionado', '[]'::jsonb)) as x(data date, documento text, produto text, destino text, quantidade numeric)
    join public.produtos_fracionados f on f.nome = x.produto join public.locais l on l.nome = x.destino;
  end if;

  if p_escopo = 'full' then
    insert into public.ajustes_estoque(data, produto_bruto_id, saldo_anterior, novo_saldo, diferenca, motivo, responsavel, criado_por)
    select x.data, b.id, coalesce(x.saldo_anterior, 0), coalesce(x.novo_saldo, 0), coalesce(x.diferenca, 0), coalesce(nullif(trim(x.motivo), ''), 'Ajuste'), coalesce(nullif(trim(x.responsavel), ''), 'Sistema'), v_usuario
    from jsonb_to_recordset(coalesce(p_dados->'ajustesEstoque', '[]'::jsonb)) as x(data date, produto text, saldo_anterior numeric, novo_saldo numeric, diferenca numeric, motivo text, responsavel text)
    join public.produtos_brutos b on b.nome = x.produto;

    insert into public.ajustes_fracionados(data, produto_fracionado_id, saldo_anterior, novo_saldo, diferenca, motivo, responsavel, criado_por)
    select x.data, f.id, coalesce(x.saldo_anterior, 0), coalesce(x.novo_saldo, 0), coalesce(x.diferenca, 0), coalesce(nullif(trim(x.motivo), ''), 'Ajuste'), coalesce(nullif(trim(x.responsavel), ''), 'Sistema'), v_usuario
    from jsonb_to_recordset(coalesce(p_dados->'ajustesFracionados', '[]'::jsonb)) as x(data date, produto text, saldo_anterior numeric, novo_saldo numeric, diferenca numeric, motivo text, responsavel text)
    join public.produtos_fracionados f on f.nome = x.produto;

    insert into public.pedidos_compra(data, produto_bruto_id, fornecedor, quantidade_pedida, preco_estimado, status, data_recebimento, quantidade_recebida, preco_recebido, criado_por)
    select x.data, b.id, nullif(trim(x.fornecedor), ''), x.quantidade_pedida, coalesce(x.preco_estimado, 0), coalesce(nullif(x.status, ''), 'pendente'), nullif(trim(x.data_recebimento), '')::date, x.quantidade_recebida, x.preco_recebido, v_usuario
    from jsonb_to_recordset(coalesce(p_dados->'pedidosCompra', '[]'::jsonb)) as x(data date, produto text, fornecedor text, quantidade_pedida numeric, preco_estimado numeric, status text, data_recebimento text, quantidade_recebida numeric, preco_recebido numeric)
    join public.produtos_brutos b on b.nome = x.produto;

    insert into public.itens_manuais_compra(produto_bruto_id, criado_por)
    select b.id, v_usuario
    from jsonb_array_elements_text(coalesce(p_dados->'itensManuaisCompra', '[]'::jsonb)) as x(nome)
    join public.produtos_brutos b on b.nome = x.nome;
  end if;

  update public.estoque_sync_state set revisao = revisao + 1, atualizado_em = now() where singleton = true returning revisao into v_revisao;
  return v_revisao;
end;
$$;

revoke all on function public.sincronizar_estoque_atomico(jsonb, bigint, text) from public;
grant execute on function public.sincronizar_estoque_atomico(jsonb, bigint, text) to authenticated;

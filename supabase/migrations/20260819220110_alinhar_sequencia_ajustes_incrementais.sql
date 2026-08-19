-- Mantem os proximos ajustes depois da maior ordem ja existente. Nenhuma
-- linha de estoque ou historico e alterada; somente os contadores internos.
select setval(
  'public.ajustes_estoque_ordem_seq',
  greatest(1, coalesce((select max(ordem) from public.ajustes_estoque), 0)),
  true
);

select setval(
  'public.ajustes_fracionados_ordem_seq',
  greatest(1, coalesce((select max(ordem) from public.ajustes_fracionados), 0)),
  true
);

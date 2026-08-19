-- A sincronizacao completa antiga era usada por abas desatualizadas e podia
-- gerar milhares de conflitos. Ela passa a existir somente com um nome
-- explicito de restauracao, chamado pela tela de Backup.
--
-- ALTER FUNCTION preserva integralmente o corpo e nao executa nenhuma
-- operacao sobre produtos, saldos, categorias ou movimentos.
alter function public.sincronizar_estoque_atomico(jsonb, bigint, text)
  rename to restaurar_backup_estoque_atomico;

-- Funcoes SECURITY DEFINER nao devem herdar EXECUTE de PUBLIC. Somente um
-- usuario autenticado chega ao controle de papel existente no corpo da RPC.
revoke all on function public.restaurar_backup_estoque_atomico(jsonb, bigint, text)
  from public, anon;
grant execute on function public.restaurar_backup_estoque_atomico(jsonb, bigint, text)
  to authenticated;

-- Atualiza imediatamente o cache de rotas do PostgREST: o endpoint antigo
-- deixa de existir e o endpoint exclusivo de backup passa a ser reconhecido.
notify pgrst, 'reload schema';

-- Corrige bancos que ja receberam a migracao 004: o perfil Controle de
-- Fracionados pode gravar producoes e saidas, portanto tambem precisa criar
-- o checkpoint que protege essa sincronizacao. A leitura dos checkpoints
-- continua restrita a Master e Administrador.

drop policy if exists "checkpoints_admin_insert" on public.estoque_checkpoints;
create policy "checkpoints_admin_insert" on public.estoque_checkpoints
for insert to authenticated
with check (
  public.usuario_tem_papel(array['master','administrador','controle_fracionados'])
  and criado_por = auth.uid()
);

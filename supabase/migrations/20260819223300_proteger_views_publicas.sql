-- Corrige os avisos críticos do Security Advisor sem alterar dados operacionais.
-- As views passam a respeitar as políticas RLS das tabelas consultadas.

create or replace view public.v_auditoria_detalhada
with (security_invoker = true)
as
select
  a.id,
  a.criado_em,
  a.tabela,
  a.registro_id,
  a.operacao,
  a.usuario_id,
  coalesce(p.email, 'Sistema') as email,
  coalesce(p.papel, 'sistema') as papel
from public.auditoria a
left join public.perfis p on p.user_id = a.usuario_id;

alter view public.v_saldo_central_brutos
  set (security_invoker = true);

alter view public.v_saldo_cozinha_brutos
  set (security_invoker = true);

alter view public.v_saldo_cozinha_fracionados
  set (security_invoker = true);

revoke all on table
  public.v_auditoria_detalhada,
  public.v_saldo_central_brutos,
  public.v_saldo_cozinha_brutos,
  public.v_saldo_cozinha_fracionados
from public, anon;

grant select on table
  public.v_auditoria_detalhada,
  public.v_saldo_central_brutos,
  public.v_saldo_cozinha_brutos,
  public.v_saldo_cozinha_fracionados
to authenticated, service_role;

notify pgrst, 'reload schema';

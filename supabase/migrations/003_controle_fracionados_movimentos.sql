-- Permite ao perfil Controle de Fracionados registrar somente a produção e
-- as saídas de fracionados. Catálogos, entradas e saídas da Central continuam
-- protegidos para Master/Administrador.
do $$
declare
  tbl text;
begin
  foreach tbl in array array['producoes', 'saidas_fracionado']
  loop
    execute format('drop policy if exists "%s_write_controle_fracionados" on public.%I', tbl, tbl);
    execute format(
      'create policy "%s_write_controle_fracionados" on public.%I for all to authenticated using (public.usuario_tem_papel(array[''controle_fracionados''])) with check (public.usuario_tem_papel(array[''controle_fracionados'']))',
      tbl, tbl
    );
  end loop;
end $$;

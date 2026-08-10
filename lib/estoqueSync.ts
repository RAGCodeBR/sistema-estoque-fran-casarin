import type { RealtimeChannel, SupabaseClient, User } from "@supabase/supabase-js";

export const STORAGE_KEY = "estoqueFranCasarinDB_v1";

type LegacyDB = {
  categorias: Array<Record<string, any>>;
  locais: Array<Record<string, any>>;
  brutos: Array<Record<string, any>>;
  fracionados: Array<Record<string, any>>;
  entradasCentral: Array<Record<string, any>>;
  saidasCentral: Array<Record<string, any>>;
  producoes: Array<Record<string, any>>;
  saidasFracionado: Array<Record<string, any>>;
  ajustesEstoque: Array<Record<string, any>>;
  ajustesFracionados: Array<Record<string, any>>;
  pedidosCompra: Array<Record<string, any>>;
  itensManuaisCompra: string[];
  pedidosFeitos: Record<string, any>;
};

type PapelSistema = "master" | "administrador" | "controle_fracionados" | "visualizador";
type PapelLegado = PapelSistema | "admin" | "estoque" | "consulta";

export type PerfilSistema = {
  user_id: string;
  nome: string | null;
  email: string;
  papel: PapelSistema;
  ativo: boolean;
  criado_em?: string;
};

type ChangeDetail = {
  secao: string;
  acao: "incluiu" | "alterou" | "removeu";
  quantidade: number;
  itens: string[];
};

const emptyDB = (): LegacyDB => ({
  categorias: [],
  locais: [],
  brutos: [],
  fracionados: [],
  entradasCentral: [],
  saidasCentral: [],
  producoes: [],
  saidasFracionado: [],
  ajustesEstoque: [],
  ajustesFracionados: [],
  pedidosCompra: [],
  itensManuaisCompra: [],
  pedidosFeitos: {},
});

const byId = <T extends { id: string }>(rows: T[]) => new Map(rows.map((row) => [row.id, row]));
const byName = <T extends { nome: string }>(rows: T[]) => new Map(rows.map((row) => [row.nome, row]));
const num = (value: unknown) => Number(value ?? 0);
const clean = (value: unknown) => {
  const text = String(value ?? "").trim();
  return text.length > 0 ? text : null;
};

const movementKeys: Array<keyof Pick<LegacyDB, "entradasCentral" | "saidasCentral" | "producoes" | "saidasFracionado" | "ajustesEstoque" | "pedidosCompra">> = [
  "entradasCentral",
  "saidasCentral",
  "producoes",
  "saidasFracionado",
  "ajustesEstoque",
  "pedidosCompra",
];

function stableSnapshot(db: LegacyDB) {
  const normalize = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(normalize).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
    if (value && typeof value === "object") {
      return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, normalize(item)]));
    }
    return value ?? null;
  };
  return JSON.stringify(normalize(db));
}

function movementCount(db: LegacyDB) {
  return movementKeys.reduce((total, key) => total + (db[key]?.length ?? 0), 0);
}

function assertSafeReplacement(remote: LegacyDB, next: LegacyDB) {
  const remoteMovements = movementCount(remote);
  const nextMovements = movementCount(next);

  if (remoteMovements > 0 && nextMovements === 0) {
    throw new Error("Proteção ativada: uma cópia vazia não pode substituir o histórico de estoque. Recarregue o sistema.");
  }
  if (remoteMovements >= 10 && nextMovements < remoteMovements / 2) {
    throw new Error("Proteção ativada: esta gravação removeria muitos movimentos de estoque. Recarregue o sistema antes de continuar.");
  }
  if (remote.brutos.length > 0 && next.brutos.length === 0) {
    throw new Error("Proteção ativada: uma cópia sem produtos não pode substituir o cadastro existente.");
  }
}

function assertValidMovements(db: LegacyDB) {
  const requiredPositive: Array<[keyof LegacyDB, string[]]> = [
    ["entradasCentral", ["quantidade"]],
    ["saidasCentral", ["quantidade"]],
    ["saidasFracionado", ["quantidade"]],
    ["producoes", ["quantidadeUtilizada", "quantidadeProduzida"]],
    ["pedidosCompra", ["quantidadePedida"]],
  ];
  for (const [section, fields] of requiredPositive) {
    for (const item of (db[section] as Array<Record<string, unknown>>) ?? []) {
      if (fields.some((field) => !Number.isFinite(Number(item[field])) || Number(item[field]) <= 0)) {
        throw new Error(`Quantidade inválida em ${String(section)}. Informe um valor maior que zero antes de salvar.`);
      }
    }
  }
}

async function createCheckpoint(supabase: SupabaseClient, user: User, db: LegacyDB) {
  const { error } = await supabase.from("estoque_checkpoints").insert({
    dados: db,
    total_movimentos: movementCount(db),
    criado_por: user.id,
  });
  if (error) throw new Error(`Não foi possível criar o ponto de recuperação: ${error.message}`);
}

async function selectAll<T>(supabase: SupabaseClient, table: string, columns = "*") {
  const { data, error } = await supabase.from(table).select(columns).order("criado_em", { ascending: true });
  if (error) throw error;
  return (data ?? []) as T[];
}

export async function loadLegacyDB(supabase: SupabaseClient): Promise<LegacyDB> {
  const [
    categorias,
    locais,
    brutos,
    fracionados,
    entradas,
    saidas,
    producoes,
    saidasFracionado,
    ajustes,
    ajustesFracionados,
    pedidos,
    itensManuais,
  ] = await Promise.all([
    selectAll<any>(supabase, "categorias"),
    selectAll<any>(supabase, "locais"),
    selectAll<any>(supabase, "produtos_brutos"),
    selectAll<any>(supabase, "produtos_fracionados"),
    selectAll<any>(supabase, "entradas_central"),
    selectAll<any>(supabase, "saidas_central"),
    selectAll<any>(supabase, "producoes"),
    selectAll<any>(supabase, "saidas_fracionado"),
    selectAll<any>(supabase, "ajustes_estoque"),
    selectAll<any>(supabase, "ajustes_fracionados"),
    selectAll<any>(supabase, "pedidos_compra"),
    selectAll<any>(supabase, "itens_manuais_compra"),
  ]);

  const categoriaPorId = byId(categorias);
  const localPorId = byId(locais);
  const brutoPorId = byId(brutos);
  const fracionadoPorId = byId(fracionados);

  return {
    ...emptyDB(),
    categorias: categorias.map((c) => ({ nome: c.nome })),
    locais: locais.map((l) => ({ nome: l.nome, tipo: l.tipo, responsavel: l.responsavel ?? "" })),
    brutos: brutos.map((p) => ({
      nome: p.nome,
      categoria: categoriaPorId.get(p.categoria_id)?.nome ?? "Outros",
      unidade: p.unidade,
      estoqueMinimo: num(p.estoque_minimo),
      fornecedor: p.fornecedor ?? "",
      precoMedio: num(p.preco_medio),
      validadeDias: num(p.validade_dias),
    })),
    fracionados: fracionados.map((p) => ({
      nome: p.nome,
      categoria: categoriaPorId.get(p.categoria_id)?.nome ?? "Outros",
      unidade: p.unidade,
      origem: brutoPorId.get(p.origem_bruto_id)?.nome ?? "",
      rendimento: num(p.rendimento_percent),
      estoqueMinimo: num(p.estoque_minimo),
      validadeDias: num(p.validade_dias),
    })),
    entradasCentral: entradas.map((e) => ({
      data: e.data,
      nf: e.nf ?? "",
      produto: brutoPorId.get(e.produto_bruto_id)?.nome ?? "",
      fornecedor: e.fornecedor ?? "",
      quantidade: num(e.quantidade),
      precoUnitario: num(e.preco_unitario),
      validade: e.validade ?? "",
    })),
    saidasCentral: saidas.map((s) => ({
      data: s.data,
      documento: s.documento ?? "",
      produto: brutoPorId.get(s.produto_bruto_id)?.nome ?? "",
      destino: localPorId.get(s.destino_local_id)?.nome ?? "",
      quantidade: num(s.quantidade),
    })),
    producoes: producoes.map((p) => ({
      data: p.data,
      produtoBruto: brutoPorId.get(p.produto_bruto_id)?.nome ?? "",
      quantidadeUtilizada: num(p.quantidade_utilizada),
      produtoFracionado: fracionadoPorId.get(p.produto_fracionado_id)?.nome ?? "",
      quantidadeProduzida: num(p.quantidade_produzida),
    })),
    saidasFracionado: saidasFracionado.map((s) => ({
      data: s.data,
      documento: s.documento ?? "",
      produto: fracionadoPorId.get(s.produto_fracionado_id)?.nome ?? "",
      destino: localPorId.get(s.destino_local_id)?.nome ?? "",
      quantidade: num(s.quantidade),
    })),
    ajustesEstoque: ajustes.map((a) => ({
      data: a.data,
      produto: brutoPorId.get(a.produto_bruto_id)?.nome ?? "",
      saldoAnterior: num(a.saldo_anterior),
      novoSaldo: num(a.novo_saldo),
      diferenca: num(a.diferenca),
      motivo: a.motivo ?? "",
      responsavel: a.responsavel ?? "",
    })),
    ajustesFracionados: ajustesFracionados.map((a) => ({
      data: a.data,
      produto: fracionadoPorId.get(a.produto_fracionado_id)?.nome ?? "",
      saldoAnterior: num(a.saldo_anterior),
      novoSaldo: num(a.novo_saldo),
      diferenca: num(a.diferenca),
      motivo: a.motivo ?? "",
      responsavel: a.responsavel ?? "",
    })),
    pedidosCompra: pedidos.map((p) => ({
      data: p.data,
      produto: brutoPorId.get(p.produto_bruto_id)?.nome ?? "",
      fornecedor: p.fornecedor ?? "",
      quantidadePedida: num(p.quantidade_pedida),
      precoEstimado: num(p.preco_estimado),
      status: p.status ?? "pendente",
      dataRecebimento: p.data_recebimento ?? "",
      quantidadeRecebida: p.quantidade_recebida == null ? undefined : num(p.quantidade_recebida),
      precoRecebido: p.preco_recebido == null ? undefined : num(p.preco_recebido),
    })),
    itensManuaisCompra: itensManuais
      .map((item) => brutoPorId.get(item.produto_bruto_id)?.nome)
      .filter(Boolean) as string[],
  };
}

export async function getCurrentPerfil(supabase: SupabaseClient, user: User): Promise<PerfilSistema> {
  const { data, error } = await supabase
    .from("perfis")
    .select("user_id,nome,email,papel,ativo,criado_em")
    .eq("user_id", user.id)
    .single();
  if (error) throw error;
  return normalizePerfil(data as PerfilSistema);
}

export async function listPerfis(supabase: SupabaseClient): Promise<PerfilSistema[]> {
  const { data, error } = await supabase
    .from("perfis")
    .select("user_id,nome,email,papel,ativo,criado_em")
    .order("criado_em", { ascending: true });
  if (error) throw error;
  return ((data ?? []) as PerfilSistema[]).map(normalizePerfil);
}

export async function createPerfilUser(
  supabase: SupabaseClient,
  input: { email: string; senha: string; nome?: string; papel: "administrador" | "controle_fracionados" | "visualizador" },
) {
  const { data, error } = await supabase.rpc("criar_usuario_sistema", {
    p_email: input.email,
    p_senha: input.senha,
    p_nome: input.nome || input.email,
    p_papel: input.papel,
  });
  if (error) throw error;
  const { error: logError } = await supabase.from("logs_sistema").insert({
    resumo: `Criou acesso de ${input.email}`,
    detalhes: [
      {
        secao: "Acessos",
        acao: "incluiu",
        quantidade: 1,
        itens: [`${input.email} - ${input.papel}`],
      },
    ],
  });
  if (logError) throw logError;
  return data;
}

export async function updatePerfilUser(
  supabase: SupabaseClient,
  input: { user_id: string; nome?: string; papel: "administrador" | "controle_fracionados" | "visualizador"; ativo: boolean },
) {
  const { error } = await supabase.rpc("atualizar_acesso_sistema", {
    p_user_id: input.user_id,
    p_nome: input.nome || null,
    p_papel: input.papel,
    p_ativo: input.ativo,
  });
  if (error) throw error;
}

export async function deletePerfilUser(supabase: SupabaseClient, input: { user_id: string; motivo?: string }) {
  const { data, error } = await supabase.rpc("excluir_acesso_sistema", {
    p_user_id: input.user_id,
    p_motivo: input.motivo || "Exclusao pelo Master",
  });
  if (error) throw error;
  return data;
}

export async function resetPerfilPassword(supabase: SupabaseClient, input: { user_id: string; senha: string }) {
  const { data, error } = await supabase.rpc("redefinir_senha_acesso", {
    p_user_id: input.user_id,
    p_senha: input.senha,
  });
  if (error) throw error;
  return data;
}

export async function listAuditLogs(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from("logs_sistema")
    .select("criado_em,email,papel,resumo,detalhes")
    .order("criado_em", { ascending: false })
    .limit(40);
  if (error) throw error;
  return data ?? [];
}

function normalizePerfil(row: Omit<PerfilSistema, "papel"> & { papel: PapelLegado }): PerfilSistema {
  const papel = row.papel === "admin" ? "master" : row.papel === "estoque" ? "administrador" : row.papel === "consulta" ? "visualizador" : row.papel;
  return { ...row, papel };
}

async function deleteAll(supabase: SupabaseClient, table: string) {
  const { error } = await supabase.from(table).delete().not("id", "is", null);
  if (error) throw error;
}

async function deleteMissingByName(supabase: SupabaseClient, table: string, names: string[]) {
  let query = supabase.from(table).delete();
  if (names.length > 0) {
    query = query.not("nome", "in", `(${names.map((name) => `"${name.replace(/"/g, '""')}"`).join(",")})`);
  } else {
    query = query.not("id", "is", null);
  }
  const { error } = await query;
  if (error) throw error;
}

async function upsertReturning<T>(supabase: SupabaseClient, table: string, rows: Record<string, any>[], onConflict: string) {
  if (rows.length === 0) return [] as T[];
  const { data, error } = await supabase.from(table).upsert(rows, { onConflict }).select();
  if (error) throw error;
  return (data ?? []) as T[];
}

export type SyncScope = "full" | "fracionados";

async function saveFracionadosMovements(supabase: SupabaseClient, user: User, db: LegacyDB) {
  // O Controle de Fracionados só pode registrar os movimentos da sua área.
  // Não sincronizamos catálogo, central ou compras com esse perfil, pois isso
  // exigiria permissões amplas e podia fazer a gravação falhar por RLS.
  const [brutos, fracionados, locais] = await Promise.all([
    selectAll<any>(supabase, "produtos_brutos", "id,nome"),
    selectAll<any>(supabase, "produtos_fracionados", "id,nome"),
    selectAll<any>(supabase, "locais", "id,nome"),
  ]);
  const brutoMap = byName(brutos);
  const fracionadoMap = byName(fracionados);
  const localMap = byName(locais);

  await Promise.all([
    deleteAll(supabase, "saidas_fracionado"),
    deleteAll(supabase, "producoes"),
  ]);

  await insertRows(supabase, "producoes", (db.producoes ?? []).map((p) => ({
    data: p.data,
    produto_bruto_id: brutoMap.get(p.produtoBruto)?.id,
    quantidade_utilizada: num(p.quantidadeUtilizada),
    produto_fracionado_id: fracionadoMap.get(p.produtoFracionado)?.id,
    quantidade_produzida: num(p.quantidadeProduzida),
    criado_por: user.id,
  })));
  await insertRows(supabase, "saidas_fracionado", (db.saidasFracionado ?? []).map((s) => ({
    data: s.data,
    documento: clean(s.documento),
    produto_fracionado_id: fracionadoMap.get(s.produto)?.id,
    destino_local_id: localMap.get(s.destino)?.id,
    quantidade: num(s.quantidade),
    criado_por: user.id,
  })));
}

export async function saveLegacyDB(supabase: SupabaseClient, user: User, db: LegacyDB, scope: SyncScope = "full") {
  if (scope === "fracionados") {
    await saveFracionadosMovements(supabase, user, db);
    return;
  }
  const categoriasNomes = new Set<string>();
  db.categorias?.forEach((c) => c.nome && categoriasNomes.add(c.nome));
  db.brutos?.forEach((p) => p.categoria && categoriasNomes.add(p.categoria));
  db.fracionados?.forEach((p) => p.categoria && categoriasNomes.add(p.categoria));
  if (categoriasNomes.size === 0) categoriasNomes.add("Outros");

  await Promise.all([
    deleteAll(supabase, "itens_manuais_compra"),
    deleteAll(supabase, "pedidos_compra"),
    deleteAll(supabase, "ajustes_estoque"),
    deleteAll(supabase, "saidas_fracionado"),
    deleteAll(supabase, "producoes"),
    deleteAll(supabase, "saidas_central"),
    deleteAll(supabase, "entradas_central"),
  ]);

  await deleteMissingByName(supabase, "produtos_fracionados", (db.fracionados ?? []).map((p) => p.nome).filter(Boolean));
  await deleteMissingByName(supabase, "produtos_brutos", (db.brutos ?? []).map((p) => p.nome).filter(Boolean));
  await deleteMissingByName(supabase, "locais", (db.locais ?? []).map((l) => l.nome).filter(Boolean));
  await deleteMissingByName(supabase, "categorias", [...categoriasNomes]);

  const categorias = await upsertReturning<any>(
    supabase,
    "categorias",
    [...categoriasNomes].map((nome) => ({ nome })),
    "nome",
  );
  const categoriaMap = byName(categorias);

  const locais = await upsertReturning<any>(
    supabase,
    "locais",
    (db.locais ?? []).map((l) => ({
      nome: l.nome,
      tipo: l.tipo || "Consumidor",
      responsavel: clean(l.responsavel),
    })),
    "nome",
  );
  const localMap = byName(locais);

  const brutos = await upsertReturning<any>(
    supabase,
    "produtos_brutos",
    (db.brutos ?? []).map((p) => ({
      nome: p.nome,
      categoria_id: categoriaMap.get(p.categoria)?.id ?? null,
      unidade: p.unidade || "UN",
      estoque_minimo: num(p.estoqueMinimo),
      fornecedor: clean(p.fornecedor),
      preco_medio: num(p.precoMedio),
      validade_dias: num(p.validadeDias),
      ativo: true,
    })),
    "nome",
  );
  const brutoMap = byName(brutos);

  const fracionados = await upsertReturning<any>(
    supabase,
    "produtos_fracionados",
    (db.fracionados ?? []).map((p) => ({
      nome: p.nome,
      categoria_id: categoriaMap.get(p.categoria)?.id ?? null,
      unidade: p.unidade || "UN",
      origem_bruto_id: brutoMap.get(p.origem)?.id ?? null,
      rendimento_percent: num(p.rendimento) || 100,
      estoque_minimo: num(p.estoqueMinimo),
      validade_dias: num(p.validadeDias),
      ativo: true,
    })),
    "nome",
  );
  const fracionadoMap = byName(fracionados);

  await insertRows(supabase, "entradas_central", (db.entradasCentral ?? []).map((e) => ({
    data: e.data,
    nf: clean(e.nf),
    produto_bruto_id: brutoMap.get(e.produto)?.id,
    fornecedor: clean(e.fornecedor),
    quantidade: num(e.quantidade),
    preco_unitario: num(e.precoUnitario),
    validade: clean(e.validade),
    criado_por: user.id,
  })));
  await insertRows(supabase, "saidas_central", (db.saidasCentral ?? []).map((s) => ({
    data: s.data,
    documento: clean(s.documento),
    produto_bruto_id: brutoMap.get(s.produto)?.id,
    destino_local_id: localMap.get(s.destino)?.id,
    quantidade: num(s.quantidade),
    criado_por: user.id,
  })));
  await insertRows(supabase, "producoes", (db.producoes ?? []).map((p) => ({
    data: p.data,
    produto_bruto_id: brutoMap.get(p.produtoBruto)?.id,
    quantidade_utilizada: num(p.quantidadeUtilizada),
    produto_fracionado_id: fracionadoMap.get(p.produtoFracionado)?.id,
    quantidade_produzida: num(p.quantidadeProduzida),
    criado_por: user.id,
  })));
  await insertRows(supabase, "saidas_fracionado", (db.saidasFracionado ?? []).map((s) => ({
    data: s.data,
    documento: clean(s.documento),
    produto_fracionado_id: fracionadoMap.get(s.produto)?.id,
    destino_local_id: localMap.get(s.destino)?.id,
    quantidade: num(s.quantidade),
    criado_por: user.id,
  })));
  await insertRows(supabase, "ajustes_estoque", (db.ajustesEstoque ?? []).map((a) => ({
    data: a.data,
    produto_bruto_id: brutoMap.get(a.produto)?.id,
    saldo_anterior: num(a.saldoAnterior),
    novo_saldo: num(a.novoSaldo),
    diferenca: num(a.diferenca),
    motivo: clean(a.motivo) ?? "Ajuste",
    responsavel: clean(a.responsavel) ?? user.email ?? "Sistema",
    criado_por: user.id,
  })));
  await insertRows(supabase, "pedidos_compra", (db.pedidosCompra ?? []).map((p) => ({
    data: p.data,
    produto_bruto_id: brutoMap.get(p.produto)?.id,
    fornecedor: clean(p.fornecedor),
    quantidade_pedida: num(p.quantidadePedida),
    preco_estimado: num(p.precoEstimado),
    status: p.status || "pendente",
    data_recebimento: clean(p.dataRecebimento),
    quantidade_recebida: p.quantidadeRecebida == null ? null : num(p.quantidadeRecebida),
    preco_recebido: p.precoRecebido == null ? null : num(p.precoRecebido),
    criado_por: user.id,
  })));
  await insertRows(supabase, "itens_manuais_compra", (db.itensManuaisCompra ?? []).map((nome) => ({
    produto_bruto_id: brutoMap.get(nome)?.id,
    criado_por: user.id,
  })));
}

async function insertRows(supabase: SupabaseClient, table: string, rows: Record<string, any>[]) {
  const invalid = rows.find((row) => Object.values(row).some((value) => value === undefined));
  if (invalid) throw new Error(`Dados incompletos para salvar em ${table}. Nenhum registro foi gravado.`);

  const quantityFields: Record<string, string[]> = {
    entradas_central: ["quantidade"],
    saidas_central: ["quantidade"],
    saidas_fracionado: ["quantidade"],
    producoes: ["quantidade_utilizada", "quantidade_produzida"],
    pedidos_compra: ["quantidade_pedida"],
  };
  const invalidQuantity = (quantityFields[table] ?? []).some((field) => rows.some((row) => !Number.isFinite(Number(row[field])) || Number(row[field]) <= 0));
  if (invalidQuantity) throw new Error(`Quantidade inválida em ${table}. Informe um valor maior que zero.`);

  if (rows.length === 0) return;
  const { error } = await supabase.from(table).insert(rows);
  if (error) throw error;
}

function cloneDB(db: LegacyDB): LegacyDB {
  return JSON.parse(JSON.stringify(db ?? emptyDB())) as LegacyDB;
}

function compactValue(value: unknown) {
  if (value == null || value === "") return "";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  return String(value);
}

function itemLabel(item: Record<string, any>, fallback: string) {
  return (
    compactValue(item.nome) ||
    compactValue(item.produto) ||
    compactValue(item.produtoFracionado) ||
    compactValue(item.produtoBruto) ||
    compactValue(item.documento) ||
    compactValue(item.nf) ||
    fallback
  );
}

function stableKey(item: Record<string, any>, index: number, fields: string[]) {
  const key = fields.map((field) => compactValue(item[field])).filter(Boolean).join(" | ");
  return key || `linha ${index + 1}`;
}

function changedFields(before: Record<string, any>, after: Record<string, any>) {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  return [...keys].filter((key) => JSON.stringify(before[key] ?? "") !== JSON.stringify(after[key] ?? ""));
}

function pushDetail(details: ChangeDetail[], secao: string, acao: ChangeDetail["acao"], itens: string[]) {
  if (itens.length === 0) return;
  details.push({ secao, acao, quantidade: itens.length, itens: itens.slice(0, 8) });
}

function diffArraySection(
  details: ChangeDetail[],
  beforeRows: Array<Record<string, any>> = [],
  afterRows: Array<Record<string, any>> = [],
  secao: string,
  keyFields: string[],
) {
  const beforeMap = new Map(beforeRows.map((item, index) => [stableKey(item, index, keyFields), item]));
  const afterMap = new Map(afterRows.map((item, index) => [stableKey(item, index, keyFields), item]));
  const added: string[] = [];
  const removed: string[] = [];
  const updated: string[] = [];

  afterMap.forEach((item, key) => {
    const previous = beforeMap.get(key);
    if (!previous) {
      added.push(itemLabel(item, key));
      return;
    }
    const fields = changedFields(previous, item);
    if (fields.length > 0) updated.push(`${itemLabel(item, key)} (${fields.slice(0, 4).join(", ")})`);
  });

  beforeMap.forEach((item, key) => {
    if (!afterMap.has(key)) removed.push(itemLabel(item, key));
  });

  pushDetail(details, secao, "incluiu", added);
  pushDetail(details, secao, "alterou", updated);
  pushDetail(details, secao, "removeu", removed);
}

function buildChangeDetails(before: LegacyDB, after: LegacyDB): ChangeDetail[] {
  const details: ChangeDetail[] = [];
  diffArraySection(details, before.categorias, after.categorias, "Categorias", ["nome"]);
  diffArraySection(details, before.locais, after.locais, "Locais", ["nome"]);
  diffArraySection(details, before.brutos, after.brutos, "Produtos brutos", ["nome"]);
  diffArraySection(details, before.fracionados, after.fracionados, "Produtos fracionados", ["nome"]);
  diffArraySection(details, before.entradasCentral, after.entradasCentral, "Entrada na central", ["data", "nf", "produto"]);
  diffArraySection(details, before.saidasCentral, after.saidasCentral, "Saida da central", ["data", "documento", "produto", "destino"]);
  diffArraySection(details, before.producoes, after.producoes, "Producao de fracionados", ["data", "produtoBruto", "produtoFracionado"]);
  diffArraySection(details, before.saidasFracionado, after.saidasFracionado, "Saida de fracionados", ["data", "documento", "produto", "destino"]);
  diffArraySection(details, before.ajustesEstoque, after.ajustesEstoque, "Ajuste de estoque", ["data", "produto", "motivo"]);
  diffArraySection(details, before.pedidosCompra, after.pedidosCompra, "Sugestao/Pedidos", ["data", "produto", "fornecedor", "status"]);
  diffArraySection(
    details,
    (before.itensManuaisCompra ?? []).map((nome) => ({ nome })),
    (after.itensManuaisCompra ?? []).map((nome) => ({ nome })),
    "Itens manuais de compra",
    ["nome"],
  );
  return details;
}

async function insertSystemLog(supabase: SupabaseClient, user: User, before: LegacyDB, after: LegacyDB) {
  const detalhes = buildChangeDetails(before, after);
  if (detalhes.length === 0) return;
  const resumo = detalhes
    .slice(0, 4)
    .map((item) => `${item.acao} ${item.quantidade} em ${item.secao}`)
    .join("; ");
  const { error } = await supabase.from("logs_sistema").insert({
    usuario_id: user.id,
    email: user.email,
    resumo,
    detalhes,
  });
  if (error) throw error;
}

export function installCloudSync(
  supabase: SupabaseClient,
  user: User,
  onRemoteChange: () => void,
  scope: SyncScope = "full",
): RealtimeChannel {
  let saving = false;
  let saveRevision = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let remoteTimer: ReturnType<typeof setTimeout> | undefined;
  let lastSavedDB: LegacyDB = (() => {
    try {
      return cloneDB(JSON.parse(window.localStorage?.getItem(STORAGE_KEY) || "null") || emptyDB());
    } catch {
      return emptyDB();
    }
  })();

  (window as any).__estoqueCloudSync = {
    save(db: LegacyDB, options?: { immediate?: boolean }) {
      window.localStorage?.setItem(STORAGE_KEY, JSON.stringify(db));
      clearTimeout(timer);
      window.dispatchEvent(new CustomEvent("estoque-cloud-status", { detail: { status: "salvando" } }));
      const revision = ++saveRevision;
      timer = setTimeout(async () => {
        timer = undefined;
        saving = true;
        let recoveryDB: LegacyDB | undefined;
        try {
          const nextDB = cloneDB(db);
          const beforeDB = cloneDB(lastSavedDB);
          const remoteDB = await loadLegacyDB(supabase);

          // Nunca permita que uma aba antiga sobrescreva alterações feitas por
          // outra pessoa. O usuário precisa recarregar e trabalhar sobre a
          // versão atual do banco.
          if (stableSnapshot(remoteDB) !== stableSnapshot(beforeDB)) {
            throw new Error("O estoque foi alterado em outra sessão. Recarregue a página antes de salvar para não sobrescrever dados.");
          }
          assertSafeReplacement(remoteDB, nextDB);
          assertValidMovements(nextDB);
          await createCheckpoint(supabase, user, remoteDB);
          recoveryDB = remoteDB;
          await saveLegacyDB(supabase, user, nextDB, scope);
          try {
            await insertSystemLog(supabase, user, beforeDB, nextDB);
          } catch (logError) {
            console.warn("Nao foi possivel registrar o log resumido.", logError);
          }
          lastSavedDB = cloneDB(nextDB);
          window.dispatchEvent(new CustomEvent("estoque-cloud-status", { detail: { status: "salvo" } }));
        } catch (error) {
          console.error("Erro ao salvar estoque no Supabase", error);
          let message = error instanceof Error ? error.message : "Verifique permissao do usuario ou dados obrigatorios.";
          if (recoveryDB) {
            try {
              await saveLegacyDB(supabase, user, recoveryDB, scope);
              lastSavedDB = cloneDB(recoveryDB);
              window.localStorage?.setItem(STORAGE_KEY, JSON.stringify(recoveryDB));
              message = `${message} O ponto de recuperação foi restaurado automaticamente.`;
            } catch (restoreError) {
              console.error("Erro ao restaurar o ponto de recuperação", restoreError);
              message = `${message} A gravação foi interrompida; o checkpoint foi preservado para restauração.`;
            }
          }
          window.dispatchEvent(new CustomEvent("estoque-cloud-status", { detail: { status: "erro", message } }));
        } finally {
          setTimeout(() => {
            // A nova edição já possui um agendamento próprio. Não libere a
            // janela de sincronização de uma gravação mais recente.
            if (revision === saveRevision) saving = false;
          }, 3000);
        }
      }, options?.immediate ? 0 : 900);
    },
    isSaving() {
      return saving || timer !== undefined;
    },
  };

  supabase
    .getChannels()
    .filter((channel) => channel.topic.startsWith("realtime:estoque-fran-sync"))
    .forEach((channel) => supabase.removeChannel(channel));

  const channelName =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? `estoque-fran-sync-${crypto.randomUUID()}`
      : `estoque-fran-sync-${Date.now()}-${Math.random().toString(16).slice(2)}`;

  return supabase
    .channel(channelName)
    .on("postgres_changes", { event: "*", schema: "public" }, () => {
      if (saving) return;
      clearTimeout(remoteTimer);
      // Uma alteração no legado ainda grava várias tabelas. Esperar a última
      // notificação evita que outro usuário recarregue um banco parcialmente
      // sincronizado — a principal causa da sugestão de pedidos parecer parada.
      remoteTimer = setTimeout(onRemoteChange, 2200);
    })
    .subscribe();
}

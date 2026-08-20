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
const rowMeta = (row: Record<string, any>) => ({
  _id: row.id,
  _updatedAt: row.atualizado_em,
});

const movementKeys: Array<keyof Pick<LegacyDB, "entradasCentral" | "saidasCentral" | "producoes" | "saidasFracionado" | "ajustesEstoque" | "ajustesFracionados" | "pedidosCompra">> = [
  "entradasCentral",
  "saidasCentral",
  "producoes",
  "saidasFracionado",
  "ajustesEstoque",
  "ajustesFracionados",
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

type ArraySection = Exclude<keyof LegacyDB, "itensManuaisCompra" | "pedidosFeitos">;

const mergeKeyFields: Record<ArraySection, string[]> = {
  categorias: ["nome"],
  locais: ["nome"],
  brutos: ["nome"],
  fracionados: ["nome"],
  entradasCentral: ["data", "nf", "produto", "fornecedor", "validade"],
  saidasCentral: ["data", "documento", "produto", "destino"],
  producoes: ["data", "produtoBruto", "produtoFracionado"],
  saidasFracionado: ["data", "documento", "produto", "destino"],
  ajustesEstoque: ["data", "produto", "motivo", "responsavel"],
  ajustesFracionados: ["data", "produto", "motivo", "responsavel"],
  pedidosCompra: ["data", "produto", "fornecedor"],
};

function sameData(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function recordMap(rows: Array<Record<string, any>>, fields: string[]) {
  const occurrences = new Map<string, number>();
  const map = new Map<string, Record<string, any>>();
  rows.forEach((row, index) => {
    const baseKey = fields.map((field) => compactValue(row[field])).join("\u001f") || `linha ${index + 1}`;
    const occurrence = (occurrences.get(baseKey) ?? 0) + 1;
    occurrences.set(baseKey, occurrence);
    map.set(`${baseKey}\u001e${occurrence}`, row);
  });
  return map;
}

// O app legado salva o estoque inteiro de uma vez. Para não deixar uma aba
// antiga apagar o trabalho feito por outra pessoa, aplicamos somente o delta
// local sobre a cópia mais recente do banco. Quando as duas pessoas mexem no
// mesmo registro, a última gravação explícita prevalece.
function mergeArrayChanges(
  baseRows: Array<Record<string, any>> = [],
  localRows: Array<Record<string, any>> = [],
  remoteRows: Array<Record<string, any>> = [],
  fields: string[],
  preserveConcurrentAdds = false,
) {
  const base = recordMap(baseRows, fields);
  const local = recordMap(localRows, fields);
  const merged = recordMap(remoteRows, fields);

  base.forEach((baseRow, key) => {
    const localRow = local.get(key);
    if (sameData(baseRow, localRow)) return;
    if (localRow === undefined) merged.delete(key);
    else merged.set(key, localRow);
  });
  local.forEach((localRow, key) => {
    if (base.has(key)) return;
    if (!preserveConcurrentAdds || !merged.has(key)) {
      merged.set(key, localRow);
      return;
    }
    // Movimentos não têm um identificador estável no formato legado. Se duas
    // pessoas incluírem registros semelhantes ao mesmo tempo, os dois devem
    // continuar existindo, em vez de uma inclusão esconder a outra.
    let concurrentKey = `${key}\u001dlocal`;
    let sequence = 2;
    while (merged.has(concurrentKey)) concurrentKey = `${key}\u001dlocal-${sequence++}`;
    merged.set(concurrentKey, localRow);
  });
  return [...merged.values()];
}

function mergeObjectChanges(base: Record<string, any>, local: Record<string, any>, remote: Record<string, any>) {
  const merged = { ...remote };
  const keys = new Set([...Object.keys(base ?? {}), ...Object.keys(local ?? {})]);
  keys.forEach((key) => {
    if (sameData(base?.[key], local?.[key])) return;
    if (!(key in (local ?? {}))) delete merged[key];
    else merged[key] = local[key];
  });
  return merged;
}

function mergeConcurrentChanges(base: LegacyDB, local: LegacyDB, remote: LegacyDB, scope: SyncScope): LegacyDB {
  const merged = cloneDB(remote);
  const sections: ArraySection[] = scope === "fracionados"
    ? ["producoes", "saidasFracionado"]
    : scope === "controle_fracionados_ampliado"
      ? ["fracionados", "saidasCentral", "producoes", "saidasFracionado", "ajustesFracionados"]
    : Object.keys(mergeKeyFields) as ArraySection[];

  sections.forEach((section) => {
    const isMovement = ["entradasCentral", "saidasCentral", "producoes", "saidasFracionado", "ajustesEstoque", "ajustesFracionados", "pedidosCompra"].includes(section);
    merged[section] = mergeArrayChanges(base[section], local[section], remote[section], mergeKeyFields[section], isMovement);
  });
  if (scope === "full") {
    const manual = mergeArrayChanges(
      (base.itensManuaisCompra ?? []).map((nome) => ({ nome })),
      (local.itensManuaisCompra ?? []).map((nome) => ({ nome })),
      (remote.itensManuaisCompra ?? []).map((nome) => ({ nome })),
      ["nome"],
    );
    merged.itensManuaisCompra = manual.map((item) => String(item.nome));
    merged.pedidosFeitos = mergeObjectChanges(base.pedidosFeitos ?? {}, local.pedidosFeitos ?? {}, remote.pedidosFeitos ?? {});
  }
  return merged;
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

async function selectAll<T>(supabase: SupabaseClient, table: string, columns = "*", somenteAtivos = false) {
  let query = supabase.from(table).select(columns).order("criado_em", { ascending: true });
  if (somenteAtivos) query = query.eq("ativo", true);
  const { data, error } = await query;
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
    categorias: categorias.filter((c) => c.ativo !== false).map((c) => ({ ...rowMeta(c), nome: c.nome })),
    locais: locais.filter((l) => l.ativo !== false).map((l) => ({ ...rowMeta(l), nome: l.nome, tipo: l.tipo, responsavel: l.responsavel ?? "" })),
    brutos: brutos.filter((p) => p.ativo !== false).map((p) => ({
      ...rowMeta(p),
      nome: p.nome,
      categoria: categoriaPorId.get(p.categoria_id)?.nome ?? "Outros",
      tipoProduto: p.tipo_produto ?? "Bruto",
      unidade: p.unidade,
      estoqueMinimo: num(p.estoque_minimo),
      fornecedor: p.fornecedor ?? "",
      precoMedio: num(p.preco_medio),
      validadeDias: num(p.validade_dias),
    })),
    fracionados: fracionados.filter((p) => p.ativo !== false).map((p) => ({
      ...rowMeta(p),
      nome: p.nome,
      categoria: categoriaPorId.get(p.categoria_id)?.nome ?? "Outros",
      tipoProduto: p.tipo_produto ?? "Fracionado",
      unidade: p.unidade,
      origem: brutoPorId.get(p.origem_bruto_id)?.nome ?? "",
      rendimento: num(p.rendimento_percent),
      estoqueMinimo: num(p.estoque_minimo),
      fornecedor: p.fornecedor ?? "",
      precoMedio: num(p.preco_medio),
      validadeDias: num(p.validade_dias),
    })),
    entradasCentral: entradas.map((e) => ({
      ...rowMeta(e),
      data: e.data,
      nf: e.nf ?? "",
      produto: brutoPorId.get(e.produto_bruto_id)?.nome ?? "",
      fornecedor: e.fornecedor ?? "",
      quantidade: num(e.quantidade),
      precoUnitario: num(e.preco_unitario),
      validade: e.validade ?? "",
    })),
    saidasCentral: saidas.map((s) => ({
      ...rowMeta(s),
      data: s.data,
      documento: s.documento ?? "",
      produto: brutoPorId.get(s.produto_bruto_id)?.nome ?? "",
      destino: localPorId.get(s.destino_local_id)?.nome ?? "",
      quantidade: num(s.quantidade),
    })),
    producoes: producoes.map((p) => ({
      ...rowMeta(p),
      data: p.data,
      produtoBruto: brutoPorId.get(p.produto_bruto_id)?.nome ?? "",
      quantidadeUtilizada: num(p.quantidade_utilizada),
      produtoFracionado: fracionadoPorId.get(p.produto_fracionado_id)?.nome ?? "",
      quantidadeProduzida: num(p.quantidade_produzida),
    })),
    saidasFracionado: saidasFracionado.map((s) => ({
      ...rowMeta(s),
      data: s.data,
      documento: s.documento ?? "",
      produto: fracionadoPorId.get(s.produto_fracionado_id)?.nome ?? "",
      destino: localPorId.get(s.destino_local_id)?.nome ?? "",
      quantidade: num(s.quantidade),
    })),
    ajustesEstoque: [...ajustes].sort((a, b) => Number(a.ordem ?? 0) - Number(b.ordem ?? 0)).map((a) => ({
      ...rowMeta(a),
      data: a.data,
      produto: brutoPorId.get(a.produto_bruto_id)?.nome ?? "",
      saldoAnterior: num(a.saldo_anterior),
      novoSaldo: num(a.novo_saldo),
      diferenca: num(a.diferenca),
      motivo: a.motivo ?? "",
      responsavel: a.responsavel ?? "",
      ordem: Number(a.ordem ?? 0),
    })),
    ajustesFracionados: [...ajustesFracionados].sort((a, b) => Number(a.ordem ?? 0) - Number(b.ordem ?? 0)).map((a) => ({
      ...rowMeta(a),
      data: a.data,
      produto: fracionadoPorId.get(a.produto_fracionado_id)?.nome ?? "",
      saldoAnterior: num(a.saldo_anterior),
      novoSaldo: num(a.novo_saldo),
      diferenca: num(a.diferenca),
      motivo: a.motivo ?? "",
      responsavel: a.responsavel ?? "",
      ordem: Number(a.ordem ?? 0),
    })),
    pedidosCompra: pedidos.map((p) => ({
      ...rowMeta(p),
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

export async function loadStockRevision(supabase: SupabaseClient): Promise<number> {
  const { data, error } = await supabase.rpc("obter_revisao_estoque");
  if (error) throw error;
  return Number(data ?? 0);
}

// loadLegacyDB consulta várias tabelas. A revisão antes e depois da leitura
// garante que não montaremos uma cópia com parte do banco antes e parte depois
// da gravação de outro usuário.
export async function loadConsistentLegacyState(supabase: SupabaseClient): Promise<{ db: LegacyDB; revision: number }> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const revisionBefore = await loadStockRevision(supabase);
    const db = await loadLegacyDB(supabase);
    const revisionAfter = await loadStockRevision(supabase);
    if (revisionBefore === revisionAfter) return { db, revision: revisionAfter };
  }
  throw new Error("O estoque está sendo atualizado por outro usuário. Tente novamente em alguns segundos.");
}

function atomicPayload(db: LegacyDB) {
  return {
    categorias: (db.categorias ?? []).map((x) => ({ nome: x.nome })),
    locais: (db.locais ?? []).map((x) => ({ nome: x.nome, tipo: x.tipo, responsavel: x.responsavel })),
    brutos: (db.brutos ?? []).map((x) => ({
      nome: x.nome, categoria: x.categoria, tipo_produto: x.tipoProduto ?? "Bruto", unidade: x.unidade, estoque_minimo: num(x.estoqueMinimo), fornecedor: x.fornecedor,
      preco_medio: num(x.precoMedio), validade_dias: num(x.validadeDias),
    })),
    fracionados: (db.fracionados ?? []).map((x) => ({
      nome: x.nome, categoria: x.categoria, tipo_produto: x.tipoProduto ?? "Fracionado", unidade: x.unidade, origem: x.origem, rendimento: num(x.rendimento),
      estoque_minimo: num(x.estoqueMinimo), fornecedor: x.fornecedor, preco_medio: num(x.precoMedio), validade_dias: num(x.validadeDias),
    })),
    entradasCentral: (db.entradasCentral ?? []).map((x) => ({
      data: x.data, nf: x.nf, produto: x.produto, fornecedor: x.fornecedor, quantidade: num(x.quantidade),
      preco_unitario: num(x.precoUnitario), validade: x.validade,
    })),
    saidasCentral: (db.saidasCentral ?? []).map((x) => ({ data: x.data, documento: x.documento, produto: x.produto, destino: x.destino, quantidade: num(x.quantidade) })),
    producoes: (db.producoes ?? []).map((x) => ({
      data: x.data, produto_bruto: x.produtoBruto, quantidade_utilizada: num(x.quantidadeUtilizada),
      produto_fracionado: x.produtoFracionado, quantidade_produzida: num(x.quantidadeProduzida),
    })),
    saidasFracionado: (db.saidasFracionado ?? []).map((x) => ({ data: x.data, documento: x.documento, produto: x.produto, destino: x.destino, quantidade: num(x.quantidade) })),
    ajustesEstoque: (db.ajustesEstoque ?? []).map((x) => ({
      data: x.data, produto: x.produto, saldo_anterior: num(x.saldoAnterior), novo_saldo: num(x.novoSaldo),
      diferenca: num(x.diferenca), motivo: x.motivo, responsavel: x.responsavel, ordem: num(x.ordem),
    })),
    ajustesFracionados: (db.ajustesFracionados ?? []).map((x) => ({
      data: x.data, produto: x.produto, saldo_anterior: num(x.saldoAnterior), novo_saldo: num(x.novoSaldo),
      diferenca: num(x.diferenca), motivo: x.motivo, responsavel: x.responsavel, ordem: num(x.ordem),
    })),
    pedidosCompra: (db.pedidosCompra ?? []).map((x) => ({
      data: x.data, produto: x.produto, fornecedor: x.fornecedor, quantidade_pedida: num(x.quantidadePedida),
      preco_estimado: num(x.precoEstimado), status: x.status, data_recebimento: x.dataRecebimento,
      quantidade_recebida: x.quantidadeRecebida == null ? null : num(x.quantidadeRecebida),
      preco_recebido: x.precoRecebido == null ? null : num(x.precoRecebido),
    })),
    itensManuaisCompra: db.itensManuaisCompra ?? [],
  };
}

async function restoreLegacyDBAtomically(
  supabase: SupabaseClient,
  db: LegacyDB,
  expectedRevision: number,
  scope: SyncScope,
): Promise<number> {
  const { data, error } = await supabase.rpc("restaurar_backup_estoque_atomico", {
    p_dados: atomicPayload(db),
    p_revisao_esperada: expectedRevision,
    p_escopo: scope,
  });
  if (error) throw error;
  return Number(data);
}

function syncErrorInfo(error: unknown) {
  if (!error || typeof error !== "object") return { message: String(error ?? ""), code: "" };
  const value = error as { message?: unknown; code?: unknown };
  return { message: String(value.message ?? ""), code: String(value.code ?? "") };
}

const wait = (milliseconds: number) => new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds));

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

export type SyncScope = "full" | "fracionados" | "controle_fracionados_ampliado";

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

async function saveFracionadosExpanded(supabase: SupabaseClient, user: User, db: LegacyDB) {
  const [categorias, brutos, locais] = await Promise.all([
    selectAll<any>(supabase, "categorias", "id,nome"),
    selectAll<any>(supabase, "produtos_brutos", "id,nome"),
    selectAll<any>(supabase, "locais", "id,nome"),
  ]);
  const categoriaMap = byName(categorias);
  const brutoMap = byName(brutos);
  const localMap = byName(locais);

  await Promise.all([
    deleteAll(supabase, "saidas_fracionado"),
    deleteAll(supabase, "producoes"),
    deleteAll(supabase, "saidas_central"),
    deleteAll(supabase, "ajustes_fracionados"),
  ]);
  await deleteMissingByName(supabase, "produtos_fracionados", (db.fracionados ?? []).map((p) => p.nome).filter(Boolean));
  const fracionados = await upsertReturning<any>(
    supabase,
    "produtos_fracionados",
    (db.fracionados ?? []).map((p) => ({
      nome: p.nome,
      categoria_id: categoriaMap.get(p.categoria)?.id ?? null,
      tipo_produto: p.tipoProduto ?? "Fracionado",
      unidade: p.unidade || "UN",
      origem_bruto_id: brutoMap.get(p.origem)?.id ?? null,
      rendimento_percent: num(p.rendimento) || 100,
      estoque_minimo: num(p.estoqueMinimo),
      fornecedor: clean(p.fornecedor),
      preco_medio: num(p.precoMedio),
      validade_dias: num(p.validadeDias),
      ativo: true,
    })),
    "nome",
  );
  const fracionadoMap = byName(fracionados);

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
  await insertRows(supabase, "ajustes_fracionados", (db.ajustesFracionados ?? []).map((a) => ({
    data: a.data,
    produto_fracionado_id: fracionadoMap.get(a.produto)?.id,
    saldo_anterior: num(a.saldoAnterior),
    novo_saldo: num(a.novoSaldo),
    diferenca: num(a.diferenca),
    motivo: clean(a.motivo) ?? "Ajuste",
    responsavel: clean(a.responsavel) ?? "Sistema",
    criado_por: user.id,
  })));
}

export async function saveLegacyDB(supabase: SupabaseClient, user: User, db: LegacyDB, scope: SyncScope = "full") {
  if (scope === "fracionados") {
    await saveFracionadosMovements(supabase, user, db);
    return;
  }
  if (scope === "controle_fracionados_ampliado") {
    await saveFracionadosExpanded(supabase, user, db);
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
    deleteAll(supabase, "ajustes_fracionados"),
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
  await insertRows(supabase, "ajustes_fracionados", (db.ajustesFracionados ?? []).map((a) => ({
    data: a.data,
    produto_fracionado_id: fracionadoMap.get(a.produto)?.id,
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
  const keys = new Set([...Object.keys(before), ...Object.keys(after)].filter((key) => !key.startsWith("_")));
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

type IncrementalAction = "inserir" | "alterar" | "excluir";
type IncrementalOperation = {
  secao: ArraySection | "itensManuaisCompra";
  acao: IncrementalAction;
  id?: string;
  atualizadoEm?: string;
  dados: Record<string, any>;
};

const incrementalSections: ArraySection[] = [
  "categorias", "locais", "brutos", "fracionados", "entradasCentral", "saidasCentral",
  "producoes", "saidasFracionado", "ajustesEstoque", "ajustesFracionados", "pedidosCompra",
];

function rowData(row: Record<string, any>) {
  return Object.fromEntries(Object.entries(row).filter(([key]) => !key.startsWith("_")));
}

function buildIncrementalOperations(before: LegacyDB, after: LegacyDB, scope: SyncScope): IncrementalOperation[] {
  const allowed = scope === "controle_fracionados_ampliado"
    ? new Set<ArraySection>(["fracionados", "saidasCentral", "producoes", "saidasFracionado", "ajustesFracionados"])
    : new Set(incrementalSections);
  const operations: IncrementalOperation[] = [];

  for (const section of incrementalSections) {
    if (!allowed.has(section)) continue;
    const beforeRows = before[section] as Array<Record<string, any>>;
    const afterRows = after[section] as Array<Record<string, any>>;
    const beforeById = new Map(beforeRows.filter((row) => row._id).map((row) => [String(row._id), row]));
    const afterById = new Map(afterRows.filter((row) => row._id).map((row) => [String(row._id), row]));

    for (const [id, previous] of beforeById) {
      const current = afterById.get(id);
      if (!current) {
        operations.push({ secao: section, acao: "excluir", id, atualizadoEm: previous._updatedAt, dados: rowData(previous) });
      } else if (JSON.stringify(rowData(previous)) !== JSON.stringify(rowData(current))) {
        operations.push({ secao: section, acao: "alterar", id, atualizadoEm: previous._updatedAt, dados: rowData(current) });
      }
    }
    for (const current of afterRows) {
      if (!current._id) {
        const data = rowData(current);
        // A ordem do ajuste vem do banco, não do relógio do celular. Assim o
        // último ajuste confirmado sempre será o saldo vigente.
        if (section === "ajustesEstoque" || section === "ajustesFracionados") data.ordem = 0;
        operations.push({ secao: section, acao: "inserir", dados: data });
      }
    }
  }

  if (scope === "full") {
    const beforeManual = new Set(before.itensManuaisCompra ?? []);
    const afterManual = new Set(after.itensManuaisCompra ?? []);
    afterManual.forEach((nome) => {
      if (!beforeManual.has(nome)) operations.push({ secao: "itensManuaisCompra", acao: "inserir", dados: { nome } });
    });
    beforeManual.forEach((nome) => {
      if (!afterManual.has(nome)) operations.push({ secao: "itensManuaisCompra", acao: "excluir", dados: { nome } });
    });
  }
  return operations;
}

async function applyIncrementalOperations(supabase: SupabaseClient, operations: IncrementalOperation[]) {
  if (operations.length === 0) return;
  if (operations.length > 50) {
    throw new Error("Proteção ativada: esta ação tentou alterar mais de 50 registros. Nenhuma alteração foi enviada.");
  }
  const { error } = await supabase.rpc("aplicar_operacoes_estoque", { p_operacoes: operations });
  if (error) throw error;
}

export function installCloudSync(
  supabase: SupabaseClient,
  user: User,
  onRemoteChange: () => void,
  scope: SyncScope = "full",
  initialRevision = 0,
): RealtimeChannel {
  let saving = false;
  let stockRevision = initialRevision;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let remoteTimer: ReturnType<typeof setTimeout> | undefined;
  let saveChain: Promise<void> = Promise.resolve();
  let lastSavedDB: LegacyDB = (() => {
    try {
      return cloneDB(JSON.parse(window.localStorage?.getItem(STORAGE_KEY) || "null") || emptyDB());
    } catch {
      return emptyDB();
    }
  })();

  async function refreshLocalState() {
    const { db: freshDB, revision } = await loadConsistentLegacyState(supabase);
    window.localStorage?.setItem(STORAGE_KEY, JSON.stringify(freshDB));
    lastSavedDB = cloneDB(freshDB);
    stockRevision = revision;
    window.__estoqueLegacy?.replaceDB(freshDB);
    return freshDB;
  }

  (window as any).__estoqueCloudSync = {
    async convertProductType(origem: "bruto" | "fracionado", nome: string, tipo: "Bruto" | "Fracionado") {
      const { error } = await supabase.rpc("converter_tipo_produto", {
        p_origem: origem,
        p_nome: nome,
        p_tipo_destino: tipo,
      });
      if (error) throw error;
      const { db: freshDB, revision } = await loadConsistentLegacyState(supabase);
      window.localStorage?.setItem(STORAGE_KEY, JSON.stringify(freshDB));
      lastSavedDB = cloneDB(freshDB);
      stockRevision = revision;
      window.__estoqueLegacy?.replaceDB(freshDB);
      window.dispatchEvent(new CustomEvent("estoque-cloud-status", { detail: { status: "salvo" } }));
    },
    async updateProductType(nome: string, tipo: "Bruto" | "Fracionado") {
      const { error } = await supabase.rpc("atualizar_tipo_produto_bruto", {
        p_nome: nome,
        p_tipo: tipo,
      });
      if (error) throw error;
      const current = window.__estoqueLegacy?.getDB() as LegacyDB | undefined;
      if (current) {
        const product = current.brutos?.find((item) => item.nome === nome);
        if (product) product.tipoProduto = tipo;
        lastSavedDB = cloneDB(current);
      }
      window.dispatchEvent(new CustomEvent("estoque-cloud-status", { detail: { status: "salvo" } }));
    },
    async archiveCategory(nome: string) {
      const { error } = await supabase.rpc("arquivar_categoria", { p_nome: nome });
      if (error) throw error;
      const { db: freshDB, revision } = await loadConsistentLegacyState(supabase);
      window.localStorage?.setItem(STORAGE_KEY, JSON.stringify(freshDB));
      lastSavedDB = cloneDB(freshDB);
      stockRevision = revision;
      window.__estoqueLegacy?.replaceDB(freshDB);
      window.dispatchEvent(new CustomEvent("estoque-cloud-status", { detail: { status: "salvo" } }));
    },
    async archiveLocation(id: string) {
      const { error } = await supabase.rpc("arquivar_local", { p_id: id });
      if (error) throw error;
      const { db: freshDB, revision } = await loadConsistentLegacyState(supabase);
      window.localStorage?.setItem(STORAGE_KEY, JSON.stringify(freshDB));
      lastSavedDB = cloneDB(freshDB);
      stockRevision = revision;
      window.__estoqueLegacy?.replaceDB(freshDB);
      window.dispatchEvent(new CustomEvent("estoque-cloud-status", { detail: { status: "salvo" } }));
    },
    async updateCatalog(section: "categorias" | "locais", current: Record<string, any>, next: Record<string, any>) {
      if (!current._id) throw new Error("O registro não possui identificador do banco. Recarregue a página.");
      await applyIncrementalOperations(supabase, [{
        secao: section,
        acao: "alterar",
        id: String(current._id),
        atualizadoEm: current._updatedAt,
        dados: rowData(next),
      }]);
      await refreshLocalState();
      window.dispatchEvent(new CustomEvent("estoque-cloud-status", { detail: { status: "salvo" } }));
    },
    async updateProduct(tipo: "bruto" | "fracionado", nomeAtual: string, produto: Record<string, any>) {
      const rpc = tipo === "bruto" ? "atualizar_produto_bruto" : "atualizar_produto_fracionado";
      const params = tipo === "bruto"
        ? {
            p_nome_atual: nomeAtual, p_nome: produto.nome, p_categoria: produto.categoria,
            p_tipo_produto: produto.tipoProduto ?? "Bruto", p_unidade: produto.unidade,
            p_estoque_minimo: num(produto.estoqueMinimo), p_fornecedor: produto.fornecedor ?? "",
            p_preco_medio: num(produto.precoMedio), p_validade_dias: num(produto.validadeDias),
          }
        : {
            p_nome_atual: nomeAtual, p_nome: produto.nome, p_categoria: produto.categoria,
            p_tipo_produto: produto.tipoProduto ?? "Fracionado", p_unidade: produto.unidade,
            p_origem: produto.origem ?? "", p_rendimento: num(produto.rendimento),
            p_estoque_minimo: num(produto.estoqueMinimo), p_fornecedor: produto.fornecedor ?? "",
            p_preco_medio: num(produto.precoMedio), p_validade_dias: num(produto.validadeDias),
      };
      const { error } = await supabase.rpc(rpc, params);
      if (error) throw error;
      // A RPC já confirmou a alteração no banco. Recarregar todas as tabelas
      // aqui deixava o modal aberto por vários segundos. Atualizamos somente
      // o cadastro local e seus nomes de referência; os movimentos continuam
      // no mesmo ID no banco e não têm saldo alterado por esta operação.
      const current = window.__estoqueLegacy?.getDB() as LegacyDB | undefined;
      if (current) {
        const products = tipo === "bruto" ? current.brutos : current.fracionados;
        const product = products?.find((item) => item.nome === nomeAtual);
        if (product) Object.assign(product, produto);

        if (nomeAtual !== produto.nome) {
          if (tipo === "bruto") {
            current.entradasCentral?.forEach((item) => { if (item.produto === nomeAtual) item.produto = produto.nome; });
            current.saidasCentral?.forEach((item) => { if (item.produto === nomeAtual) item.produto = produto.nome; });
            current.producoes?.forEach((item) => { if (item.produtoBruto === nomeAtual) item.produtoBruto = produto.nome; });
            current.ajustesEstoque?.forEach((item) => { if (item.produto === nomeAtual) item.produto = produto.nome; });
            current.pedidosCompra?.forEach((item) => { if (item.produto === nomeAtual) item.produto = produto.nome; });
            current.itensManuaisCompra = current.itensManuaisCompra?.map((item) => item === nomeAtual ? produto.nome : item);
          } else {
            current.producoes?.forEach((item) => { if (item.produtoFracionado === nomeAtual) item.produtoFracionado = produto.nome; });
            current.saidasFracionado?.forEach((item) => { if (item.produto === nomeAtual) item.produto = produto.nome; });
            current.ajustesFracionados?.forEach((item) => { if (item.produto === nomeAtual) item.produto = produto.nome; });
          }
        }
        window.localStorage?.setItem(STORAGE_KEY, JSON.stringify(current));
        lastSavedDB = cloneDB(current);
      }
      window.dispatchEvent(new CustomEvent("estoque-cloud-status", { detail: { status: "salvo" } }));
    },
    async updateFractionedProductType(nome: string, tipo: "Bruto" | "Fracionado") {
      const { error } = await supabase.rpc("atualizar_tipo_produto_fracionado", { p_nome: nome, p_tipo: tipo });
      if (error) throw error;
      const current = window.__estoqueLegacy?.getDB() as LegacyDB | undefined;
      if (current) {
        const product = current.fracionados?.find((item) => item.nome === nome);
        if (product) product.tipoProduto = tipo;
        lastSavedDB = cloneDB(current);
      }
      window.dispatchEvent(new CustomEvent("estoque-cloud-status", { detail: { status: "salvo" } }));
    },
    async restoreBackup(backupDB: LegacyDB) {
      if (scope !== "full") throw new Error("Somente Master ou Administrador pode restaurar um backup completo.");
      saving = true;
      window.dispatchEvent(new CustomEvent("estoque-cloud-status", { detail: { status: "salvando" } }));
      try {
        const { db: currentDB, revision } = await loadConsistentLegacyState(supabase);
        assertSafeReplacement(currentDB, backupDB);
        assertValidMovements(backupDB);
        await createCheckpoint(supabase, user, currentDB);
        stockRevision = await restoreLegacyDBAtomically(supabase, backupDB, revision, "full");
        const freshDB = await refreshLocalState();
        try { await insertSystemLog(supabase, user, currentDB, freshDB); } catch (error) { console.warn("Nao foi possivel registrar o log do backup.", error); }
        window.dispatchEvent(new CustomEvent("estoque-cloud-status", { detail: { status: "salvo" } }));
      } finally {
        saving = false;
      }
    },
    save(db: LegacyDB, options?: { immediate?: boolean }) {
      window.localStorage?.setItem(STORAGE_KEY, JSON.stringify(db));
      clearTimeout(timer);
      window.dispatchEvent(new CustomEvent("estoque-cloud-status", { detail: { status: "salvando" } }));
      const queuedDB = cloneDB(db);
      timer = setTimeout(() => {
        timer = undefined;
        saveChain = saveChain.then(async () => {
          saving = true;
          try {
            const nextDB = queuedDB;
            const beforeDB = cloneDB(lastSavedDB);
            assertValidMovements(nextDB);
            const operations = buildIncrementalOperations(beforeDB, nextDB, scope);
            await applyIncrementalOperations(supabase, operations);
            try {
              await insertSystemLog(supabase, user, beforeDB, nextDB);
            } catch (logError) {
              console.warn("Nao foi possivel registrar o log resumido.", logError);
            }
            if (operations.length > 0) await refreshLocalState();
            else lastSavedDB = cloneDB(nextDB);
            window.dispatchEvent(new CustomEvent("estoque-cloud-status", { detail: { status: "salvo" } }));
          } catch (error) {
            console.error("Erro ao salvar estoque no Supabase", error);
            const errorInfo = syncErrorInfo(error);
            let message = errorInfo.message || (error instanceof Error ? error.message : "Verifique permissao do usuario ou dados obrigatorios.");
            if (errorInfo.code && errorInfo.code !== "40001") message = `${message} (código ${errorInfo.code})`;
            try {
              await refreshLocalState();
              message = `${message} A cópia local foi restaurada para a versão atual do banco.`;
            } catch (restoreError) {
              console.error("Erro ao restaurar a cópia local", restoreError);
              message = `${message} A gravação foi interrompida.`;
            }
            window.dispatchEvent(new CustomEvent("estoque-cloud-status", { detail: { status: "erro", message } }));
          } finally {
            saving = false;
          }
        });
      }, options?.immediate ? 0 : 900);
    },
    isSaving() {
      return saving || timer !== undefined;
    },
    setRemoteState(db: LegacyDB, revision: number) {
      lastSavedDB = cloneDB(db);
      stockRevision = revision;
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
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "estoque_sync_state", filter: "singleton=eq.true" }, () => {
      if (saving) return;
      clearTimeout(remoteTimer);
      remoteTimer = setTimeout(onRemoteChange, 350);
    })
    .subscribe();
}

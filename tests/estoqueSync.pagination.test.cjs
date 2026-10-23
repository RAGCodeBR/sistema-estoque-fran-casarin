const assert = require("node:assert/strict");
const fs = require("node:fs");
const Module = require("node:module");
const path = require("node:path");
const test = require("node:test");
const ts = require("typescript");

const filename = path.resolve(__dirname, "../lib/estoqueSync.ts");
const source = fs.readFileSync(filename, "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const stockModule = new Module(filename, module);
stockModule.filename = filename;
stockModule.paths = Module._nodeModulePaths(path.dirname(filename));
stockModule._compile(compiled, filename);

function makeRows(count) {
  return Array.from({ length: count }, (_, index) => ({
    id: `row-${String(index).padStart(5, "0")}`,
    criado_em: "2026-10-23T12:00:00Z",
    quantidade: 1,
  }));
}

function fakeSupabase(tables, cap, stopAt = Infinity) {
  return {
    rpc: async () => ({ data: 7, error: null }),
    from(table) {
      const rows = tables[table] ?? [];
      let start = 0;
      let end = 0;
      return {
        select(_columns, options) {
          assert.equal(options.count, "exact");
          return this;
        },
        order() { return this; },
        eq() { return this; },
        range(first, last) {
          start = first;
          end = last;
          return this;
        },
        then(resolve, reject) {
          const page = start >= stopAt ? [] : rows.slice(start, Math.min(end + 1, start + cap, stopAt));
          return Promise.resolve({ data: page, count: rows.length, error: null }).then(resolve, reject);
        },
      };
    },
  };
}

test("carrega entradas e as duas saídas além de 1.000 mesmo com limite menor por resposta", async () => {
  const client = fakeSupabase({
    entradas_central: makeRows(1088),
    saidas_central: makeRows(1042),
    saidas_fracionado: makeRows(1026),
  }, 300);
  const { db, revision } = await stockModule.exports.loadConsistentLegacyState(client);
  assert.equal(revision, 7);
  assert.equal(db.entradasCentral.length, 1088);
  assert.equal(db.saidasCentral.length, 1042);
  assert.equal(db.saidasFracionado.length, 1026);
  assert.equal(db.saidasCentral.at(-1)._id, "row-01041");
  assert.equal(db.saidasFracionado.at(-1)._id, "row-01025");
});

test("recusa uma cópia parcial quando o servidor deixa de entregar páginas", async () => {
  const client = fakeSupabase({ saidas_central: makeRows(1042) }, 500, 1000);
  await assert.rejects(
    stockModule.exports.loadConsistentLegacyState(client),
    /Não foi possível carregar todos os registros/,
  );
});

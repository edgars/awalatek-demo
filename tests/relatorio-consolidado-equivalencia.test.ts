import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Beneficiario, PrismaClient } from "@/generated/prisma/client";
import { completaDv } from "@/domain/cpf";
import type { Quirks } from "@/domain/quirks";
import { brutoRelatorioCentavos, consolidar, consolidarGrupos } from "@/domain/relatorios/consolidado";
import { createPrismaClient } from "@/server/db";
import { relatorioConsolidado } from "@/server/relatorioConsolidado";
import { BENEFICIARIOS_SEED, cpfComDv, seed } from "../prisma/seed";

// Equivalência (H3): a agregação na base (`relatorioConsolidado`) dá exatamente o mesmo
// resultado que o caminho anterior em memória (lê todos os pagamentos da competência,
// resolve a região de cada CPF e chama `consolidar`), em modo legado e com D10/D11
// corrigidos, sobre dados aleatórios (semente fixa): regiões 0/1–25/99/>25/negativas,
// beneficiário inexistente, status desconhecidos, brutos negativos e outras competências.

let dir: string;
let prisma: PrismaClient;

/** PRNG determinístico (mulberry32) para reproduzir uma falha. */
function prng(semente: number) {
  let a = semente >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Caminho anterior (em memória), copiado da versão pré-H3 de `relatorioConsolidado`. */
async function consolidadoEmMemoria(competencia: number, db: PrismaClient, quirks: Pick<Quirks, "corrigidos">) {
  const pagamentos = await db.pagamento.findMany({
    where: { anoMesRef: competencia },
    orderBy: { numPagamento: "asc" },
    select: { anoMesRef: true, numCpf: true, vlrBruto: true, vlrDescontoTotal: true, vlrLiquido: true, sitPagamento: true },
  });
  const cpfs = [...new Set(pagamentos.map((p) => p.numCpf))];
  const regiaoPorCpf = new Map<string, number>();
  for (let i = 0; i < cpfs.length; i += 500) {
    const beneficiarios = await db.beneficiario.findMany({ where: { numCpf: { in: cpfs.slice(i, i + 500) } }, select: { numCpf: true, codRegiao: true } });
    for (const b of beneficiarios) regiaoPorCpf.set(b.numCpf, b.codRegiao);
  }
  const linhas = pagamentos.map(({ numCpf, ...p }) => ({ ...p, codRegiao: regiaoPorCpf.get(numCpf) ?? null }));
  return consolidar(competencia, linhas, quirks);
}

const MODOS: [string, Pick<Quirks, "corrigidos">][] = [
  ["legado", { corrigidos: new Set() }],
  ["D10", { corrigidos: new Set(["D10"]) }],
  ["D11", { corrigidos: new Set(["D11"]) }],
  ["D10+D11", { corrigidos: new Set(["D10", "D11"]) }],
];
const COMPETENCIAS = [201101, 201102, 201103] as const;
const CODS_REGIAO = [0, 1, 3, 5, 6, 10, 11, 15, 16, 20, 21, 22, 25, 26, 30, 99, -1];
const STATUS = ["G", "P", "C", "D", "E", "X", " ", "g", "PP"];

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), "sifap-consol-eq-"));
  const url = `file:${path.join(dir, "test.db")}`;
  execFileSync("npx", ["prisma", "migrate", "deploy"], { env: { ...process.env, DATABASE_URL: url }, stdio: "pipe" });
  prisma = createPrismaClient(url);
  await seed(prisma);
  const modelo = await prisma.beneficiario.findUniqueOrThrow({ where: { numCpf: cpfComDv(BENEFICIARIOS_SEED[0].base) } });
  // `chavePublica` é única (H2): cada cópia recebe a sua pelo default do schema.
  const { id: _id, chavePublica: _chave, ...dados } = modelo;
  void _id;
  void _chave;
  const base: Omit<Beneficiario, "id" | "chavePublica"> = { ...dados, nis: null };

  const rnd = prng(20260925);
  const escolhe = <T,>(xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)] as T;
  const beneficiarios = Array.from({ length: 700 }, (_, i) => ({ ...base, numCpf: completaDv(`88${String(i).padStart(7, "0")}`), codRegiao: escolhe(CODS_REGIAO) }));
  await prisma.beneficiario.createMany({ data: beneficiarios });
  // CPFs sem beneficiário (FIND sem coincidência): pagamentos órfãos com as FKs desligadas.
  const orfaos = Array.from({ length: 20 }, (_, i) => completaDv(`89${String(i).padStart(7, "0")}`));

  const pagamentos = Array.from({ length: 3000 }, (_, i) => {
    const r = rnd();
    // Maioria positiva; alguns zeros e negativos (o arredondamento D11 difere para negativos).
    const vlrBruto = r < 0.08 ? -Math.floor(rnd() * 50000) - 1 : r < 0.12 ? 0 : r < 0.16 ? -escolhe([1, 5, 99, 100, 101]) : Math.floor(rnd() * 500000);
    return {
      numPagamento: i + 1,
      numCpf: rnd() < 0.03 ? escolhe(orfaos) : (escolhe(beneficiarios).numCpf as string),
      codPrograma: "PA01",
      anoMesRef: escolhe(COMPETENCIAS),
      vlrBruto,
      vlrDescontoTotal: Math.floor(rnd() * 20000) - (rnd() < 0.05 ? 30000 : 0),
      vlrLiquido: Math.floor(rnd() * 480000) - (rnd() < 0.05 ? 600000 : 0),
      tipoPgto: "N",
      sitPagamento: escolhe(STATUS),
      dtGeracao: 20110101,
      hrGeracao: 101500,
    };
  });
  // PRAGMA por conexão: o adapter better-sqlite3 usa UMA conexão (sem pool; ver
  // src/server/db.ts), então o PRAGMA vale para os inserts seguintes deste cliente.
  await prisma.$executeRawUnsafe("PRAGMA foreign_keys = OFF");
  try {
    for (let i = 0; i < pagamentos.length; i += 500) await prisma.pagamento.createMany({ data: pagamentos.slice(i, i + 500) });
  } finally {
    await prisma.$executeRawUnsafe("PRAGMA foreign_keys = ON");
  }
});

afterAll(async () => {
  await prisma?.$disconnect();
  rmSync(dir, { recursive: true, force: true });
});

describe("consolidado: agregação SQL ≡ caminho em memória", () => {
  for (const [nome, quirks] of MODOS) {
    it.each(COMPETENCIAS)(`${nome}: competência %i`, async (competencia) => {
      const esperado = await consolidadoEmMemoria(competencia, prisma, quirks);
      const obtido = await relatorioConsolidado(competencia, prisma, { quirks });
      const { dataEmissao: _d, ...semData } = obtido;
      void _d;
      expect(semData).toEqual(esperado);
      expect(esperado.total.qtd).toBeGreaterThan(0);
    });
  }

  it("competência sem pagamentos: mesmas linhas em zero", async () => {
    for (const [, quirks] of MODOS) {
      const { dataEmissao: _d, ...semData } = await relatorioConsolidado(199912, prisma, { quirks });
      void _d;
      expect(semData).toEqual(await consolidadoEmMemoria(199912, prisma, quirks));
    }
  });

  it("os dados cobrem negativos, órfãos e status desconhecidos (o arredondamento legado difere do cru)", async () => {
    const legado = await relatorioConsolidado(201101, prisma, { quirks: { corrigidos: new Set() } });
    const d11 = await relatorioConsolidado(201101, prisma, { quirks: { corrigidos: new Set(["D11"]) } });
    // Com negativos, #VLR-ARR (+0,005 e trunca em direção a zero) ≠ bruto cru.
    expect(legado.total.bruto).not.toBe(d11.total.bruto);
    expect(legado.status).toEqual(d11.status); // status usa sempre o bruto cru
    const d10 = await relatorioConsolidado(201101, prisma, { quirks: { corrigidos: new Set(["D10"]) } });
    expect(d10.regioes.at(-1)?.nome).toBe("NAO CLASSIFICADA");
    expect(d10.regioes.at(-1)?.qtd).toBeGreaterThan(0);
  });
});

describe("consolidarGrupos (domínio)", () => {
  const g = (over: Partial<Parameters<typeof consolidarGrupos>[1][number]> = {}) => ({
    codRegiao: 1,
    sitPagamento: "G",
    brutoNegativo: null,
    qtd: 1,
    bruto: 100,
    desconto: 0,
    liquido: 100,
    ...over,
  });

  it("grupo de negativos: arredonda o valor unitário e multiplica pela quantidade (legado)", () => {
    // −1,00 + 0,005 = −0,995 → trunca → −0,99 (por pagamento).
    const r = consolidarGrupos(201101, [g({ brutoNegativo: -100, qtd: 3, bruto: -300 })]);
    expect(r.total.bruto).toBe(-297);
    expect(r.status[0]?.bruto).toBe(-300);
    expect(consolidarGrupos(201101, [g({ brutoNegativo: -100, qtd: 3, bruto: -300 })], { corrigidos: new Set(["D11"]) }).total.bruto).toBe(-300);
  });

  it("grupo inconsistente → erro", () => {
    expect(() => consolidarGrupos(201101, [g({ brutoNegativo: -100, qtd: 2, bruto: -300 })])).toThrow();
    expect(() => consolidarGrupos(201101, [g({ brutoNegativo: 5, qtd: 1, bruto: 5 })])).toThrow();
  });
});

describe("consolidado: premissas e guardas da agregação SQL", () => {
  it("Beneficiario.numCpf tem índice UNIQUE (o LEFT JOIN não multiplica pagamentos)", async () => {
    const indices = await prisma.$queryRawUnsafe<{ name: string; unique: number | bigint }[]>(`PRAGMA index_list("Beneficiario")`);
    const unicosSoNumCpf = [];
    for (const i of indices.filter((x) => Number(x.unique) === 1)) {
      const cols = await prisma.$queryRawUnsafe<{ name: string }[]>(`PRAGMA index_info("${i.name}")`);
      if (cols.length === 1 && cols[0]?.name === "numCpf") unicosSoNumCpf.push(i.name);
    }
    expect(unicosSoNumCpf).toContain("Beneficiario_numCpf_key");
  });

  it("brutoRelatorioCentavos(x) === x para inteiros não negativos até MAX_SAFE_INTEGER (arredondar o grupo ≡ arredondar cada pagamento)", () => {
    const rnd = prng(31337);
    const amostras = [0, 1, 99, 100, 101, 999, 2 ** 31 - 1, 2 ** 31, 2 ** 52, Number.MAX_SAFE_INTEGER - 1, Number.MAX_SAFE_INTEGER];
    for (let i = 0; i < 3000; i++) {
      // Magnitudes log-uniformes de 1 a 2^53.
      amostras.push(Math.min(Number.MAX_SAFE_INTEGER, Math.floor(2 ** (rnd() * 53))));
    }
    for (const x of amostras) expect(brutoRelatorioCentavos(x), String(x)).toBe(x);
  });

  async function competenciaComBrutos(competencia: number, brutos: bigint[]) {
    const cpf = cpfComDv(BENEFICIARIOS_SEED[0].base);
    await prisma.pagamento.deleteMany({ where: { anoMesRef: competencia } });
    const maior = (await prisma.pagamento.aggregate({ _max: { numPagamento: true } }))._max.numPagamento ?? 0;
    for (const [i, bruto] of brutos.entries()) {
      const p = await prisma.pagamento.create({
        data: { numPagamento: maior + i + 1, numCpf: cpf, codPrograma: "PA01", anoMesRef: competencia, vlrBruto: 0, vlrLiquido: 0, tipoPgto: "N", sitPagamento: "G", dtGeracao: 20110101, hrGeracao: 1 },
      });
      // Valores acima de Int (32 bits) do Prisma: gravados direto no SQLite (INTEGER de 64 bits).
      await prisma.$executeRaw`UPDATE "Pagamento" SET "vlrBruto" = ${bruto} WHERE "id" = ${p.id}`;
    }
  }

  it("soma acima dos inteiros seguros → erro explícito (sem valor impreciso)", async () => {
    await competenciaComBrutos(209901, [2n ** 52n, 2n ** 52n]);
    await expect(relatorioConsolidado(209901, prisma)).rejects.toThrow("total do consolidado fora do intervalo de inteiros seguros");
  });

  it("estouro do SUM do SQLite (int64) → mesmo erro explícito", async () => {
    await competenciaComBrutos(209902, [2n ** 62n, 2n ** 62n]);
    await expect(relatorioConsolidado(209902, prisma)).rejects.toThrow("total do consolidado fora do intervalo de inteiros seguros");
  });

  it("somas entre grupos acima dos inteiros seguros → erro explícito no domínio", () => {
    const g = { codRegiao: 1, brutoNegativo: null, qtd: 1, bruto: Number.MAX_SAFE_INTEGER, desconto: 0, liquido: 0 };
    expect(() => consolidarGrupos(201101, [{ ...g, sitPagamento: "G" }, { ...g, sitPagamento: "P" }])).toThrow("fora do intervalo");
  });

  it("formato inesperado das linhas cruas → erro (validação zod)", async () => {
    const falso = new Proxy(prisma, {
      get(alvo, prop, receptor) {
        if (prop === "$queryRaw") return async () => [{ codRegiao: "1", sitPagamento: "G", brutoNegativo: null, qtd: 1n, bruto: 1n, desconto: 0n, liquido: 0n }];
        return Reflect.get(alvo, prop, receptor);
      },
    });
    await expect(relatorioConsolidado(201101, falso)).rejects.toThrow("formato inesperado");
  });

  it("colunas de soma NULL são aceitas como 0", async () => {
    const falso = new Proxy(prisma, {
      get(alvo, prop, receptor) {
        if (prop === "$queryRaw") return async () => [{ codRegiao: null, sitPagamento: "G", brutoNegativo: null, qtd: 1n, bruto: null, desconto: null, liquido: null }];
        return Reflect.get(alvo, prop, receptor);
      },
    });
    const r = await relatorioConsolidado(201101, falso);
    expect(r.total).toEqual({ qtd: 1, bruto: 0, desconto: 0, liquido: 0 });
    expect(r.regioes[4]?.qtd).toBe(1); // legado: beneficiário inexistente → CENTRO-OESTE
  });
});

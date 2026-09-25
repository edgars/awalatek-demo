import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@/generated/prisma/client";
import { completaDv } from "@/domain/cpf";
import type { ResumoLote } from "@/domain/calculo/lote";
import type { QuirkCorrigivel } from "@/domain/quirks";
import { createPrismaClient } from "@/server/db";
import { ejecutarLotePagamentos } from "@/server/lotePagamentos";

// Regras de cálculo do lote mensal (BATCHPGT:236-320, FR-LOT-03) exercitadas pelo
// caminho real do lote: `ejecutarLotePagamentos` sobre uma base SQLite temporária.
// Cada teste isola UM ramo/cômputo da regra e confere os centavos gravados no
// pagamento (e no resumo). Valores esperados calculados à mão a partir do fonte
// Natural (truncado a 2 decimais em cada COMPUTE, sem ROUNDED).
//
// O lote recebe os quirks explicitamente (default = legado; D8 corrigido só onde
// indicado), então o resultado não depende de SIFAP_QUIRKS_CORRIGIDOS.

let dir: string;
let prisma: PrismaClient;
const globalPrisma = globalThis as unknown as { prisma?: PrismaClient };
const AGORA = new Date("2026-11-15T12:00:00Z");

/** Programas de teste. `vlrBaseIndividual` em centavos. */
const PROGRAMAS = [
  // Tipo P, base 1.000,00, sem reajuste: isola os fatores.
  { codPrograma: "RP01", tipoPrograma: "P", vlrBaseIndividual: 100000, fatorReajuste: "0.0000" },
  // Tipo A (abono natalino), base 1.000,00, sem reajuste.
  { codPrograma: "RA01", tipoPrograma: "A", vlrBaseIndividual: 100000, fatorReajuste: "0.0000" },
  // Tipo P com reajuste 4,5 % (D8: reaplicado pelo motor no modo legado).
  { codPrograma: "RJ01", tipoPrograma: "P", vlrBaseIndividual: 100000, fatorReajuste: "0.0450" },
  // Base e reajuste que geram dízimas (truncado ≠ arredondado).
  { codPrograma: "RT01", tipoPrograma: "P", vlrBaseIndividual: 33333, fatorReajuste: "0.0333" },
  { codPrograma: "RT02", tipoPrograma: "P", vlrBaseIndividual: 33333, fatorReajuste: "0.0000" },
  { codPrograma: "RT03", tipoPrograma: "A", vlrBaseIndividual: 33333, fatorReajuste: "0.0000" },
  { codPrograma: "RT04", tipoPrograma: "P", vlrBaseIndividual: 83333, fatorReajuste: "0.0000" },
  // Limiar do desconto de 3 % (bruto = 500,00 e 500,01).
  { codPrograma: "RL00", tipoPrograma: "P", vlrBaseIndividual: 50000, fatorReajuste: "0.0000" },
  { codPrograma: "RL01", tipoPrograma: "P", vlrBaseIndividual: 50001, fatorReajuste: "0.0000" },
  // FATOR-REAJ < −1: bruto negativo (único caminho para #VLR-LIQ < 0).
  { codPrograma: "RN01", tipoPrograma: "P", vlrBaseIndividual: 100000, fatorReajuste: "-2.0000" },
] as const;

type CodProg = (typeof PROGRAMAS)[number]["codPrograma"];

interface Benef {
  prog: CodProg;
  /** COD-REGIAO; default 15 (REF 1,0000). */
  regiao?: number;
  /** NUM-DEPENDENTES; default 0 (1,0000). */
  dep?: number;
  /** RENDA-FAMILIAR em centavos; default 100,00 (tramo 1,0000). */
  renda?: number;
  /** DT-NASCIMENTO AAAAMMDD; default 1996 (30 anos em 2026 → 1,0000). */
  nasc?: number;
}

/** Beneficiários por rótulo. Neutro = todos os fatores 1,0000. */
const BENEFS = {
  neutro: { prog: "RP01" },
  // idade por ano (BATCHPGT:237)
  idade60PorAno: { prog: "RP01", nasc: 19661231 }, // 59 anos reais em 11/2026, 60 por ano
  idade59PorAno: { prog: "RP01", nasc: 19670101 },
  idade65: { prog: "RP01", nasc: 19610101 },
  idade64: { prog: "RP01", nasc: 19620101 },
  // dependentes (BATCHPGT:250-254)
  dep1: { prog: "RP01", dep: 1 },
  dep2: { prog: "RP01", dep: 2 },
  dep3: { prog: "RP01", dep: 3 },
  dep4: { prog: "RP01", dep: 4 },
  dep5: { prog: "RP01", dep: 5 },
  // produto dos fatores (BATCHPGT:280): reg 1 (1,35) × 1 dep (1,05) × renda 500,00 (0,85) × 70 anos (1,15)
  produto: { prog: "RP01", regiao: 1, dep: 1, renda: 50000, nasc: 19560101 },
  // reajuste (BATCHPGT:282)
  reajuste: { prog: "RJ01" },
  // truncado do benefício (BATCHPGT:284-285)
  truncBenf: { prog: "RT01" },
  // 13.º só com reg × idade (BATCHPGT:294): reg 1, 2 dep, renda 500,00, 70 anos, reajuste 4,5 %
  decimo: { prog: "RJ01", regiao: 1, dep: 2, renda: 50000, nasc: 19560101 },
  // truncado do 13.º (BATCHPGT:295-296): 333,33 × 1,32 = 439,9956
  truncDecimo: { prog: "RT02", regiao: 2 },
  // abono (BATCHPGT:298-302)
  abono: { prog: "RA01" },
  truncAbono: { prog: "RT03" },
  // desconto (BATCHPGT:308-311)
  bruto500: { prog: "RL00" },
  bruto50001: { prog: "RL01" },
  truncDesc: { prog: "RT04" },
  // líquido negativo (BATCHPGT:316)
  negativo: { prog: "RN01" },
} satisfies Record<string, Benef>;

type Rotulo = keyof typeof BENEFS;

const CPF = {} as Record<Rotulo, string>;

interface Pgto {
  vlrBruto: number;
  vlrDescontoTotal: number;
  vlrLiquido: number;
  vlrAbono: number;
  tipoPgto: string;
}

/** Pagamentos gravados por competência → rótulo. */
const PGTO: Record<number, Record<Rotulo, Pgto>> = {};
const RESUMO: Record<number, ResumoLote> = {};

async function rodarLote(dtHoje: number, corrigidos: QuirkCorrigivel[] = []): Promise<number> {
  const r = await ejecutarLotePagamentos({
    dtHoje,
    agora: AGORA,
    db: prisma,
    log: () => {},
    quirks: { corrigidos: new Set(corrigidos) },
  });
  if (!r.ok) throw new Error(r.mensagem);
  const competencia = r.resumo.competencia;
  RESUMO[competencia] = r.resumo;
  const pagamentos = await prisma.pagamento.findMany({ where: { anoMesRef: competencia } });
  const porCpf = new Map(pagamentos.map((p) => [p.numCpf, p]));
  const mapa = {} as Record<Rotulo, Pgto>;
  for (const rotulo of Object.keys(BENEFS) as Rotulo[]) {
    const p = porCpf.get(CPF[rotulo]);
    if (!p) throw new Error(`sem pagamento para ${rotulo} em ${competencia}`);
    mapa[rotulo] = p;
  }
  PGTO[competencia] = mapa;
  return competencia;
}

const NOV = 202611;
const DEZ = 202612;
/** Lote de outubro com D8 corrigido (motor não reaplica 1 + FATOR-REAJ). */
const OUT_D8 = 202610;

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), "sifap-regras-batchpgt-"));
  const url = `file:${path.join(dir, "test.db")}`;
  execFileSync("npx", ["prisma", "migrate", "deploy"], { env: { ...process.env, DATABASE_URL: url }, stdio: "pipe" });
  prisma = createPrismaClient(url);
  delete globalPrisma.prisma;
  vi.stubEnv("DATABASE_URL", url);

  for (const p of PROGRAMAS) {
    await prisma.programaSocial.create({
      data: {
        ...p,
        nomePrograma: `PROGRAMA REGRA ${p.codPrograma}`,
        dtCriacao: 20200101,
        fatorK: "1.000000",
        sitPrograma: "A",
      },
    });
  }
  let seq = 1;
  for (const [rotulo, b] of Object.entries(BENEFS) as [Rotulo, Benef][]) {
    const numCpf = completaDv(`8${String(seq++).padStart(8, "0")}`);
    CPF[rotulo] = numCpf;
    await prisma.beneficiario.create({
      data: {
        numCpf,
        nomeCompleto: `REGRA ${rotulo.toUpperCase()}`,
        dtNascimento: b.nasc ?? 19960510,
        sexo: "F",
        codRegiao: b.regiao ?? 15,
        codPrograma: b.prog,
        dtCadastro: 20250101,
        sitBeneficiario: "A",
        vlrRendaFamiliar: b.renda ?? 10000,
        numDependentes: b.dep ?? 0,
      },
    });
  }

  await rodarLote(20261115);
  await rodarLote(20261215);
  await rodarLote(20261015, ["D8"]);
});

afterAll(async () => {
  await prisma?.$disconnect();
  await globalPrisma.prisma?.$disconnect();
  delete globalPrisma.prisma;
  vi.unstubAllEnvs();
  rmSync(dir, { recursive: true, force: true });
});

function pgtos(competencia: number): Record<Rotulo, Pgto> {
  const m = PGTO[competencia];
  if (!m) throw new Error(`lote ${competencia} não executado`);
  return m;
}
function resumo(competencia: number): ResumoLote {
  const r = RESUMO[competencia];
  if (!r) throw new Error(`lote ${competencia} não executado`);
  return r;
}
const nov = (r: Rotulo) => pgtos(NOV)[r];
const dez = (r: Rotulo) => pgtos(DEZ)[r];
/** #VLR-13 gravado implicitamente: bruto(dez) − benefício(nov) − abono(dez). */
const vlr13 = (r: Rotulo) => dez(r).vlrBruto - nov(r).vlrBruto - dez(r).vlrAbono;

describe("BATCHPGT — regras de cálculo do lote (FR-LOT-03), caminho ejecutarLotePagamentos", () => {
  it("sanidade: todos os beneficiários geraram pagamento em cada competência", () => {
    const n = Object.keys(BENEFS).length;
    for (const c of [NOV, DEZ, OUT_D8]) expect(resumo(c)).toMatchObject({ processados: n, gerados: n, ignorados: 0, erros: 0 });
  });

  it("RK-540fc024b18c (BATCHPGT:237): #IDADE = #ANO − #ANO-NASC, só pelo ano da competência", () => {
    // Nascido em 31/12/1966: 59 anos reais em 11/2026, mas 60 pelo ano → fator 1,1000.
    expect(nov("idade60PorAno").vlrBruto).toBe(110000);
    // Nascido em 01/01/1967: 59 pelo ano → fator 1,0000.
    expect(nov("idade59PorAno").vlrBruto).toBe(100000);
  });

  it("RK-f5d5302be54b (BATCHPGT:250): IF #NUM-DEP <= 2 — 2 dependentes ainda no ramo 1,0000 + n × 0,05; 3 já não", () => {
    expect(nov("dep2").vlrBruto).toBe(110000); // 1,1000
    expect(nov("dep3").vlrBruto).toBe(113000); // ramo seguinte: 1,1300
  });

  it("RK-c22371bd5232 (BATCHPGT:251): #FATOR-FAM = 1,0000 + (#NUM-DEP × 0,0500)", () => {
    expect(nov("dep1").vlrBruto).toBe(105000); // 1.000,00 × 1,05
    expect(nov("dep2").vlrBruto).toBe(110000); // 1.000,00 × 1,10
  });

  it("RK-214450c0f73f (BATCHPGT:253): IF #NUM-DEP <= 4 — 4 dependentes no ramo 1,1000 + (n − 2) × 0,03; 5 já não", () => {
    expect(nov("dep4").vlrBruto).toBe(116000); // 1,1600
    expect(nov("dep5").vlrBruto).toBe(118000); // ramo ≥ 5: 1,1600 + 1 × 0,02
  });

  it("RK-c4f50dc3ca8a (BATCHPGT:254): #FATOR-FAM = 1,1000 + ((#NUM-DEP − 2) × 0,0300)", () => {
    expect(nov("dep3").vlrBruto).toBe(113000);
    expect(nov("dep4").vlrBruto).toBe(116000);
  });

  it("RK-809cefb3e473 (BATCHPGT:265): IF #IDADE >= 65 → #FATOR-IDADE = 1,1500", () => {
    expect(nov("idade65").vlrBruto).toBe(115000);
    expect(nov("idade64").vlrBruto).toBe(110000); // 64 cai no ramo ≥ 60
  });

  it("RK-b9c96b4d502e (BATCHPGT:268): IF #IDADE >= 60 → #FATOR-IDADE = 1,1000", () => {
    expect(nov("idade60PorAno").vlrBruto).toBe(110000);
    expect(nov("idade59PorAno").vlrBruto).toBe(100000); // 59 → 1,0000
  });

  it("RK-82624e7a43c9 (BATCHPGT:280): #VLR-BENF = BASE × F.REG × F.FAM × F.RND × F.IDADE, truncado", () => {
    // 1.000,00 × 1,35 × 1,05 × 0,85 × 1,15 = 1.385,60625 → 1.385,60 (não 1.385,61)
    expect(nov("produto").vlrBruto).toBe(138560);
    // desconto 3 % = 41,568 → 41,56; líquido 1.344,04
    expect(nov("produto")).toMatchObject({ vlrDescontoTotal: 4156, vlrLiquido: 134404, tipoPgto: "N" });
  });

  it("RK-a807625f63e9 (BATCHPGT:282): #VLR-BENF = #VLR-BENF × (1 + #FATOR-REAJ) — LEGACY-QUIRK D8", () => {
    // 1.000,00 × 1,0450 = 1.045,00; desconto 31,35; líquido 1.013,65
    expect(nov("reajuste")).toMatchObject({ vlrBruto: 104500, vlrDescontoTotal: 3135, vlrLiquido: 101365 });
    // Programa sem reajuste: nada muda.
    expect(nov("neutro").vlrBruto).toBe(100000);
  });

  it("RK-a807625f63e9 (BATCHPGT:282): CORRECAO(D8) — o lote não reaplica (1 + #FATOR-REAJ)", () => {
    expect(pgtos(OUT_D8).reajuste).toMatchObject({ vlrBruto: 100000, vlrDescontoTotal: 3000, vlrLiquido: 97000 });
  });

  it("RK-4cab47bee5b1 (BATCHPGT:284): #VLR-TEMP = #VLR-BENF × 100 — o benefício é cortado em centavos inteiros", () => {
    // 333,33 × 1,0333 = 344,429889 → 344,42 (arredondado seria 344,43)
    expect(nov("truncBenf").vlrBruto).toBe(34442);
    expect(Number.isInteger(nov("truncBenf").vlrBruto)).toBe(true);
  });

  it("RK-00a9411b5321 (BATCHPGT:285): #VLR-BENF = #VLR-TEMP / 100 — trunca, não arredonda", () => {
    expect(nov("truncBenf")).toMatchObject({ vlrBruto: 34442, vlrDescontoTotal: 0, vlrLiquido: 34442 });
  });

  it("RK-d4c02c7ef1e7 (BATCHPGT:292): IF #MES = 12 → tipo 'D' com 13.º; demais meses tipo 'N' sem 13.º", () => {
    expect(nov("neutro")).toMatchObject({ tipoPgto: "N", vlrBruto: 100000, vlrAbono: 0 });
    // dezembro: benefício 1.000,00 + 13.º 1.000,00; desconto 60,00
    expect(dez("neutro")).toMatchObject({ tipoPgto: "D", vlrBruto: 200000, vlrDescontoTotal: 6000, vlrLiquido: 194000 });
    expect(resumo(NOV).vlrTotalAbono).toBe(0);
  });

  it("RK-1838f13fae05 (BATCHPGT:294): #VLR-13 = #VLR-BASE × #FATOR-REG × #FATOR-IDADE (sem fam., renda nem reajuste)", () => {
    // benefício: 1.000 × 1,35 × 1,10 × 0,85 × 1,15 = 1.451,5875 → 1.451,58; × 1,045 = 1.516,9011 → 1.516,90
    expect(nov("decimo").vlrBruto).toBe(151690);
    // 13.º: 1.000 × 1,35 × 1,15 = 1.552,50
    expect(vlr13("decimo")).toBe(155250);
  });

  it("RK-7d6f8bc734b4 (BATCHPGT:295): #VLR-TEMP = #VLR-13 × 100 — o 13.º é cortado em centavos inteiros", () => {
    // 333,33 × 1,32 × 1,00 = 439,9956 → 439,99
    expect(vlr13("truncDecimo")).toBe(43999);
  });

  it("RK-7b2fc1482b07 (BATCHPGT:296): #VLR-13 = #VLR-TEMP / 100 — trunca (arredondado seria 440,00)", () => {
    // bruto dez = 439,99 + 439,99 = 879,98; desconto 26,3994 → 26,39; líquido 853,59
    expect(dez("truncDecimo")).toMatchObject({ vlrBruto: 87998, vlrDescontoTotal: 2639, vlrLiquido: 85359 });
  });

  it("RK-a049d00d5cfc (BATCHPGT:297): #VLR-BRUTO = #VLR-BENF + #VLR-13", () => {
    // 1.516,90 + 1.552,50 = 3.069,40; desconto 92,082 → 92,08; líquido 2.977,32
    expect(dez("decimo")).toMatchObject({ vlrBruto: 306940, vlrAbono: 0, vlrDescontoTotal: 9208, vlrLiquido: 297732 });
  });

  it("RK-76c532772e71 (BATCHPGT:298): IF #TIPO-PROG = 'A' — só programa tipo A tem abono, e só em dezembro", () => {
    expect(dez("abono").vlrAbono).toBe(15000);
    expect(dez("neutro").vlrAbono).toBe(0); // tipo P
    expect(nov("abono").vlrAbono).toBe(0); // novembro
    expect(nov("abono").vlrBruto).toBe(100000);
  });

  it("RK-a202ec1224da (BATCHPGT:299): #VLR-ABONO = #VLR-BENF × 0,15 (base = benefício mensal, não o bruto)", () => {
    // 15 % de 1.000,00 = 150,00 (sobre o bruto 2.000,00 seria 300,00)
    expect(dez("abono").vlrAbono).toBe(15000);
    expect(resumo(DEZ).vlrTotalAbono).toBe(15000 + 4999);
  });

  it("RK-9ff58ea7fd88 (BATCHPGT:300): #VLR-TEMP = #VLR-ABONO × 100 — o abono é cortado em centavos inteiros", () => {
    // 333,33 × 0,15 = 49,9995 → 49,99
    expect(dez("truncAbono").vlrAbono).toBe(4999);
  });

  it("RK-76a575ac73c7 (BATCHPGT:301): #VLR-ABONO = #VLR-TEMP / 100 — trunca (arredondado seria 50,00)", () => {
    expect(dez("truncAbono").vlrAbono).not.toBe(5000);
    expect(dez("truncAbono").vlrAbono).toBe(4999);
  });

  it("RK-6f5f5f139ddf (BATCHPGT:302): #VLR-BRUTO = #VLR-BRUTO + #VLR-ABONO", () => {
    // 1.000,00 + 1.000,00 + 150,00 = 2.150,00; desconto 64,50; líquido 2.085,50
    expect(dez("abono")).toMatchObject({ vlrBruto: 215000, vlrDescontoTotal: 6450, vlrLiquido: 208550 });
    // 333,33 + 333,33 + 49,99 = 716,65; desconto 21,4995 → 21,49; líquido 695,16
    expect(dez("truncAbono")).toMatchObject({ vlrBruto: 71665, vlrDescontoTotal: 2149, vlrLiquido: 69516 });
  });

  it("RK-75ff56906ba0 (BATCHPGT:308): IF #VLR-BRUTO > 500,00 — 500,00 não desconta, 500,01 desconta", () => {
    expect(nov("bruto500")).toMatchObject({ vlrBruto: 50000, vlrDescontoTotal: 0, vlrLiquido: 50000 });
    // 500,01 × 0,03 = 15,0003 → 15,00
    expect(nov("bruto50001")).toMatchObject({ vlrBruto: 50001, vlrDescontoTotal: 1500, vlrLiquido: 48501 });
  });

  it("RK-1d328e485c60 (BATCHPGT:309): #VLR-DESC = #VLR-BRUTO × 0,03", () => {
    expect(nov("neutro").vlrDescontoTotal).toBe(3000); // 3 % de 1.000,00
    expect(dez("neutro").vlrDescontoTotal).toBe(6000); // 3 % de 2.000,00
  });

  it("RK-2dd8a96d00d2 (BATCHPGT:310): #VLR-TEMP = #VLR-DESC × 100 — o desconto é cortado em centavos inteiros", () => {
    // 833,33 × 0,03 = 24,9999 → 24,99
    expect(nov("truncDesc").vlrDescontoTotal).toBe(2499);
  });

  it("RK-f56fad9e4ff6 (BATCHPGT:311): #VLR-DESC = #VLR-TEMP / 100 — trunca (arredondado seria 25,00)", () => {
    expect(nov("truncDesc")).toMatchObject({ vlrBruto: 83333, vlrDescontoTotal: 2499 });
  });

  it("RK-61c33b29d6a8 (BATCHPGT:315): #VLR-LIQ = #VLR-BRUTO − #VLR-DESC", () => {
    expect(nov("truncDesc").vlrLiquido).toBe(80834); // 833,33 − 24,99
    expect(nov("truncBenf").vlrLiquido).toBe(34442); // sem desconto: líquido = bruto
    const r = resumo(NOV);
    expect(r.vlrTotalLiquido).toBe(r.vlrTotalBruto - r.vlrTotalDesconto + 100000); // + 1.000,00 zerado do negativo
  });

  it("RK-b5749db3ea0e (BATCHPGT:316): IF #VLR-LIQ < 0 → 0", () => {
    // FATOR-REAJ −2: 1.000,00 × (1 − 2) = −1.000,00; bruto ≤ 500 → sem desconto; líquido −1.000,00 → 0
    expect(nov("negativo")).toMatchObject({ vlrBruto: -100000, vlrDescontoTotal: 0, vlrLiquido: 0 });
  });

  it("RK-8cbfbd730fa5 (BATCHPGT:319): #VLR-TEMP = #VLR-LIQ × 100 — líquido em centavos inteiros", () => {
    for (const p of Object.values(pgtos(NOV))) expect(Number.isInteger(p.vlrLiquido)).toBe(true);
    expect(nov("produto").vlrLiquido).toBe(134404); // 1.385,60 − 41,56
  });

  it("RK-273a402e3fcf (BATCHPGT:320): #VLR-LIQ = #VLR-TEMP / 100 — líquido gravado = bruto − desconto (≥ 0)", () => {
    for (const p of [...Object.values(pgtos(NOV)), ...Object.values(pgtos(DEZ))]) {
      expect(p.vlrLiquido).toBe(Math.max(0, p.vlrBruto - p.vlrDescontoTotal));
    }
    expect(dez("truncDecimo").vlrLiquido).toBe(85359);
  });
});

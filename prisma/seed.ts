import "dotenv/config";
import { pathToFileURL } from "node:url";
import { completaDv } from "../src/domain/cpf.ts";
import type { PrismaClient } from "../src/generated/prisma/client.ts";

// Seed de desarrollo/e2e — idempotente (upsert por clave de negocio).
// Datos ficticios: ningún CPF/nombre corresponde a una persona real.

/** Completa un CPF de 9 dígitos con sus DV — delega en la utilidad de dominio. */
export function cpfComDv(base9: string): string {
  return completaDv(base9);
}

const HOJE = 20260924;
const USR = "SEED";

export const PROGRAMAS_SEED = [
  {
    codPrograma: "PA01",
    nomePrograma: "AUXILIO ALIMENTACAO FAMILIAR",
    siglaPrograma: "AAF",
    tipoPrograma: "A",
    dtCriacao: 20200101,
    vlrBaseIndividual: 15000,
    fatorReajuste: "0.0450",
    fatorK: "1.000000",
    codElegibilidade: "RD",
    rendaMaxPercap: 21800,
    idadeMin: 0,
    idadeMax: 0,
  },
  {
    codPrograma: "PP01",
    nomePrograma: "PROGRAMA PERMANENTE DE RENDA BASICA",
    siglaPrograma: "PPRB",
    tipoPrograma: "P",
    dtCriacao: 20180315,
    vlrBaseIndividual: 60000,
    fatorReajuste: "0.0500",
    fatorK: "1.050000",
    codElegibilidade: "R",
    rendaMaxPercap: 50000,
    idadeMin: 18,
    idadeMax: 0,
  },
  {
    codPrograma: "PT01",
    nomePrograma: "AUXILIO TEMPORARIO EMERGENCIAL",
    siglaPrograma: "ATE",
    tipoPrograma: "T",
    dtCriacao: 20250601,
    vlrBaseIndividual: 30000,
    fatorReajuste: "0.0000",
    fatorK: "1.000000",
    codElegibilidade: null,
    rendaMaxPercap: 0,
    idadeMin: 16,
    idadeMax: 65,
  },
] as const;

export const BENEFICIARIOS_SEED = [
  // CPF com zero à esquerda (preserva D7).
  { base: "012345678", nome: "MARIA APARECIDA DA SILVA", sit: "A", programa: "PA01", dtNasc: 19850412, sexo: "F", regiao: 1, renda: 120000, nis: "10000000001" },
  { base: "123456780", nome: "JOSE CARLOS PEREIRA", sit: "S", programa: "PP01", dtNasc: 19700130, sexo: "M", regiao: 3, renda: 90000, nis: null },
  { base: "234567891", nome: "ANA PAULA SOUZA", sit: "C", programa: "PT01", dtNasc: 19951120, sexo: "F", regiao: 5, renda: 45000, nis: "10000000003" },
  { base: "345678902", nome: "FRANCISCO DAS CHAGAS LIMA", sit: "I", programa: "PA01", dtNasc: 19600705, sexo: "M", regiao: 99, renda: 30000, nis: null },
  { base: "456789013", nome: "LUCIA HELENA OLIVEIRA", sit: "D", programa: "PP01", dtNasc: 19781203, sexo: "F", regiao: 12, renda: 150000, nis: null },
] as const;

export async function seed(prisma: PrismaClient): Promise<void> {
  for (const p of PROGRAMAS_SEED) {
    const data = {
      ...p,
      sitPrograma: "A",
      dtEncerramento: 0,
      tiposDescontoAplic: "C,I,J",
      dtInclusao: HOJE,
      usrInclusao: USR,
      dtUltAlteracao: HOJE,
      usrUltAlteracao: USR,
    };
    await prisma.programaSocial.upsert({
      where: { codPrograma: p.codPrograma },
      create: data,
      update: data,
    });
  }

  // Grupos periódicos de ejemplo (tramo de cálculo y parámetro regional del programa P).
  const pp01 = await prisma.programaSocial.findUniqueOrThrow({ where: { codPrograma: "PP01" } });
  const faixa = {
    rendaInicio: 0,
    rendaFim: 25000,
    vlrAdicional: 5000,
    fatorMultiplicador: "1.1000",
    indAcumulativo: "N",
  };
  await prisma.programaFaixaCalculo.upsert({
    where: { programaId_occurrence: { programaId: pp01.id, occurrence: 1 } },
    create: { programaId: pp01.id, occurrence: 1, ...faixa },
    update: faixa,
  });
  const regional = { codRegiao: 1, fatorRegional: "1.0500", vlrComplementoReg: 1000, indAtivoRegiao: "S" };
  await prisma.programaParamRegional.upsert({
    where: { programaId_occurrence: { programaId: pp01.id, occurrence: 1 } },
    create: { programaId: pp01.id, occurrence: 1, ...regional },
    update: regional,
  });

  for (const b of BENEFICIARIOS_SEED) {
    const numCpf = cpfComDv(b.base);
    const data = {
      numCpf,
      nis: b.nis,
      nomeCompleto: b.nome,
      dtNascimento: b.dtNasc,
      sexo: b.sexo,
      codRegiao: b.regiao,
      codPrograma: b.programa,
      dtCadastro: 20250101,
      dtInicioBenef: 20250201,
      sitBeneficiario: b.sit,
      dtUltSituacao: 20250101,
      vlrRendaFamiliar: b.renda,
      qtdMembrosFamilia: 3,
      documentosOk: "S",
      municipio: "SAO PAULO",
      uf: "SP",
      dtInclusao: HOJE,
      hrInclusao: 120000,
      usrInclusao: USR,
      dtUltAlteracao: HOJE,
      hrUltAlteracao: 120000,
      usrUltAlteracao: USR,
    };
    await prisma.beneficiario.upsert({ where: { numCpf }, create: data, update: data });
  }

  // Dependiente y descuento registrado de ejemplo para el beneficiario activo.
  const ativo = await prisma.beneficiario.findUniqueOrThrow({
    where: { numCpf: cpfComDv(BENEFICIARIOS_SEED[0].base) },
  });
  const dependente = {
    nomeDependente: "PEDRO DA SILVA",
    dtNascDepend: 20150310,
    parentesco: "FI",
    sexoDependente: "M",
    sitDependente: "A",
    indDeficiencia: "N",
  };
  await prisma.beneficiarioDependente.upsert({
    where: { beneficiarioId_occurrence: { beneficiarioId: ativo.id, occurrence: 1 } },
    create: { beneficiarioId: ativo.id, occurrence: 1, ...dependente },
    update: dependente,
  });
  const desconto = { tipoDesconto: "J", vlrDesconto: 2500, pctDesconto: "0.00", dtInicioDsct: 20250301, dtFimDsct: 0, numProcesso: "0001234-56.2025" };
  await prisma.beneficiarioDesconto.upsert({
    where: { beneficiarioId_occurrence: { beneficiarioId: ativo.id, occurrence: 1 } },
    create: { beneficiarioId: ativo.id, occurrence: 1, ...desconto },
    update: desconto,
  });
  await prisma.beneficiario.update({ where: { id: ativo.id }, data: { numDependentes: 1 } });
}

async function main(): Promise<void> {
  const { prisma } = await import("../src/server/db.ts");
  try {
    await seed(prisma);
    const [programas, beneficiarios] = await Promise.all([
      prisma.programaSocial.count(),
      prisma.beneficiario.count(),
    ]);
    console.log(`Seed concluído: ${programas} programas, ${beneficiarios} beneficiários.`);
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err: unknown) => {
    console.error("Falha no seed:", err instanceof Error ? err.message : err);
    process.exit(1);
  });
}

import type { PrismaClient } from "@/generated/prisma/client";
import {
  camposImutaveisAlterados,
  decidirOperacao,
  MENSAGENS_CADBENEF,
  MENSAGENS_SISTEMA,
  mensagemCampoNaoEditavel,
  statusResultante,
  type AlteracaoBeneficiario,
  type InclusaoBeneficiario,
} from "@/domain/beneficiario/cadastro";
import { anoDe, hoje } from "@/domain/legacyDate";
import { MENSAGENS_PROGRAMA } from "@/domain/programa";
import { QUIRKS_PADRAO, type Quirks } from "@/domain/quirks";
import { prisma } from "@/server/db";

// Casos de uso de beneficiarios (CADBENEF). Orquesta dominio + Prisma, sin lógica
// de negocio propia. CADBENEF no registra auditoría: aquí no se llama a registrarEvento.

export const TAMANHO_PAGINA = 10;

export type Falha = { ok: false; mensagem: string };
export type Sucesso = { ok: true; mensagem: string; numCpf: string; status: string; suspensoPorIdade: boolean; numVersao: number };
export type Resultado = Sucesso | Falha;

function usuarioOperativo(): string {
  const u = process.env.SIFAP_USER?.trim();
  if (!u) throw new Error("usuário operativo não informado (SIFAP_USER)");
  return u.slice(0, 8);
}

function falha(mensagem: string): Falha {
  return { ok: false, mensagem };
}

export async function listarBeneficiarios(
  { q = "", pagina = 1 }: { q?: string; pagina?: number } = {},
  db: PrismaClient = prisma,
) {
  const termo = q.trim();
  const digitos = termo.replace(/\D/g, "");
  // CPF solo por coincidencia exacta de 11 dígitos (admite máscara): una búsqueda
  // parcial, junto con la máscara de la lista, permitiría enumerar CPFs (LGPD).
  // Si no, por nombre: en SQLite `contains` = LIKE, que no distingue mayúsculas en ASCII.
  const cpfExato = digitos.length === 11 && /^[\d.\-\s]+$/.test(termo);
  const where = !termo ? {} : cpfExato ? { numCpf: { equals: digitos } } : { nomeCompleto: { contains: termo.toUpperCase() } };
  const total = await db.beneficiario.count({ where });
  const totalPaginas = Math.max(1, Math.ceil(total / TAMANHO_PAGINA));
  const atual = Math.min(Math.max(1, Math.trunc(pagina) || 1), totalPaginas);
  const itens = await db.beneficiario.findMany({
    where,
    orderBy: [{ nomeCompleto: "asc" }, { numCpf: "asc" }],
    skip: (atual - 1) * TAMANHO_PAGINA,
    take: TAMANHO_PAGINA,
    select: {
      numCpf: true,
      nomeCompleto: true,
      codPrograma: true,
      sitBeneficiario: true,
      codRegiao: true,
      numDependentes: true,
    },
  });
  return { itens, total, pagina: atual, totalPaginas };
}

/** Opciones del `Select` de programas (código – nombre). */
export async function listarOpcoesProgramas(db: PrismaClient = prisma) {
  return db.programaSocial.findMany({
    orderBy: { codPrograma: "asc" },
    select: { codPrograma: true, nomePrograma: true },
  });
}

export async function obterBeneficiario(numCpf: string, db: PrismaClient = prisma) {
  if (!/^\d{11}$/.test(numCpf)) return null;
  return db.beneficiario.findUnique({ where: { numCpf } });
}

function ehUnicoViolado(e: unknown): boolean {
  return (e as { code?: string }).code === "P2002";
}

/** `quirks`: flags LEGACY-QUIRK (D5); por defecto, legado (QUIRKS_PADRAO); la acción/página lee el entorno y los pasa. */
export async function incluirBeneficiario(
  dados: InclusaoBeneficiario,
  db: PrismaClient = prisma,
  quirks: Quirks = QUIRKS_PADRAO,
): Promise<Resultado> {
  const existente = dados.numCpf
    ? await db.beneficiario.findUnique({ where: { numCpf: dados.numCpf }, select: { id: true } })
    : null;
  const decisao = decidirOperacao("I", dados, existente !== null);
  if (!decisao.ok) return falha(decisao.mensagem);

  const programa = await db.programaSocial.findUnique({ where: { codPrograma: dados.codPrograma }, select: { id: true } });
  if (!programa) return falha(MENSAGENS_PROGRAMA.naoEncontrado);
  if (dados.nis && (await db.beneficiario.findUnique({ where: { nis: dados.nis }, select: { id: true } }))) {
    return falha(MENSAGENS_SISTEMA.nisDuplicado);
  }

  const agora = hoje();
  const { status, suspensoPorIdade } = statusResultante("I", dados.dtNascimento, anoDe(agora.data), undefined, quirks);
  const usuario = usuarioOperativo();
  try {
    await db.beneficiario.create({
      data: {
        numCpf: dados.numCpf,
        nis: dados.nis,
        nomeCompleto: dados.nomeCompleto,
        dtNascimento: dados.dtNascimento,
        sexo: dados.sexo,
        rgNumero: dados.rgNumero,
        logradouro: dados.logradouro,
        municipio: dados.municipio,
        uf: dados.uf,
        cep: dados.cep,
        telFixo: dados.telFixo,
        codRegiao: dados.codRegiao,
        codPrograma: dados.codPrograma,
        dtCadastro: agora.data,
        sitBeneficiario: status,
        vlrRendaFamiliar: dados.vlrRendaFamiliar,
        numDependentes: dados.numDependentes,
        dtInclusao: agora.data,
        hrInclusao: agora.hora,
        usrInclusao: usuario,
        dtUltAlteracao: agora.data,
        hrUltAlteracao: agora.hora,
        usrUltAlteracao: usuario,
      },
    });
  } catch (e) {
    // Carrera entre la verificación y el insert: la restricción única decide.
    if (ehUnicoViolado(e)) {
      const cpfExiste = await db.beneficiario.findUnique({ where: { numCpf: dados.numCpf }, select: { id: true } });
      return falha(cpfExiste ? MENSAGENS_CADBENEF.jaCadastrado : MENSAGENS_SISTEMA.nisDuplicado);
    }
    throw e;
  }
  return { ok: true, mensagem: MENSAGENS_CADBENEF.incluidoSucesso, numCpf: dados.numCpf, status, suspensoPorIdade, numVersao: 1 };
}

/** `quirks`: flags LEGACY-QUIRK (D5 y D18); por defecto, legado (QUIRKS_PADRAO); la acción/página lee el entorno y los pasa. */
export async function alterarBeneficiario(
  dados: AlteracaoBeneficiario,
  db: PrismaClient = prisma,
  quirks: Quirks = QUIRKS_PADRAO,
): Promise<Resultado> {
  const registrado = dados.numCpf ? await db.beneficiario.findUnique({ where: { numCpf: dados.numCpf } }) : null;
  const decisao = decidirOperacao("A", dados, registrado !== null);
  if (!decisao.ok || !registrado) return falha(decisao.ok ? MENSAGENS_CADBENEF.naoEncontradoAlteracao : decisao.mensagem);

  // CPF, nacimiento, sexo, programa, región y NIS son inmutables: el servidor rechaza cambios.
  const alterados = camposImutaveisAlterados(registrado, dados);
  if (alterados.length) return falha(mensagemCampoNaoEditavel(alterados));

  const agora = hoje();
  // D5 (suspensión por edad) y D18 (status en blanco) los decide el dominio con `quirks`.
  const { status, suspensoPorIdade } = statusResultante("A", registrado.dtNascimento, anoDe(agora.data), dados.sitBeneficiario, quirks);
  // Control optimista: solo graba si la versión leída sigue vigente.
  const r = await db.beneficiario.updateMany({
    where: { numCpf: registrado.numCpf, numVersao: dados.numVersao },
    data: {
      nomeCompleto: dados.nomeCompleto,
      logradouro: dados.logradouro,
      municipio: dados.municipio,
      uf: dados.uf,
      cep: dados.cep,
      telFixo: dados.telFixo,
      rgNumero: dados.rgNumero,
      sitBeneficiario: status,
      vlrRendaFamiliar: dados.vlrRendaFamiliar,
      numDependentes: dados.numDependentes,
      dtUltAlteracao: agora.data,
      hrUltAlteracao: agora.hora,
      usrUltAlteracao: usuarioOperativo(),
      numVersao: { increment: 1 },
    },
  });
  if (r.count === 0) return falha(MENSAGENS_SISTEMA.versaoDesatualizada);
  return {
    ok: true,
    mensagem: MENSAGENS_CADBENEF.alteradoSucesso,
    numCpf: registrado.numCpf,
    status,
    suspensoPorIdade,
    numVersao: dados.numVersao + 1,
  };
}

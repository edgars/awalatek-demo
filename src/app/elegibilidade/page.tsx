import type { Metadata } from "next";
import { ResultadoLegado } from "@/components/campos";
import { mascaraCpfLista } from "@/domain/cpf";
import { MENSAGENS_VALELEG } from "@/domain/elegibilidade";
import { listarOpcoesProgramas, resolverCpfPorChave } from "@/server/beneficiarios";
import { FormElegibilidade } from "./_componentes/FormElegibilidade";
import { ERRO_INESPERADO, registrarFalha } from "@/lib/falhas";

export const metadata: Metadata = { title: "Elegibilidade" };

/** Programas do `Select`; em falha, lista vazia + aviso (só tipo/código no log, NFR-04). */
async function carregarProgramas(): Promise<{ programas: Awaited<ReturnType<typeof listarOpcoesProgramas>>; falhou: boolean }> {
  try {
    return { programas: await listarOpcoesProgramas(), falhou: false };
  } catch (e) {
    registrarFalha("elegibilidade", "lista de programas", e);
    return { programas: [], falhou: true };
  }
}

function param(v: string | string[] | undefined): string {
  return typeof v === "string" ? v : "";
}

/** Pantalla 4.11 — Elegibilidade (VALELEG): CPF + programa → ELEGÍVEL / NÃO ELEGÍVEL. */
export default async function ElegibilidadePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const { programas, falhou } = await carregarProgramas();
  // Atalho: beneficiário (e programa) pré-preenchidos por query string. H2 (LGPD): o
  // beneficiário vem pela chave opaca (`?benef=`), nunca pelo CPF; o CPF é resolvido aqui.
  const benef = param(sp.benef);
  const resolvido = benef ? await resolverCpfPorChave(benef, "elegibilidade (chave)") : null;
  const cpf = resolvido?.ok ? resolvido.valor : null;
  // Chave malformada ou inexistente → a mesma mensagem literal de VALELEG (como em /consulta).
  const naoEncontrado = resolvido?.ok === true && !cpf;
  const programa = param(sp.programa).trim().toUpperCase();
  return (
    <div className="grid gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Elegibilidade</h1>
        <p className="text-sm text-muted-foreground">
          Verifica se o beneficiário é elegível para o programa e lista todos os motivos de recusa. Nada é gravado.
        </p>
      </div>
      {falhou || resolvido?.ok === false ? <ResultadoLegado variante="erro" mensagens={[ERRO_INESPERADO]} /> : null}
      <FormElegibilidade
        programas={programas}
        // LGPD: o campo CPF fica vazio; só o CPF mascarado aparece no aviso de filtro.
        filtro={cpf ? { benef, cpfMascarado: mascaraCpfLista(cpf) } : null}
        programaInicial={programas.some((p) => p.codPrograma === programa) ? programa : ""}
        inicial={naoEncontrado ? { ok: true, resultado: { tipo: "precondicao", mensagem: MENSAGENS_VALELEG.beneficiarioNaoEncontrado } } : null}
      />
    </div>
  );
}

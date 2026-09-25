import type { Metadata } from "next";
import Link from "next/link";
import { ResultadoLegado } from "@/components/campos";
import { MENSAGENS_CADBENEF, MENSAGENS_SISTEMA, statusResultante } from "@/domain/beneficiario/cadastro";
import { anoDe, hoje } from "@/domain/legacyDate";
import { listarOpcoesProgramas, obterBeneficiario, resolverCpfPorChave } from "@/server/beneficiarios";
import { ERRO_INESPERADO } from "@/lib/falhas";
import { lerQuirksServidor } from "@/server/quirksConfig";
import { alterarBeneficiarioAction } from "../../actions";
import { FormBeneficiario } from "../../_componentes/FormBeneficiario";

export const metadata: Metadata = { title: "Alterar beneficiário" };

type Props = { params: Promise<{ chave: string }> };

/** Pantalla 4.5 — alteração de beneficiário (operação A do legado). */
export default async function EditarBeneficiarioPage({ params }: Props) {
  // H2 (LGPD): a URL traz a chave opaca; o CPF é resolvido no servidor (chave inválida → não encontrado).
  const { chave } = await params;
  // Falha da base ao resolver a chave → painel de erro genérico (log só tipo/código).
  const resolvido = await resolverCpfPorChave(chave, "alteração (chave)");
  const cpf = resolvido.ok ? (resolvido.valor ?? "") : "";
  // LEGACY-QUIRK(D18): el flag decide si la pantalla ofrece el select de situación.
  const quirks = lerQuirksServidor("beneficiarios");
  if (!quirks || !resolvido.ok) {
    return (
      <div className="grid gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">Alterar beneficiário</h1>
        <ResultadoLegado variante="erro" mensagens={[ERRO_INESPERADO]} />
      </div>
    );
  }
  const [b, programas] = await Promise.all([obterBeneficiario(cpf), listarOpcoesProgramas()]);

  if (!b) {
    return (
      <div className="grid gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">Alterar beneficiário</h1>
        <ResultadoLegado variante="erro" mensagens={[MENSAGENS_CADBENEF.naoEncontradoAlteracao]}>
          <Link href="/beneficiarios" className="font-medium text-primary underline underline-offset-4">
            Voltar para a lista
          </Link>
        </ResultadoLegado>
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Alterar beneficiário</h1>
        <p className="text-sm text-muted-foreground">Cadastro de beneficiário — alteração.</p>
      </div>
      <FormBeneficiario
        acao={alterarBeneficiarioAction.bind(null, b.chavePublica)}
        programas={programas}
        statusBrancoAlteracao={quirks.statusBrancoAlteracao}
        avisoStatusAlteracao={
          // LEGACY-QUIRK(D18): avisa qué se grabará (en blanco, o S por edad > 75 si D5 es legado).
          quirks.statusBrancoAlteracao
            ? statusResultante("A", b.dtNascimento, anoDe(hoje().data), undefined, quirks).status === "S"
              ? MENSAGENS_SISTEMA.statusSuspensoD18
              : MENSAGENS_SISTEMA.statusBrancoD18
            : null
        }
        inicial={{
          numCpf: b.numCpf,
          nomeCompleto: b.nomeCompleto,
          dtNascimento: b.dtNascimento,
          sexo: b.sexo,
          logradouro: b.logradouro,
          municipio: b.municipio,
          uf: b.uf,
          cep: b.cep,
          telFixo: b.telFixo,
          rgNumero: b.rgNumero,
          codPrograma: b.codPrograma,
          vlrRendaFamiliar: b.vlrRendaFamiliar,
          numDependentes: b.numDependentes,
          codRegiao: b.codRegiao,
          nis: b.nis,
          sitBeneficiario: b.sitBeneficiario,
          numVersao: b.numVersao,
        }}
      />
    </div>
  );
}

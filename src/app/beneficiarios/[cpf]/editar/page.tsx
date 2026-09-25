import type { Metadata } from "next";
import Link from "next/link";
import { ResultadoLegado } from "@/components/campos";
import { MENSAGENS_CADBENEF } from "@/domain/beneficiario/cadastro";
import { listarOpcoesProgramas, obterBeneficiario } from "@/server/beneficiarios";
import { alterarBeneficiarioAction } from "../../actions";
import { FormBeneficiario } from "../../_componentes/FormBeneficiario";

export const metadata: Metadata = { title: "Alterar beneficiário" };

type Props = { params: Promise<{ cpf: string }> };

/** Pantalla 4.5 — alteração de beneficiário (operação A do legado). */
export default async function EditarBeneficiarioPage({ params }: Props) {
  const { cpf: bruto } = await params;
  let cpf = bruto;
  try {
    cpf = decodeURIComponent(bruto);
  } catch {
    // escape malformado → valor bruto → não encontrado
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
        acao={alterarBeneficiarioAction.bind(null, b.numCpf)}
        programas={programas}
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

import type { Metadata } from "next";
import Link from "next/link";
import { ResultadoLegado } from "@/components/campos";
import {
  dataGravadaParaFormulario,
  fatorGravadoParaFormulario,
  tipoGravadoParaFormulario,
  validarAlteracaoSituacao,
} from "@/domain/programa";
import { consultarPrograma } from "@/server/programas";
import { alterarProgramaAction } from "../../actions";
import { FormInclusao } from "../../_componentes/FormInclusao";
import { decodificarSegmento } from "../../rota";

type Props = { params: Promise<{ cod: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { cod } = await params;
  return { title: `Alterar programa ${decodificarSegmento(cod).toUpperCase()}` };
}

function Erro({ mensagem, cod }: { mensagem: string; cod?: string }) {
  return (
    <div className="grid gap-4">
      <h1 className="text-2xl font-semibold tracking-tight">Alterar programa</h1>
      <ResultadoLegado variante="erro" mensagens={[mensagem]}>
        <Link href={cod ? `/programas/${cod}` : "/programas"} className="font-medium text-primary underline underline-offset-4">
          {cod ? `Voltar para o programa ${cod}` : "Voltar para a lista"}
        </Link>
      </ResultadoLegado>
    </div>
  );
}

/**
 * Pantalla 4.3a — alteración de programa (story 1.2). Funcionalidad nueva, fuera del
 * legado (CADPROG solo tiene I y C). El código es inmutable; programa encerrado (E) no se altera.
 */
export default async function EditarProgramaPage({ params }: Props) {
  const { cod: codBruto } = await params;
  const r = await consultarPrograma(decodificarSegmento(codBruto));
  if (!r.ok) return <Erro mensagem={r.mensagem} />;

  const p = r.programa;
  const encerrado = validarAlteracaoSituacao(p.sitPrograma);
  if (encerrado) return <Erro mensagem={encerrado} cod={p.codPrograma} />;

  return (
    <div className="grid gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Alterar programa <span className="font-mono">{p.codPrograma}</span>
        </h1>
        <p className="text-sm text-muted-foreground">Cadastro de programas sociais — alteração dos dados do programa.</p>
      </div>
      <FormInclusao
        alteracao={{
          acao: alterarProgramaAction.bind(null, p.codPrograma),
          // Datos gravados legados o inconsistentes se precargan vacíos (nunca se reenvían inválidos).
          inicial: {
            codPrograma: p.codPrograma,
            nomePrograma: p.nomePrograma,
            tipoPrograma: tipoGravadoParaFormulario(p.tipoPrograma),
            vlrBaseIndividual: p.vlrBaseIndividual,
            codElegibilidade: p.codElegibilidade,
            dtCriacao: dataGravadaParaFormulario(p.dtCriacao),
            dtEncerramento: dataGravadaParaFormulario(p.dtEncerramento),
            rendaMaxPercap: p.rendaMaxPercap,
            idadeMin: p.idadeMin,
            idadeMax: p.idadeMax,
            fatorReajuste: fatorGravadoParaFormulario(p.fatorReajuste),
            numVersao: p.numVersao,
          },
        }}
      />
    </div>
  );
}

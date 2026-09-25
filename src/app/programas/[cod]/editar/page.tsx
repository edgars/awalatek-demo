import type { Metadata } from "next";
import Link from "next/link";
import { ResultadoLegado } from "@/components/campos";
import { consultarPrograma } from "@/server/programas";
import { alterarProgramaAction } from "../../actions";
import { FormInclusao } from "../../_componentes/FormInclusao";

type Props = { params: Promise<{ cod: string }> };

/** Decodifica el segmento; con escapes malformados usa el valor bruto → "PROGRAMA NAO ENCONTRADO". */
function decodificar(cod: string): string {
  try {
    return decodeURIComponent(cod);
  } catch {
    return cod;
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { cod } = await params;
  return { title: `Alterar programa ${decodificar(cod).toUpperCase()}` };
}

/**
 * Pantalla 4.3a — alteración de programa (story 1.2). Funcionalidad nueva, fuera del
 * legado (CADPROG solo tiene I y C). El código es inmutable.
 */
export default async function EditarProgramaPage({ params }: Props) {
  const { cod: codBruto } = await params;
  const r = await consultarPrograma(decodificar(codBruto));

  if (!r.ok) {
    return (
      <div className="grid gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">Alterar programa</h1>
        <ResultadoLegado variante="erro" mensagens={[r.mensagem]}>
          <Link href="/programas" className="font-medium text-primary underline underline-offset-4">
            Voltar para a lista
          </Link>
        </ResultadoLegado>
      </div>
    );
  }

  const p = r.programa;
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
          inicial: {
            codPrograma: p.codPrograma,
            nomePrograma: p.nomePrograma,
            tipoPrograma: p.tipoPrograma,
            vlrBaseIndividual: p.vlrBaseIndividual,
            codElegibilidade: p.codElegibilidade,
            dtCriacao: p.dtCriacao,
            dtEncerramento: p.dtEncerramento,
            rendaMaxPercap: p.rendaMaxPercap,
            idadeMin: p.idadeMin,
            idadeMax: p.idadeMax,
            fatorReajuste: p.fatorReajuste,
            numVersao: p.numVersao,
          },
        }}
      />
    </div>
  );
}

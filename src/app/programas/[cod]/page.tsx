import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { ResultadoLegado } from "@/components/campos";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { intParaData } from "@/domain/legacyDate";
import { formatarReais } from "@/domain/money";
import {
  MAX_FAIXAS,
  MAX_PARAMS_REGIONAIS,
  ROTULOS_SITUACAO,
  ROTULOS_TIPO,
  validarOperacao,
  type TipoPrograma,
} from "@/domain/programa";
import { consultarPrograma } from "@/server/programas";
import { alterarSituacaoProgramaAction, salvarFaixasAction, salvarParamsRegionaisAction } from "../actions";
import { EditorGrupo, type ColunaGrupo } from "../_componentes/EditorGrupo";
import { SituacaoPrograma } from "../_componentes/SituacaoPrograma";
import { decodificarSegmento } from "../rota";

type Props = { params: Promise<{ cod: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { cod } = await params;
  return { title: `Programa ${decodificarSegmento(cod).toUpperCase()}` };
}

const COLUNAS_FAIXAS: readonly ColunaGrupo[] = [
  { campo: "rendaInicio", titulo: "Renda início", tipo: "moeda" },
  { campo: "rendaFim", titulo: "Renda fim", tipo: "moeda" },
  { campo: "fatorMultiplicador", titulo: "Fator multiplicador", tipo: "fator" },
  { campo: "vlrAdicional", titulo: "Valor adicional", tipo: "moeda" },
  { campo: "indAcumulativo", titulo: "Acumulativo", tipo: "sn" },
];

const COLUNAS_PARAMS: readonly ColunaGrupo[] = [
  { campo: "codRegiao", titulo: "Código região", tipo: "codigo2" },
  { campo: "fatorRegional", titulo: "Fator regional", tipo: "fator" },
  { campo: "vlrComplementoReg", titulo: "Complemento", tipo: "moeda" },
  { campo: "indAtivoRegiao", titulo: "Ativo", tipo: "sn" },
];

function dataOuTraco(dt: number, vazio = "—"): string {
  const iso = intParaData(dt);
  if (!iso) return vazio;
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}

function Item({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <div className="grid gap-0.5">
      <dt className="text-xs text-muted-foreground">{rotulo}</dt>
      <dd className="text-sm font-medium">{children}</dd>
    </div>
  );
}

/**
 * Pantalla 4.3 — consulta de programa (operación C del legado) + grupos. Editar y
 * desativar/reativar (story 1.2) son funcionalidad nueva; nunca se excluye.
 */
export default async function ProgramaPage({ params }: Props) {
  const { cod: codBruto } = await params;
  const cod = decodificarSegmento(codBruto);
  const op = validarOperacao("C");
  const r = op.ok ? await consultarPrograma(cod) : { ok: false as const, mensagem: op.mensagem };

  if (!r.ok) {
    return (
      <div className="grid gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">Consulta de programa</h1>
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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">
          Programa <span className="font-mono">{p.codPrograma}</span>
        </h1>
        <Button asChild variant="outline">
          <Link href="/programas">Voltar</Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Dados do programa</CardTitle>
          <SituacaoPrograma
            codPrograma={p.codPrograma}
            sitPrograma={p.sitPrograma}
            numVersao={p.numVersao}
            acao={alterarSituacaoProgramaAction.bind(null, p.codPrograma)}
          />
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Item rotulo="Código">
              <span className="valor font-mono">{p.codPrograma}</span>
            </Item>
            <Item rotulo="Nome">{p.nomePrograma}</Item>
            <Item rotulo="Tipo">
              {p.tipoPrograma} — {ROTULOS_TIPO[p.tipoPrograma as TipoPrograma] ?? p.tipoPrograma}
            </Item>
            <Item rotulo="Valor base (ajustado pelo fator K)">
              <span className="valor">{formatarReais(p.vlrBaseIndividual)}</span>
            </Item>
            <Item rotulo="Código de elegibilidade">
              <span className="font-mono">{p.codElegibilidade || "—"}</span>
            </Item>
            <Item rotulo="Situação">
              <Badge variant={p.sitPrograma === "A" ? "success" : "secondary"}>
                {p.sitPrograma} — {ROTULOS_SITUACAO[p.sitPrograma] ?? p.sitPrograma}
              </Badge>
            </Item>
            <Item rotulo="Fator de reajuste">
              <span className="valor">{p.fatorReajuste.replace(".", ",")}</span>
            </Item>
            <Item rotulo="Fator K">
              <span className="valor">{p.fatorK.replace(".", ",")}</span>
            </Item>
            <Item rotulo="Vigência">
              <span className="valor">
                {dataOuTraco(p.dtCriacao)} a {dataOuTraco(p.dtEncerramento, "indeterminado")}
              </span>
            </Item>
            <Item rotulo="Renda máxima per capita">
              <span className="valor">{p.rendaMaxPercap ? formatarReais(p.rendaMaxPercap) : "sem limite"}</span>
            </Item>
            <Item rotulo="Idade mínima / máxima">
              <span className="valor">
                {p.idadeMin || "sem limite"} / {p.idadeMax || "sem limite"}
              </span>
            </Item>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="grid gap-1">
            <CardTitle>Faixas de cálculo</CardTitle>
            <CardDescription>Máximo de {MAX_FAIXAS} faixas.</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <EditorGrupo
            idGrupo="faixas"
            rotuloLinha="Faixa"
            rotuloGravar="Gravar faixas"
            colunas={COLUNAS_FAIXAS}
            maximo={MAX_FAIXAS}
            acao={salvarFaixasAction.bind(null, p.codPrograma)}
            linhasIniciais={p.faixasCalculo.map((f) => ({
              rendaInicio: f.rendaInicio,
              rendaFim: f.rendaFim,
              fatorMultiplicador: f.fatorMultiplicador,
              vlrAdicional: f.vlrAdicional,
              indAcumulativo: f.indAcumulativo,
            }))}
            novaLinha={{ rendaInicio: 0, rendaFim: 0, fatorMultiplicador: "1.0000", vlrAdicional: 0, indAcumulativo: "N" }}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="grid gap-1">
            <CardTitle>Parâmetros regionais</CardTitle>
            <CardDescription>Máximo de {MAX_PARAMS_REGIONAIS} parâmetros.</CardDescription>
          </div>
          {/* LEGACY-QUIRK(D1): el cálculo usa las tablas fijas del legado, no estos parámetros. */}
          <Badge variant="warning">Parâmetros informativos — o cálculo usa as tabelas legadas (D1)</Badge>
        </CardHeader>
        <CardContent>
          <EditorGrupo
            idGrupo="params"
            rotuloLinha="Parâmetro"
            rotuloGravar="Gravar parâmetros"
            colunas={COLUNAS_PARAMS}
            maximo={MAX_PARAMS_REGIONAIS}
            acao={salvarParamsRegionaisAction.bind(null, p.codPrograma)}
            linhasIniciais={p.paramsRegionais.map((x) => ({
              codRegiao: x.codRegiao,
              fatorRegional: x.fatorRegional,
              vlrComplementoReg: x.vlrComplementoReg,
              indAtivoRegiao: x.indAtivoRegiao,
            }))}
            novaLinha={{ codRegiao: "", fatorRegional: "1.0000", vlrComplementoReg: 0, indAtivoRegiao: "S" }}
          />
        </CardContent>
      </Card>
    </div>
  );
}

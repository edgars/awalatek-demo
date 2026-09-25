import type { Metadata } from "next";
import Link from "next/link";
import { ResultadoLegado } from "@/components/campos";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { descricaoSituacaoBeneficiario } from "@/domain/beneficiario/cadastro";
import {
  MAX_DESCONTOS,
  ROTULOS_TIPO_DESCONTO,
  TAMANHO_NUM_PROCESSO,
  TIPOS_DESCONTO,
} from "@/domain/beneficiario/descontosRegistrados";
import { mascaraCpfLista } from "@/domain/cpf";
import { cpfPorChave } from "@/server/beneficiarios";
import { listarDescontosRegistrados } from "@/server/descontosRegistrados";
import { salvarDescontosRegistradosAction } from "./actions";
import { EditorDescontos } from "./EditorDescontos";

export const metadata: Metadata = { title: "Descontos do beneficiário" };

type Props = { params: Promise<{ chave: string }> };

const ERRO_INESPERADO = "Erro inesperado ao processar a solicitação. Tente novamente.";

async function carregar(cpf: string) {
  try {
    return await listarDescontosRegistrados(cpf);
  } catch (e) {
    // Solo el tipo y el código del error: nunca datos personales en el log (NFR-04).
    const nome = e instanceof Error ? e.name : "erro desconhecido";
    const codigo = (e as { code?: unknown } | null)?.code;
    console.error("[descontos] consulta:", nome, typeof codigo === "string" ? codigo : "");
    return { ok: false as const, mensagem: ERRO_INESPERADO };
  }
}

const TIPOS = TIPOS_DESCONTO.map((codigo) => ({ codigo, rotulo: ROTULOS_TIPO_DESCONTO[codigo] }));

/** Pantalla 4.7 — descontos registrados do beneficiário (PE DESCONTOS, D14). */
export default async function DescontosBeneficiarioPage({ params }: Props) {
  // H2 (LGPD): a URL traz a chave opaca; o CPF é resolvido no servidor (chave inválida → não encontrado).
  const { chave } = await params;
  const cpf = (await cpfPorChave(chave)) ?? "";
  const r = await carregar(cpf);

  if (!r.ok) {
    return (
      <div className="grid gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">Descontos do beneficiário</h1>
        <ResultadoLegado variante="erro" mensagens={[r.mensagem]}>
          <Link href="/beneficiarios" className="font-medium text-primary underline underline-offset-4">
            Voltar para a lista
          </Link>
        </ResultadoLegado>
      </div>
    );
  }

  const b = r.beneficiario;
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Descontos do beneficiário</h1>
          <p className="text-sm text-muted-foreground">
            {/* LGPD (NFR-04): CPF mascarado. */}
            <span className="valor font-mono">{mascaraCpfLista(b.numCpf)}</span> · {b.nomeCompleto} ·{" "}
            <Badge variant="secondary">
              {descricaoSituacaoBeneficiario(b.sitBeneficiario)}
            </Badge>
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/beneficiarios">Voltar</Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <div className="grid gap-1">
            <CardTitle>Descontos registrados</CardTitle>
            <CardDescription>
              Máximo de {MAX_DESCONTOS} descontos. Entrada do recálculo de descontos do pagamento; o nº do processo é
              obrigatório para desconto judicial (J).
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <EditorDescontos
            acao={salvarDescontosRegistradosAction.bind(null, chave)}
            maximo={MAX_DESCONTOS}
            tipos={TIPOS}
            tamanhoProcesso={TAMANHO_NUM_PROCESSO}
            linhasIniciais={r.descontos.map((d) => ({
              tipoDesconto: d.tipoDesconto,
              vlrDesconto: d.vlrDesconto,
              pctDesconto: d.pctDesconto,
              dtInicioDsct: d.dtInicioDsct,
              dtFimDsct: d.dtFimDsct,
              numProcesso: d.numProcesso ?? "",
              vigenteHoje: d.vigenteHoje,
            }))}
          />
        </CardContent>
      </Card>
    </div>
  );
}

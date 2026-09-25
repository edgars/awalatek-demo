import type { Metadata } from "next";
import Link from "next/link";
import { ResultadoLegado } from "@/components/campos";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ROTULOS_SEXO, ROTULOS_SITUACAO_BENEFICIARIO } from "@/domain/beneficiario/cadastro";
import { MENSAGENS_CADDEPEND, ROTULOS_PARENTESCO, verificarLimite, verificarTitular } from "@/domain/beneficiario/dependentes";
import { mascaraCpfLista } from "@/domain/cpf";
import { corrige } from "@/domain/quirks";
import { listarDependentes } from "@/server/dependentes";
import { lerQuirksServidor } from "@/server/quirksConfig";
import { incluirDependenteAction } from "./actions";
import { InclusaoDependentes } from "./_componentes/InclusaoDependentes";

export const metadata: Metadata = { title: "Dependentes" };

const ERRO_INESPERADO = "Erro inesperado ao processar a solicitação. Tente novamente.";

type Props = { params: Promise<{ cpf: string }> };

function dataBr(dt: number): string {
  if (!dt) return "—";
  const s = String(dt).padStart(8, "0");
  return `${s.slice(6, 8)}/${s.slice(4, 6)}/${s.slice(0, 4)}`;
}

/** Pantalla 4.6 — CADASTRO DE DEPENDENTES (CADDEPEND): lista + inclusión en serie. */
export default async function DependentesPage({ params }: Props) {
  const { cpf: bruto } = await params;
  let cpf = bruto;
  try {
    cpf = decodeURIComponent(bruto);
  } catch {
    // escape malformado → valor bruto → não encontrado
  }
  // D6: el límite de dependientes depende de la configuración (una lectura por solicitud).
  const quirks = lerQuirksServidor("dependentes");
  if (!quirks) {
    return (
      <div className="grid gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">Dependentes</h1>
        <ResultadoLegado variante="erro" mensagens={[ERRO_INESPERADO]} />
      </div>
    );
  }
  const r = await listarDependentes(cpf);

  if (!r) {
    return (
      <div className="grid gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">Dependentes</h1>
        <ResultadoLegado variante="erro" mensagens={[MENSAGENS_CADDEPEND.naoEncontrado]}>
          <Link href="/beneficiarios" className="font-medium text-primary underline underline-offset-4">
            Voltar para a lista
          </Link>
        </ResultadoLegado>
      </div>
    );
  }

  const { titular, dependentes } = r;
  // Antes de cada inclusión: titular C/D (CADDEPEND:56) y límite D6 (CADDEPEND:63). El servidor vuelve a verificar.
  const bloqueio = verificarTitular(titular) ?? verificarLimite(titular.numDependentes, quirks);

  return (
    <div className="grid gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dependentes</h1>
        <p className="text-sm text-muted-foreground">Cadastro de dependentes do titular.</p>
      </div>

      <Card>
        <CardContent>
          <dl className="grid gap-3 text-sm sm:grid-cols-4" aria-label="Titular">
            <div>
              <dt className="text-muted-foreground">CPF</dt>
              {/* LGPD (NFR-04): CPF mascarado. */}
              <dd className="valor font-mono">{mascaraCpfLista(titular.numCpf)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Nome</dt>
              <dd>{titular.nomeCompleto}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Situação</dt>
              <dd>
                <Badge variant={titular.sitBeneficiario === "C" || titular.sitBeneficiario === "D" ? "destructive" : "secondary"}>
                  {titular.sitBeneficiario} — {ROTULOS_SITUACAO_BENEFICIARIO[titular.sitBeneficiario] ?? "Desconhecido"}
                </Badge>
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Total de dependentes</dt>
              <dd className="valor" data-testid="total-dependentes">
                {titular.numDependentes}
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      <div className="overflow-x-auto rounded-md border bg-card">
        <Table aria-label="Dependentes do titular">
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Nascimento</TableHead>
              <TableHead>Parentesco</TableHead>
              <TableHead>CPF</TableHead>
              <TableHead>Documento</TableHead>
              <TableHead>Sexo</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {dependentes.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
                  Nenhum dependente
                </TableCell>
              </TableRow>
            ) : (
              dependentes.map((d) => (
                <TableRow key={d.occurrence}>
                  <TableCell className="whitespace-normal">{d.nomeDependente}</TableCell>
                  <TableCell className="valor">{dataBr(d.dtNascDepend)}</TableCell>
                  <TableCell>
                    {d.parentesco} — {ROTULOS_PARENTESCO[d.parentesco] ?? "Desconhecido"}
                  </TableCell>
                  <TableCell className="valor font-mono">{d.cpfDependente ? mascaraCpfLista(d.cpfDependente) : "—"}</TableCell>
                  <TableCell>{d.docDependente ?? "—"}</TableCell>
                  <TableCell>{d.sexoDependente ? `${d.sexoDependente} — ${ROTULOS_SEXO[d.sexoDependente] ?? ""}` : "—"}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <InclusaoDependentes
        acao={incluirDependenteAction.bind(null, titular.numCpf)}
        bloqueio={bloqueio}
        limiteCorrigido={corrige(quirks, "D6")}
      />
    </div>
  );
}

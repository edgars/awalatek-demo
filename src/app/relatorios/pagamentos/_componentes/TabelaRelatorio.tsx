import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { intParaCompetencia } from "@/domain/legacyDate";
import { formatarReais } from "@/domain/money";
import type { LinhaRelatorio, TotalGeral } from "@/domain/relatorios/pagamentos";

function competenciaTexto(c: number): string {
  try {
    return intParaCompetencia(c) ?? "—";
  } catch {
    return String(c);
  }
}

/** Una página legada de RELPGT: detalles y filas de subtotal por programa (FR-REL-02). */
export function TabelaRelatorio({ linhas, rotulo }: { linhas: readonly LinhaRelatorio[]; rotulo: string }) {
  return (
    <Table aria-label={rotulo} className="text-xs print:text-[9pt]">
      <TableHeader>
        <TableRow>
          <TableHead scope="col">Competência</TableHead>
          <TableHead scope="col">CPF</TableHead>
          <TableHead scope="col">Nome</TableHead>
          <TableHead scope="col">UF</TableHead>
          <TableHead scope="col" className="text-right">
            Bruto
          </TableHead>
          <TableHead scope="col" className="text-right">
            Desconto
          </TableHead>
          <TableHead scope="col" className="text-right">
            Líquido
          </TableHead>
          <TableHead scope="col">Tipo</TableHead>
          <TableHead scope="col">Situação</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {linhas.map((l, i) =>
          l.tipo === "detalhe" ? (
            <TableRow key={`d${l.numPagamento}`}>
              <TableCell className="valor">{competenciaTexto(l.competencia)}</TableCell>
              {/* LGPD: CPF sempre mascarado (***.XXX.XXX-XX, RELPGT). */}
              <TableCell className="valor font-mono">{l.cpfMascarado}</TableCell>
              <TableCell>{l.nome}</TableCell>
              <TableCell>{l.uf}</TableCell>
              <TableCell className="valor text-right">{formatarReais(l.bruto)}</TableCell>
              <TableCell className="valor text-right">{formatarReais(l.desconto)}</TableCell>
              <TableCell className="valor text-right">{formatarReais(l.liquido)}</TableCell>
              <TableCell className="font-mono">{l.tipoDesc}</TableCell>
              <TableCell className="font-mono">{l.statusDesc}</TableCell>
            </TableRow>
          ) : (
            <TableRow key={`s${i}`} data-testid="subtotal-programa" className="bg-muted/60 font-semibold">
              <TableCell colSpan={4} className="font-mono">
                SUBTOTAL PROGRAMA: {l.codPrograma} · QTD: {l.qtd}
              </TableCell>
              <TableCell className="valor text-right">{formatarReais(l.bruto)}</TableCell>
              <TableCell />
              <TableCell className="valor text-right">{formatarReais(l.liquido)}</TableCell>
              <TableCell colSpan={2} />
            </TableRow>
          ),
        )}
      </TableBody>
    </Table>
  );
}

/** Total general y total abono (RELPGT:178–185). */
export function TotalGeralRelatorio({ total }: { total: TotalGeral }) {
  return (
    <dl data-testid="total-geral" className="grid gap-x-6 gap-y-1 rounded-lg border bg-card p-4 font-mono text-sm sm:grid-cols-5">
      <div>
        <dt className="text-xs text-muted-foreground">TOTAL GERAL QTD:</dt>
        <dd className="valor font-semibold">{total.qtd}</dd>
      </div>
      <div>
        <dt className="text-xs text-muted-foreground">BRUTO:</dt>
        <dd className="valor font-semibold">{formatarReais(total.bruto)}</dd>
      </div>
      <div>
        <dt className="text-xs text-muted-foreground">DESC:</dt>
        <dd className="valor font-semibold">{formatarReais(total.desconto)}</dd>
      </div>
      <div>
        <dt className="text-xs text-muted-foreground">LIQ:</dt>
        <dd className="valor font-semibold">{formatarReais(total.liquido)}</dd>
      </div>
      <div>
        <dt className="text-xs text-muted-foreground">TOTAL ABONO:</dt>
        <dd className="valor font-semibold">{formatarReais(total.abono)}</dd>
      </div>
    </dl>
  );
}

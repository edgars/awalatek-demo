import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { intParaData } from "@/domain/legacyDate";
import { ROTULOS_RESUMO_AUDITORIA, type LinhaAuditoria, type ResumoAuditoria, type SaidaAuditoria } from "@/domain/relatorios/auditoria";

/** AAAAMMDD → DD/MM/AAAA; fuera de formato → el entero crudo. */
export function dataTexto(dt: number): string {
  try {
    const iso = intParaData(dt);
    return iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : "—";
  } catch {
    return String(dt);
  }
}

/** Una hoja legada de RELAUDIT (FR-AUD-06): salida T sin descripción; I con descripción. */
export function TabelaAuditoria({ linhas, saida, rotulo }: { linhas: readonly LinhaAuditoria[]; saida: SaidaAuditoria; rotulo: string }) {
  return (
    <Table aria-label={rotulo} className="text-xs print:text-[9pt]">
      <TableHeader>
        <TableRow>
          <TableHead scope="col">Data</TableHead>
          <TableHead scope="col">Hora</TableHead>
          <TableHead scope="col">Usuário</TableHead>
          <TableHead scope="col">Ação</TableHead>
          <TableHead scope="col">Tabela</TableHead>
          <TableHead scope="col">Chave</TableHead>
          {saida === "I" ? <TableHead scope="col">Descrição</TableHead> : null}
        </TableRow>
      </TableHeader>
      <TableBody>
        {linhas.map((l) => (
          <TableRow key={l.numAuditoria}>
            <TableCell className="valor">{dataTexto(l.dtEvento)}</TableCell>
            <TableCell className="valor font-mono">{l.hora}</TableCell>
            <TableCell className="font-mono">{l.usuario}</TableCell>
            <TableCell className="font-mono">{l.acaoDesc}</TableCell>
            <TableCell className="font-mono">{l.tabela}</TableCell>
            <TableCell className="font-mono">{l.chave}</TableCell>
            {saida === "I" ? <TableCell>{l.descricao}</TableCell> : null}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

/** Resumen al pie (RELAUDIT:190–205): los conteos por acción solo cuentan eventos exhibidos. */
export function ResumoAuditoriaBloco({ resumo }: { resumo: ResumoAuditoria }) {
  const R = ROTULOS_RESUMO_AUDITORIA;
  const gerais: [string, number][] = [
    [R.total, resumo.total],
    [R.exibidos, resumo.exibidos],
    [R.filtrados, resumo.filtrados],
  ];
  const porAcao: [string, number][] = [
    [R.inclusao, resumo.porAcao.inclusao],
    [R.alteracao, resumo.porAcao.alteracao],
    [R.consulta, resumo.porAcao.consulta],
    [R.conciliacao, resumo.porAcao.conciliacao],
    [R.divergencia, resumo.porAcao.divergencia],
    [R.outras, resumo.porAcao.outras],
  ];
  const linha = ([rotulo, n]: [string, number]) => (
    <div key={rotulo} className="flex gap-2">
      <dt className="whitespace-pre">{rotulo}</dt>
      <dd className="valor font-semibold">{n}</dd>
    </div>
  );
  return (
    <section data-testid="resumo-auditoria" aria-label="Resumo da auditoria" className="grid gap-2 rounded-lg border bg-card p-4 font-mono text-sm">
      <h2 className="font-semibold">{R.titulo}</h2>
      <dl className="grid gap-0.5">{gerais.map(linha)}</dl>
      <p className="font-semibold">{R.porTipo}</p>
      <dl className="grid gap-0.5">{porAcao.map(linha)}</dl>
    </section>
  );
}

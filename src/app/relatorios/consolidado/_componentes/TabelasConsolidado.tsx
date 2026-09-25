import type { ReactNode } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatarReais } from "@/domain/money";
import type { Consolidado } from "@/domain/relatorios/consolidado";

function Bloco({ id, titulo, children }: { id: string; titulo: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="grid gap-2 break-inside-avoid">
      <h2 id={id} className="text-lg font-semibold tracking-tight">
        {titulo}
      </h2>
      <div className="rounded-lg border bg-card">{children}</div>
    </section>
  );
}

const Num = ({ children }: { children: ReactNode }) => <TableCell className="valor text-right">{children}</TableCell>;
const Col = ({ children }: { children: ReactNode }) => (
  <TableHead scope="col" className="text-right">
    {children}
  </TableHead>
);

/** Bloques de la pantalla 4.19: Por região, Por situação y Totais gerais (BATCHREL:174–197). */
export function TabelasConsolidado({ r }: { r: Consolidado }) {
  return (
    <div className="grid gap-6">
      <Bloco id="bloco-regiao" titulo="Por região">
        <Table aria-labelledby="bloco-regiao">
          <TableHeader>
            <TableRow>
              <TableHead scope="col">Região</TableHead>
              <Col>Qtd</Col>
              <Col>Bruto</Col>
              <Col>Desconto</Col>
              <Col>Líquido</Col>
            </TableRow>
          </TableHeader>
          <TableBody>
            {r.regioes.map((x) => (
              <TableRow key={x.nome}>
                <TableHead scope="row" className="font-mono">
                  {x.nome}
                </TableHead>
                <Num>{x.qtd}</Num>
                <Num>{formatarReais(x.bruto)}</Num>
                <Num>{formatarReais(x.desconto)}</Num>
                <Num>{formatarReais(x.liquido)}</Num>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Bloco>

      <Bloco id="bloco-situacao" titulo="Por situação">
        <Table aria-labelledby="bloco-situacao">
          <TableHeader>
            <TableRow>
              <TableHead scope="col">Situação</TableHead>
              <Col>Qtd</Col>
              <Col>Bruto</Col>
            </TableRow>
          </TableHeader>
          <TableBody>
            {r.status.map((x) => (
              <TableRow key={x.codigo}>
                <TableHead scope="row" className="font-mono">
                  {x.nome}
                </TableHead>
                <Num>{x.qtd}</Num>
                <Num>{formatarReais(x.bruto)}</Num>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Bloco>

      <Bloco id="bloco-totais" titulo="Totais gerais">
        <Table aria-labelledby="bloco-totais">
          <TableHeader>
            <TableRow>
              <TableHead scope="col">Total</TableHead>
              <Col>Qtd</Col>
              <Col>Bruto</Col>
              <Col>Desconto</Col>
              <Col>Líquido</Col>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableHead scope="row" className="font-mono">
                TOTAL GERAL
              </TableHead>
              <Num>{r.total.qtd}</Num>
              <Num>{formatarReais(r.total.bruto)}</Num>
              <Num>{formatarReais(r.total.desconto)}</Num>
              <Num>{formatarReais(r.total.liquido)}</Num>
            </TableRow>
          </TableBody>
        </Table>
      </Bloco>
    </div>
  );
}

import type { ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export type ItemResumo = { rotulo: string; valor: ReactNode };

/**
 * Fin de un proceso (DESIGN §3): título con el mensaje literal del legado y una
 * tarjeta de contadores/totales en pares rótulo → valor (cifras tabulares).
 */
export function ResumoProcesso({ titulo, itens, children }: { titulo: string; itens: readonly ItemResumo[]; children?: ReactNode }) {
  return (
    <Card role="status" aria-live="polite" data-testid="resumo-processo" className="border-success/40">
      <CardHeader>
        <CardTitle className="font-mono text-[0.8125rem] tracking-wide">{titulo}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3">
        <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-1 text-sm">
          {itens.map((i) => (
            <div key={i.rotulo} className="contents">
              <dt className="text-muted-foreground">{i.rotulo}</dt>
              <dd className="valor text-right font-mono tabular-nums sm:text-left">{i.valor}</dd>
            </div>
          ))}
        </dl>
        {children ? <div className="text-sm">{children}</div> : null}
      </CardContent>
    </Card>
  );
}

import type { ReactNode } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export type VarianteResultado = "sucesso" | "erro" | "info";

const VARIANTE = { sucesso: "success", erro: "destructive", info: "default" } as const;
const TITULO_PADRAO: Record<VarianteResultado, string> = { sucesso: "Sucesso", erro: "Erro", info: "Resultado" };

/**
 * Panel de resultado: título + lista numerada de mensajes literales del legado.
 * El estado no depende solo del color (el título lo dice en texto).
 */
export function ResultadoLegado({
  variante,
  titulo,
  mensagens,
  children,
}: {
  variante: VarianteResultado;
  titulo?: string;
  mensagens: readonly string[];
  children?: ReactNode;
}) {
  return (
    <Alert
      variant={VARIANTE[variante]}
      role={variante === "erro" ? "alert" : "status"}
      aria-live="polite"
      data-testid="resultado-legado"
    >
      <AlertTitle>{titulo ?? TITULO_PADRAO[variante]}</AlertTitle>
      <AlertDescription>
        <ol className="list-decimal space-y-0.5 pl-5 font-mono text-[0.8125rem]">
          {mensagens.map((m, i) => (
            <li key={i}>{m}</li>
          ))}
        </ol>
        {children ? <div className="mt-2">{children}</div> : null}
      </AlertDescription>
    </Alert>
  );
}

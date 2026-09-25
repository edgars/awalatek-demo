"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Campo, idsCampo, type PropsCampoBase } from "./campo";
import { centavosParaTexto, textoParaCentavos, valorEnviadoMoeda } from "./conversao";

/**
 * Valor monetario: el operador teclea `1.234,56`; el formulario envía centavos (`Int`).
 * Vacío → 0, o `""` con `vazioComoVazio` (campo opcional: "no informado" ≠ R$ 0,00).
 */
export function Moeda({ defaultValue, vazioComoVazio = false, ...p }: PropsCampoBase & { defaultValue?: number; vazioComoVazio?: boolean }) {
  const [texto, setTexto] = useState(defaultValue != null ? centavosParaTexto(defaultValue) : "");
  const centavos = textoParaCentavos(texto);
  const { id, describedBy } = idsCampo(p);
  return (
    <Campo {...p}>
      <div className="relative">
        <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-muted-foreground">
          R$
        </span>
        <Input
          id={id}
          inputMode="decimal"
          autoComplete="off"
          className="valor pl-9 text-right"
          placeholder="0,00"
          value={texto}
          required={p.required}
          aria-invalid={p.erro || centavos === null ? true : undefined}
          aria-describedby={describedBy}
          onChange={(e) => setTexto(e.target.value)}
          onBlur={() => centavos !== null && texto !== "" && setTexto(centavosParaTexto(centavos))}
        />
      </div>
      <input type="hidden" name={p.name} value={valorEnviadoMoeda(texto, vazioComoVazio)} />
    </Campo>
  );
}

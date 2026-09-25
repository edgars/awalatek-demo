"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Campo, idsCampo, type PropsCampoBase } from "./campo";
import { fatorParaTexto, textoParaFator, VALOR_INVALIDO } from "./conversao";

/** Factor (4 casas) o porcentaje (2 casas): el formulario envía string decimal (`"0.0450"`). */
export function Fator({ defaultValue, casas = 4, ...p }: PropsCampoBase & { defaultValue?: string; casas?: 2 | 4 }) {
  const [texto, setTexto] = useState(defaultValue != null ? fatorParaTexto(defaultValue) : "");
  const valor = textoParaFator(texto, casas);
  const { id, describedBy } = idsCampo(p);
  return (
    <Campo {...p}>
      <Input
        id={id}
        inputMode="decimal"
        autoComplete="off"
        className="valor text-right"
        placeholder={`0,${"0".repeat(casas)}`}
        value={texto}
        required={p.required}
        aria-invalid={p.erro || valor === null ? true : undefined}
        aria-describedby={describedBy}
        onChange={(e) => setTexto(e.target.value)}
        onBlur={() => valor !== null && texto !== "" && setTexto(fatorParaTexto(valor))}
      />
      <input type="hidden" name={p.name} value={valor ?? VALOR_INVALIDO} />
    </Campo>
  );
}

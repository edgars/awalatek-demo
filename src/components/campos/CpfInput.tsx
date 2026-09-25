"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Campo, idsCampo, type PropsCampoBase } from "./campo";
import { mascararCpf, somenteDigitos } from "./conversao";

/**
 * CPF: el operador ve `000.000.000-00`; el formulario envía solo los dígitos
 * (String, ceros a la izquierda). El servidor valida (CADBENEF / módulo 11).
 */
export function CpfInput({ defaultValue, readOnly, ...p }: PropsCampoBase & { defaultValue?: string; readOnly?: boolean }) {
  const [texto, setTexto] = useState(defaultValue ? mascararCpf(defaultValue) : "");
  const { id, describedBy } = idsCampo(p);
  return (
    <Campo {...p}>
      <Input
        id={id}
        inputMode="numeric"
        autoComplete="off"
        className="valor font-mono"
        placeholder="000.000.000-00"
        maxLength={14}
        value={texto}
        readOnly={readOnly}
        aria-readonly={readOnly || undefined}
        required={p.required}
        aria-invalid={p.erro ? true : undefined}
        aria-describedby={describedBy}
        onChange={(e) => setTexto(mascararCpf(e.target.value))}
      />
      <input type="hidden" name={p.name} value={somenteDigitos(texto, 11)} />
    </Campo>
  );
}

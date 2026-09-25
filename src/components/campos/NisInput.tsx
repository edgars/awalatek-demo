"use client";

import { Input } from "@/components/ui/input";
import { Campo, idsCampo, type PropsCampoBase } from "./campo";
import { somenteDigitos } from "./conversao";

/** NIS: 11 dígitos → String(11). Vacío = sin NIS (se graba NULL). */
export function NisInput({ defaultValue, readOnly, ...p }: PropsCampoBase & { defaultValue?: string; readOnly?: boolean }) {
  const { id, describedBy } = idsCampo(p);
  return (
    <Campo {...p}>
      <Input
        id={id}
        name={p.name}
        defaultValue={defaultValue}
        inputMode="numeric"
        autoComplete="off"
        className="valor font-mono"
        placeholder="00000000000"
        maxLength={11}
        pattern="[0-9]{11}"
        readOnly={readOnly}
        aria-readonly={readOnly || undefined}
        required={p.required}
        aria-invalid={p.erro ? true : undefined}
        aria-describedby={describedBy}
        onChange={(e) => {
          const limpo = somenteDigitos(e.target.value, 11);
          if (limpo !== e.target.value) e.target.value = limpo;
        }}
      />
    </Campo>
  );
}

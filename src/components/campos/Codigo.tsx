"use client";

import { Input } from "@/components/ui/input";
import { Campo, idsCampo, type PropsCampoBase } from "./campo";

/**
 * Código de longitud fija (programa 4, región 2). Numérico por defecto;
 * `alfanumerico` admite `[A-Z0-9]` en mayúsculas (código de programa, DDM A4).
 */
export function Codigo({
  tamanho,
  alfanumerico = false,
  defaultValue,
  ...p
}: PropsCampoBase & { tamanho: number; alfanumerico?: boolean; defaultValue?: string }) {
  const { id, describedBy } = idsCampo(p);
  const padrao = alfanumerico ? `[A-Za-z0-9]{1,${tamanho}}` : `[0-9]{1,${tamanho}}`;
  return (
    <Campo {...p}>
      <Input
        id={id}
        name={p.name}
        defaultValue={defaultValue}
        maxLength={tamanho}
        pattern={padrao}
        inputMode={alfanumerico ? "text" : "numeric"}
        autoComplete="off"
        className="valor uppercase"
        style={{ width: `${tamanho + 4}ch` }}
        required={p.required}
        aria-invalid={p.erro ? true : undefined}
        aria-describedby={describedBy}
        onChange={(e) => {
          const limpo = e.target.value.toUpperCase().replace(alfanumerico ? /[^A-Z0-9]/g : /\D/g, "");
          if (limpo !== e.target.value) e.target.value = limpo;
        }}
      />
    </Campo>
  );
}

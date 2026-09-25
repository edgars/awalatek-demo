"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Campo, idsCampo, type PropsCampoBase } from "./campo";
import { dataIntParaIso, isoParaDataInt, VALOR_INVALIDO } from "./conversao";

/** Fecha: selector de fecha; el formulario envía `Int` AAAAMMDD (vacío → 0). */
export function DataLegada({ defaultValue, ...p }: PropsCampoBase & { defaultValue?: number }) {
  const [iso, setIso] = useState(defaultValue ? dataIntParaIso(defaultValue) : "");
  const valor = isoParaDataInt(iso);
  const { id, describedBy } = idsCampo(p);
  return (
    <Campo {...p}>
      <Input
        id={id}
        type="date"
        className="valor"
        value={iso}
        required={p.required}
        aria-invalid={p.erro ? true : undefined}
        aria-describedby={describedBy}
        onChange={(e) => setIso(e.target.value)}
      />
      <input type="hidden" name={p.name} value={valor ?? VALOR_INVALIDO} />
    </Campo>
  );
}

"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Campo, idsCampo, type PropsCampoBase } from "./campo";
import { competenciaIntParaMes, mesParaCompetenciaInt, VALOR_INVALIDO } from "./conversao";

/** Competência: selector mês/ano; el formulario envía `Int` AAAAMM (vacío → ""). */
export function Competencia({ defaultValue, ...p }: PropsCampoBase & { defaultValue?: number }) {
  const [mes, setMes] = useState(defaultValue ? competenciaIntParaMes(defaultValue) : "");
  const valor = mesParaCompetenciaInt(mes);
  const { id, describedBy } = idsCampo(p);
  return (
    <Campo {...p}>
      <Input
        id={id}
        type="month"
        className="valor"
        placeholder="AAAA-MM"
        value={mes}
        required={p.required}
        aria-invalid={p.erro ? true : undefined}
        aria-describedby={describedBy}
        onChange={(e) => setMes(e.target.value)}
      />
      <input type="hidden" name={p.name} value={valor === null ? VALOR_INVALIDO : valor === 0 ? "" : String(valor)} />
    </Campo>
  );
}

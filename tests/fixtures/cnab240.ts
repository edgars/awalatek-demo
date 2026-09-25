// Fixtures CNAB 240 (layout BB de BATCHCON) para los tests unitarios, de servidor y e2e.

/** Escribe `valor` en la posición 1-based `inicio` de un registro de 240 blancos. */
function poe(reg: string[], inicio: number, valor: string) {
  for (let i = 0; i < valor.length; i++) reg[inicio - 1 + i] = valor.charAt(i);
}

export interface DetalheCnab {
  cpf: string;
  numDoc: number | string;
  /** Centavos. */
  valor: number;
  dtPgto?: string;
  codRet?: string;
  tipo?: string;
}

/** Registro de detalhe (tipo 3 por padrão) com 240 posições. */
export function linhaDetalhe(d: DetalheCnab): string {
  const reg = Array.from({ length: 240 }, () => " ");
  poe(reg, 1, "001");
  poe(reg, 4, "0001");
  poe(reg, 8, d.tipo ?? "3");
  poe(reg, 44, d.cpf.padStart(11, "0"));
  poe(reg, 74, String(d.numDoc).padStart(10, "0"));
  poe(reg, 120, String(d.valor).padStart(15, "0"));
  poe(reg, 140, d.dtPgto ?? "20260925");
  poe(reg, 231, d.codRet ?? "00");
  return reg.join("");
}

/** Header (tipo 0/1) ou trailer (tipo 5/9) com 240 posições. */
export function linhaControle(tipo: "0" | "1" | "5" | "9"): string {
  const reg = Array.from({ length: 240 }, () => "0");
  poe(reg, 1, "001");
  poe(reg, 8, tipo);
  return reg.join("");
}

/** Arquivo completo: header de arquivo e lote, detalhes, trailers; termina em quebra de linha. */
export function arquivoRetorno(detalhes: DetalheCnab[]): string {
  return [linhaControle("0"), linhaControle("1"), ...detalhes.map(linhaDetalhe), linhaControle("5"), linhaControle("9")].join("\r\n") + "\r\n";
}

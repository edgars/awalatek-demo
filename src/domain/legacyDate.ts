// Fechas en formato legado (ADR-005): fecha AAAAMMDD, competencia AAAAMM y hora
// HHMMSS como enteros; `0` = vacío. Aquí solo se valida el formato: la validez
// de calendario (febrero con 29 días, D16) es responsabilidad de E2.

// Solo rango de formato (mes 01–12, día 01–31); sin validación de calendario (D16, E2).
const MES = "(0[1-9]|1[0-2])";
const DIA = "(0[1-9]|[12]\\d|3[01])";
const RE_DATA = new RegExp(`^\\d{4}-${MES}-${DIA}$`);
const RE_COMPETENCIA = new RegExp(`^\\d{4}-${MES}$`);
const RE_DATA_INT = new RegExp(`^[1-9]\\d{3}${MES}${DIA}$`);
const RE_COMPETENCIA_INT = new RegExp(`^[1-9]\\d{3}${MES}$`);

/** ISO `AAAA-MM-DD` → AAAAMMDD. `null`/`""` → 0. Formato inválido → error. */
export function dataParaInt(iso: string | null | undefined): number {
  if (iso == null || iso === "") return 0;
  if (!RE_DATA.test(iso)) throw new Error(`data inválida (esperado AAAA-MM-DD): "${iso}"`);
  return Number(iso.replaceAll("-", ""));
}

/** AAAAMMDD → ISO `AAAA-MM-DD`. 0 → `null`. Entero fuera de formato → error. */
export function intParaData(dt: number): string | null {
  if (dt === 0) return null;
  if (!Number.isInteger(dt) || !RE_DATA_INT.test(String(dt))) {
    throw new Error(`data legada inválida: ${dt}`);
  }
  const s = String(dt);
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
}

/** `AAAA-MM` → AAAAMM. `null`/`""` → 0. Formato inválido → error. */
export function competenciaParaInt(comp: string | null | undefined): number {
  if (comp == null || comp === "") return 0;
  if (!RE_COMPETENCIA.test(comp)) throw new Error(`competência inválida (esperado AAAA-MM): "${comp}"`);
  return Number(comp.replace("-", ""));
}

/** AAAAMM → `AAAA-MM`. 0 → `null`. Entero fuera de formato → error. */
export function intParaCompetencia(comp: number): string | null {
  if (comp === 0) return null;
  if (!Number.isInteger(comp) || !RE_COMPETENCIA_INT.test(String(comp))) {
    throw new Error(`competência legada inválida: ${comp}`);
  }
  const s = String(comp);
  return `${s.slice(0, 4)}-${s.slice(4, 6)}`;
}

/** AAAAMM → `MM/AAAA` para mostrar (pt-BR). 0 → `null`. Entero fuera de formato → error. */
export function formatarCompetencia(comp: number): string | null {
  const iso = intParaCompetencia(comp);
  return iso === null ? null : `${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
}

/** Año de una fecha AAAAMMDD (`dt / 10000` entero, como el legado). */
export function anoDe(dt: number): number {
  if (!Number.isInteger(dt) || dt < 0) throw new Error(`data legada inválida: ${dt}`);
  return Math.trunc(dt / 10000);
}

/**
 * Edad = año de referencia − año de nacimiento, sin considerar mes/día
 * (padrón del legado, p. ej. CADBENEF `#IDADE = #ANO-ATUAL - #ANO-NASC`).
 */
export function idadePorAno(dtNasc: number, anoRef: number): number {
  if (!Number.isInteger(anoRef)) throw new Error(`ano de referência inválido: ${anoRef}`);
  return anoRef - anoDe(dtNasc);
}

export const TZ_PADRAO = "America/Sao_Paulo";

/**
 * Fecha y hora actuales en formato legado según la zona `TZ`
 * (default `America/Sao_Paulo`). Recibe `agora` para tests deterministas.
 */
export function hoje(
  agora: Date = new Date(),
  timeZone: string = process.env.TZ || TZ_PADRAO,
): { data: number; hora: number } {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(agora);
  const p = (tipo: Intl.DateTimeFormatPartTypes): string => {
    const v = partes.find((x) => x.type === tipo)?.value;
    if (v === undefined) throw new Error(`falha ao formatar data (${tipo})`);
    return v;
  };
  return {
    data: Number(p("year") + p("month") + p("day")),
    hora: Number(p("hour") + p("minute") + p("second")),
  };
}

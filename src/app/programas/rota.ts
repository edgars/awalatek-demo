/**
 * Decodifica el segmento `[cod]` de la ruta; con escapes malformados (`100%`) usa el
 * valor bruto, que la búsqueda no encuentra → "PROGRAMA NAO ENCONTRADO".
 */
export function decodificarSegmento(cod: string): string {
  try {
    return decodeURIComponent(cod);
  } catch {
    return cod;
  }
}

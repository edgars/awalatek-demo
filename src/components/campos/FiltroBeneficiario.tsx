import Link from "next/link";

/**
 * Aviso de filtro por beneficiario llegado por la clave opaca (`?benef=`, H2/LGPD): muestra
 * solo el CPF enmascarado (nunca completo, ni en el campo de búsqueda) y un enlace para
 * quitar el filtro. Sin hooks: sirve en componentes de servidor y de cliente.
 */
export function FiltroBeneficiario({ cpfMascarado, hrefLimpar }: { cpfMascarado: string; hrefLimpar: string }) {
  return (
    <p role="status" data-testid="filtro-beneficiario" className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
      <span>
        Filtrando por: <span className="valor font-mono text-foreground">{cpfMascarado}</span>
      </span>
      <Link href={hrefLimpar} className="font-medium text-primary underline underline-offset-4">
        Limpar
      </Link>
    </p>
  );
}

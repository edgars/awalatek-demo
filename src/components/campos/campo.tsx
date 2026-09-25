import type { ReactNode } from "react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export type PropsCampoBase = {
  /** Nombre enviado en el formulario (valor ya convertido al formato legado). */
  name: string;
  label: string;
  /** id del input visible; default = `campo-<name>`. */
  id?: string;
  descricao?: ReactNode;
  erro?: string;
  required?: boolean;
  /** Oculta visualmente la etiqueta (sigue disponible para lectores de pantalla). */
  labelOculto?: boolean;
  className?: string;
};

/** ids para vincular ayuda y error con `aria-describedby`. */
export function idsCampo(p: Pick<PropsCampoBase, "name" | "id" | "descricao" | "erro">) {
  const id = p.id ?? `campo-${p.name}`;
  const idDescricao = p.descricao ? `${id}-descricao` : undefined;
  const idErro = p.erro ? `${id}-erro` : undefined;
  const describedBy = [idDescricao, idErro].filter(Boolean).join(" ") || undefined;
  return { id, idDescricao, idErro, describedBy };
}

/** Envoltorio común: etiqueta, control, ayuda y error literal junto al campo. */
export function Campo({ children, ...p }: PropsCampoBase & { children: ReactNode }) {
  const { id, idDescricao, idErro } = idsCampo(p);
  return (
    <div className={cn("grid gap-1.5", p.className)}>
      <Label htmlFor={id} className={cn(p.labelOculto && "sr-only")}>
        {p.label}
        {p.required ? <span aria-hidden="true" className="text-destructive">*</span> : null}
      </Label>
      {children}
      {p.descricao ? (
        <p id={idDescricao} className="text-xs text-muted-foreground">
          {p.descricao}
        </p>
      ) : null}
      {p.erro ? (
        <p id={idErro} className="text-xs font-medium text-destructive">
          {p.erro}
        </p>
      ) : null}
    </div>
  );
}

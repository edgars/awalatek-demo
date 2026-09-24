# Story 2.5: Registro de descuentos del beneficiario

**Épica:** 2 — Beneficiarios  
**Requisitos:** técnico (sin reglas legadas) (ver `docs/prd.md`)  
**Arquitectura:** `docs/architecture.md`

## Criterios de aceptación

- [ ] `/beneficiarios/[cpf]/descontos` lista, agrega, edita y elimina filas de `BeneficiarioDesconto` (máx. 8) — datos de entrada de FR-DSC (D14).
- [ ] Campos: tipo ∈ {C, I, J, S, P, A} (dominio del código, D15), valor fijo (centavos), porcentaje (N3.2), fecha inicio, fecha fin (0 = indefinido), número de proceso (obligatorio si tipo J).
- [ ] Validación: al menos uno de valor/porcentaje > 0 salvo tipo S; fecha fin 0 o ≥ fecha inicio.

## Definición de terminado

- Criterios de aceptación marcados; `npm run lint && npm test` en verde.
- Comportamientos `LEGACY-QUIRK` citados con su ID; `NEEDS REVIEW`/`TODO(review)` explícitos.

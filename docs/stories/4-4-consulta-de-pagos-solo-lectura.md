# Story 4.4: Consulta de pagos (solo lectura)

**Épica:** 4 — Cálculo de beneficio y pagos  
**Requisitos:** técnico (sin reglas legadas) (ver `docs/prd.md`)  
**Arquitectura:** `docs/architecture.md`

## Criterios de aceptación

- [ ] `/pagamentos` lista pagos con filtros por CPF, competencia, programa y status; paginado.
- [ ] `/pagamentos/[num]` muestra el detalle, incluidos descuentos aplicados, corrección y datos de conciliación.
- [ ] No hay acciones de crear/editar/borrar pagos en la UI ni en la API (ADR-009); test e2e verifica que los endpoints de escritura no existen.

## Definición de terminado

- Criterios de aceptación marcados; `npm run lint && npm test` en verde.
- Comportamientos `LEGACY-QUIRK` citados con su ID; `NEEDS REVIEW`/`TODO(review)` explícitos.

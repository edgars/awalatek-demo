# Story 2.6: Consulta de beneficiario

**Épica:** 2 — Beneficiarios  
**Requisitos:** FR-CON-01, FR-CON-02, FR-CON-03, FR-CON-04 (ver `docs/prd.md`)  
**Arquitectura:** `docs/architecture.md`

## Criterios de aceptación

- [ ] `/consulta` busca por CPF (por defecto) o NIS; tipo inválido → "TIPO BUSCA INVALIDO"; no encontrado → "BENEFICIARIO NAO ENCONTRADO".
- [ ] Muestra los datos de FR-CON-01 con status + descripción (FR-CON-02).
- [ ] Historial de hasta 12 pagos del CPF (competencia, bruto, líquido, status, tipo); sin pagos → "NENHUM PAGAMENTO ENCONTRADO".
- [ ] CPF enmascarado con la regla de FR-CON-04 incluida la inconsistencia con ceros a la izquierda (`// LEGACY-QUIRK(D7)`); test para ambos formatos.
- [ ] Cada regla de la tabla siguiente está implementada en `src/domain` con comentario `// RK-… (PROG:línea)` y cubierta por al menos un test.
- [ ] Con el MCP de RNC conectado: `getRule` verificado para cada `RK-` de la tabla (ver `bmad-context.md`).

## Reglas legadas (9)

| FR | RK | Fuente |
|---|---|---|
| FR-CON-01 | RK-9d9bab8eef93 | CONSBENF:72 |
| FR-CON-01 | RK-98c65e845b23 | CONSBENF:80 |
| FR-CON-01 | RK-7ede98209218 | CONSBENF:86 |
| FR-CON-01 | RK-7b5ef292a4dd | CONSBENF:100 |
| FR-CON-02 | RK-bbda5babb7d9 | CONSBENF:110 |
| FR-CON-03 | RK-e17f09d66201 | CONSBENF:152 |
| FR-CON-03 | RK-0550647253b2 | CONSBENF:156 |
| FR-CON-03 | RK-95a55083feb2 | CONSBENF:166 |
| FR-CON-04 | RK-cfd080c8d910 | CONSBENF:177 |

## Definición de terminado

- Criterios de aceptación marcados; `npm run lint && npm test` en verde.
- Comportamientos `LEGACY-QUIRK` citados con su ID; `NEEDS REVIEW`/`TODO(review)` explícitos.

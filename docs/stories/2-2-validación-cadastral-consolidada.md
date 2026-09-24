# Story 2.2: Validación cadastral consolidada

**Épica:** 2 — Beneficiarios  
**Requisitos:** FR-VAL-01, FR-VAL-02, FR-VAL-03, FR-VAL-04, FR-VAL-05 (ver `docs/prd.md`)  
**Arquitectura:** `docs/architecture.md`

## Criterios de aceptación

- [ ] Servicio `validarCadastro(dados)` retorna `{resultado: 'V'|'I', erros: string[]}` acumulando hasta 10 errores con los mensajes literales de FR-VAL-01.
- [ ] CPF: dígitos todos iguales → inválido salvo prefijo `000` (`// LEGACY-QUIRK(D4b)`), luego módulo 11.
- [ ] Fecha de nacimiento: año 1900..año actual, mes 1–12, día ≤ días del mes con febrero = 29 siempre (`// LEGACY-QUIRK(D16)`).
- [ ] Nombre con al menos un espacio después de la 1.ª posición; UF (si informada) ∈ 27 UFs; status ∈ {A,S,C,I,D}.
- [ ] Pantalla `/validacao/cadastro` permite ejecutar la validación sobre datos informados y muestra resultado + lista numerada.
- [ ] Cada regla de la tabla siguiente está implementada en `src/domain` con comentario `// RK-… (PROG:línea)` y cubierta por al menos un test.
- [ ] Con el MCP de RNC conectado: `getRule` verificado para cada `RK-` de la tabla (ver `bmad-context.md`).

## Reglas legadas (30)

| FR | RK | Fuente |
|---|---|---|
| FR-VAL-01 | RK-4e7cf0ea0beb | VALBENEF:110 |
| FR-VAL-01 | RK-d92621a0cc50 | VALBENEF:116 |
| FR-VAL-01 | RK-b776e6f05132 | VALBENEF:126 |
| FR-VAL-01 | RK-39e9b653aa4d | VALBENEF:136 |
| FR-VAL-01 | RK-3414a3783a2e | VALBENEF:164 |
| FR-VAL-02 | RK-b48d9743345d | VALBENEF:190 |
| FR-VAL-02 | RK-605e59b1fe7d | VALBENEF:195 |
| FR-VAL-02 | RK-e67e790f872a | VALBENEF:197 |
| FR-VAL-02 | RK-2dd4cb3c18cd | VALBENEF:209 |
| FR-VAL-02 | RK-9f7df44b6ca1 | VALBENEF:212 |
| FR-VAL-02 | RK-ccc5388150f7 | VALBENEF:213 |
| FR-VAL-02 | RK-9985fab5aca5 | VALBENEF:216 |
| FR-VAL-02 | RK-f19b73dfd406 | VALBENEF:218 |
| FR-VAL-02 | RK-cb78ba074b4e | VALBENEF:227 |
| FR-VAL-02 | RK-23cb286f5641 | VALBENEF:230 |
| FR-VAL-02 | RK-6381e8b050e1 | VALBENEF:231 |
| FR-VAL-02 | RK-03e29441143e | VALBENEF:234 |
| FR-VAL-02 | RK-07ded10a38a1 | VALBENEF:236 |
| FR-VAL-03 | RK-dec345b9d4e4 | VALBENEF:244 |
| FR-VAL-03 | RK-1f589b644cd7 | VALBENEF:245 |
| FR-VAL-03 | RK-a34852e9ec02 | VALBENEF:246 |
| FR-VAL-03 | RK-39c31733e515 | VALBENEF:248 |
| FR-VAL-03 | RK-f60066fede08 | VALBENEF:252 |
| FR-VAL-03 | RK-db3b53eeb364 | VALBENEF:256 |
| FR-VAL-04 | RK-9c6ba0322e06 | VALBENEF:264 |
| FR-VAL-04 | RK-9eb88e2bb408 | VALBENEF:271 |
| FR-VAL-04 | RK-6e161797bb9a | VALBENEF:274 |
| FR-VAL-05 | RK-ac7976dff12d | VALBENEF:145 |
| FR-VAL-05 | RK-20056adb605d | VALBENEF:149 |
| FR-VAL-05 | RK-bb74de6a3c53 | VALBENEF:154 |

## Definición de terminado

- Criterios de aceptación marcados; `npm run lint && npm test` en verde.
- Comportamientos `LEGACY-QUIRK` citados con su ID; `NEEDS REVIEW`/`TODO(review)` explícitos.

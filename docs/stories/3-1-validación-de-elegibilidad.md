# Story 3.1: Validación de elegibilidad

**Épica:** 3 — Elegibilidad  
**Requisitos:** FR-ELG-01, FR-ELG-02, FR-ELG-03, FR-ELG-04, FR-ELG-05, FR-ELG-06, FR-ELG-07 (ver `docs/prd.md`)  
**Arquitectura:** `docs/architecture.md`

## Criterios de aceptación

- [ ] `/elegibilidade` recibe CPF + código de programa; precondiciones de FR-ELG-01 con mensajes literales (cortan).
- [ ] Región 99 → elegible sin más verificaciones (`// LEGACY-QUIRK(D12)`).
- [ ] Acumula motivos de status, límites del programa (solo si > 0), reglas por tipo A/P/T/otro y código de elegibilidad (R → NIS, D → dependientes), máx. 10.
- [ ] Resultado: "BENEFICIARIO ELEGIVEL PARA O PROGRAMA" o "BENEFICIARIO NAO ELEGIVEL - MOTIVOS:" + lista numerada.
- [ ] Servicio de dominio `avaliarElegibilidade(benef, programa, anoAtual)` puro y cubierto por tests para cada rama.
- [ ] Cada regla de la tabla siguiente está implementada en `src/domain` con comentario `// RK-… (PROG:línea)` y cubierta por al menos un test.
- [ ] Con el MCP de RNC conectado: `getRule` verificado para cada `RK-` de la tabla (ver `bmad-context.md`).

## Reglas legadas (29)

| FR | RK | Fuente |
|---|---|---|
| FR-ELG-01 | RK-ba073668b27b | VALELEG:59 |
| FR-ELG-01 | RK-80016581d919 | VALELEG:72 |
| FR-ELG-01 | RK-8c8b79c28087 | VALELEG:73 |
| FR-ELG-01 | RK-d1fd785bcf1c | VALELEG:81 |
| FR-ELG-01 | RK-994493fceb7b | VALELEG:94 |
| FR-ELG-01 | RK-74d42c778166 | VALELEG:99 |
| FR-ELG-02 | RK-86ee7c50f9f4 | VALELEG:107 |
| FR-ELG-03 | RK-9a4651f7dd24 | VALELEG:116 |
| FR-ELG-03 | RK-7c608b834e79 | VALELEG:117 |
| FR-ELG-03 | RK-fc541e8adcfc | VALELEG:122 |
| FR-ELG-03 | RK-4ff3d6cc6794 | VALELEG:127 |
| FR-ELG-04 | RK-06883f7fa2f7 | VALELEG:139 |
| FR-ELG-04 | RK-2cb07a956769 | VALELEG:140 |
| FR-ELG-04 | RK-dd82bfe9d500 | VALELEG:146 |
| FR-ELG-04 | RK-50e8ebafa202 | VALELEG:147 |
| FR-ELG-04 | RK-5f1dcae4ccb7 | VALELEG:157 |
| FR-ELG-04 | RK-4c6d057f4ecb | VALELEG:158 |
| FR-ELG-05 | RK-d9a36a3c8a42 | VALELEG:168 |
| FR-ELG-05 | RK-e5d581584c6d | VALELEG:171 |
| FR-ELG-05 | RK-b63f2863cdab | VALELEG:172 |
| FR-ELG-05 | RK-aa4425811246 | VALELEG:178 |
| FR-ELG-05 | RK-093a02fbe84e | VALELEG:185 |
| FR-ELG-05 | RK-7aeaee84c79d | VALELEG:192 |
| FR-ELG-06 | RK-0cfdfa24b877 | VALELEG:206 |
| FR-ELG-06 | RK-3e570ba9c17c | VALELEG:226 |
| FR-ELG-06 | RK-d7bb85d92636 | VALELEG:228 |
| FR-ELG-06 | RK-af932d091e75 | VALELEG:234 |
| FR-ELG-06 | RK-5f5731566730 | VALELEG:236 |
| FR-ELG-07 | RK-bd27c2ba8977 | VALELEG:213 |

## Definición de terminado

- Criterios de aceptación marcados; `npm run lint && npm test` en verde.
- Comportamientos `LEGACY-QUIRK` citados con su ID; `NEEDS REVIEW`/`TODO(review)` explícitos.

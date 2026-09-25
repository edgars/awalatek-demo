# UX — Experiencia y flujos (EXPERIENCE)

> Versión 2 — corrección de rumbo del 2026-09-24. Campos de cada pantalla en `DESIGN.md`.

## 1. Mapa de navegación

| Grupo | Pantalla | Ruta | Historia |
|---|---|---|---|
| Cadastro | Programas | `/programas`, `/programas/novo`, `/programas/[cod]` | 1.1 |
| Cadastro | Beneficiários | `/beneficiarios`, `/beneficiarios/novo`, `/beneficiarios/[chave]/editar` | 2.1 |
| Cadastro | Dependentes | `/beneficiarios/[chave]/dependentes` | 2.4 |
| Cadastro | Descontos do beneficiário | `/beneficiarios/[chave]/descontos` | 2.5 |
| Cadastro | Consulta | `/consulta` | 2.6 |
| Validação | Cadastral | `/validacao/cadastro` | 2.2 |
| Validação | Documentos | `/validacao/documentos` | 2.3 |
| Validação | Elegibilidade | `/elegibilidade` | 3.1 |
| Cálculo e Pagamentos | Cálculo individual | `/calculo` | 4.1 |
| Cálculo e Pagamentos | Lote mensal | `/lote` | 4.2 |
| Cálculo e Pagamentos | Cálculo de descontos | `/descontos` | 4.3 |
| Cálculo e Pagamentos | Pagamentos | `/pagamentos`, `/pagamentos/[num]` | 4.4 |
| Processos | Correção retroativa | `/correcao` | 5.1 |
| Processos | Conciliação bancária | `/conciliacao` | 6.1 |
| Relatórios | Pagamentos · Consolidado · Auditoria | `/relatorios/pagamentos`, `/relatorios/consolidado`, `/relatorios/auditoria` | 7.1–7.3 |

Página inicial `/`: accesos rápidos a Consulta, Novo beneficiário, Cálculo y Lote; último lote ejecutado (competência, gerados, erros).

## 2. Patrones de interacción

- **Formulario de proceso** (cálculo, descuentos, corrección, conciliación, validaciones,
  elegibilidad): entrada arriba → botón de acción → panel de resultado debajo, sin
  salir de la página. El resultado permanece hasta la próxima ejecución.
- **Errores de validación del legado** (cadastro de beneficiario): se corta en el
  primer error, como el legado; el mensaje literal aparece junto al campo y en el panel.
- **Validaciones acumulativas** (VALBENEF, VALDOCS, VALELEG): lista numerada completa.
- **Procesos masivos** (lote, conciliación): confirmación previa obligatoria;
  progreso visible; resumen final con contadores; no se puede lanzar dos veces en paralelo.
- **Solo lectura explícita:** pagos y auditoría no muestran botones de edición.
- **Avisos LEGACY-QUIRK visibles** donde el operador podría sorprenderse (D1, D5, D13): badge `warning` con texto corto.
- **Máscaras y conversión:** el operador nunca teclea AAAAMMDD ni centavos; la UI convierte (DESIGN §3).

## 3. Flujos principales

### F1 — Alta de programa
`/programas` → **Novo programa** → formulario → Gravar → mensaje de éxito con valor ajustado → ficha `/programas/[cod]` → (opcional) cargar faixas y parâmetros regionais.

### F2 — Alta de beneficiario con dependientes y descuentos
`/beneficiarios` → **Novo** → formulario → Gravar
→ (error) mensaje literal, corrige y reenvía
→ (éxito) ficha → **Dependentes** → incluir → "Incluir outro?" → Concluir
→ **Descontos** (si aplica) → agregar filas.

### F3 — Atención: consulta
`/consulta` → CPF o NIS → ficha + últimos 12 pagos → atajos a Editar, Dependentes, Elegibilidade.

### F4 — Verificar elegibilidad
`/elegibilidade` → CPF + programa → ELEGÍVEL / NÃO ELEGÍVEL con motivos → (si falta documentación) enlace a Validação de documentos.

### F5 — Ciclo mensual de pagos (gestor financiero)
1. 1.er día hábil: `/lote` → confirmar → resumen (o job `npm run lote:pagamentos`).
2. Revisar errores del lote (programa no encontrado) → corregir cadastro → re-ejecutar (no duplica).
3. Descuentos puntuales: `/descontos` por pago.
4. Recibir el retorno del banco → `/conciliacao` → upload → revisar divergencias y no encontrados.
5. `/relatorios/consolidado` y `/relatorios/pagamentos` de la competencia.

### F6 — Corrección retroactiva
`/correcao` → CPF + período → resumen → detalle del pago en `/pagamentos/[num]`.

### F7 — Auditoría
`/relatorios/auditoria` → filtros → tabla + resumen por acción → versión para impresión.

## 4. Estados vacíos y errores

| Situación | Comportamiento |
|---|---|
| Lista sin registros | mensaje + acción principal (p. ej. "Nenhum beneficiário — Novo beneficiário") |
| Beneficiario/programa/pago no encontrado | mensaje literal del legado en el panel |
| Lote ya ejecutado en la competencia | resumen muestra todos como ignorados; aviso informativo |
| Archivo CNAB sin registros tipo 3 | resumen con 0 conciliados y aviso "arquivo sem registros de detalhe" |
| Error inesperado del servidor | toast genérico; detalle solo en log del servidor (sin datos personales — NFR-04) |

## 5. Accesibilidad

- Todos los campos con `<label>`; errores asociados vía `aria-describedby`.
- Navegación completa por teclado (el operador 3270 está acostumbrado a Tab/Enter): Enter envía el formulario de proceso.
- Contraste AA; estados no dependen solo del color (badge con texto).

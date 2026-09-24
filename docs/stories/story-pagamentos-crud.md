# Story — Pagamentos CRUD

**As an** operator, **I want** to manage Pagamentos records, **so that** the data stays current.

## Context

- Entity: `Pagamento` (table `pagamento`)
- Routes: list `/pagamentos`, create `/pagamentos/new`, edit `/pagamentos/[id]/edit`
- API base: `/api/pagamentos`

## Fields (render in order)

| Field | Label | Component | Required | List column |
|---|---|---|---|---|
| numPagamento | Num Pagamento | input | no | yes |
| numCpf | Num Cpf | input | no | yes |
| numInscricao | Num Inscricao | input | no | yes |
| codPrograma | Cod Programa | input | no | yes |
| anoMesRef | Ano Mes Ref | input | no | yes |
| numCiclo | Num Ciclo | input | no | yes |
| vlrBruto | Vlr Bruto | input | no | yes |
| vlrLiquido | Vlr Liquido | input | no | yes |
| vlrDescontoTotal | Vlr Desconto Total | input | no | yes |
| sitPagamento | Sit Pagamento | input | no | yes |
| dtGeracao | Dt Geracao | input | no | yes |
| hrGeracao | Hr Geracao | input | no | yes |
| dtEmissao | Dt Emissao | input | no | yes |
| dtConfirmacao | Dt Confirmacao | input | no | yes |
| dtCancelamento | Dt Cancelamento | input | no | yes |
| motCancelamento | Mot Cancelamento | input | no | yes |
| codBanco | Cod Banco | input | no | yes |
| codAgencia | Cod Agencia | input | no | yes |
| numConta | Num Conta | input | no | yes |
| tipoConta | Tipo Conta | input | no | yes |
| codOperacao | Cod Operacao | input | no | yes |
| numObSiafi | Num Ob Siafi | input | no | yes |
| numNeSiafi | Num Ne Siafi | input | no | yes |
| codUgEmitente | Cod Ug Emitente | input | no | yes |
| codGestao | Cod Gestao | input | no | yes |
| sitIntegSiafi | Sit Integ Siafi | input | no | yes |
| dtConciliacao | Dt Conciliacao | input | no | yes |
| sitConciliacao | Sit Conciliacao | input | no | yes |
| vlrConciliado | Vlr Conciliado | input | no | yes |
| codRetornoBanco | Cod Retorno Banco | input | no | yes |
| desRetornoBanco | Des Retorno Banco | input | no | yes |
| hashArqRemessa | Hash Arq Remessa | input | no | yes |
| hashArqRetorno | Hash Arq Retorno | input | no | yes |
| dtInclusao | Dt Inclusao | input | no | yes |
| hrInclusao | Hr Inclusao | input | no | yes |
| usrInclusao | Usr Inclusao | input | no | yes |
| dtUltAlteracao | Dt Ult Alteracao | input | no | yes |
| hrUltAlteracao | Hr Ult Alteracao | input | no | yes |
| usrUltAlteracao | Usr Ult Alteracao | input | no | yes |

## Acceptance criteria

- [ ] `GET /api/pagamentos` returns a paginated list.
- [ ] `POST /api/pagamentos` creates a record after validating the body.
- [ ] `GET /api/pagamentos/:id` returns one record.
- [ ] `PUT /api/pagamentos/:id` updates a record.
- [ ] `DELETE /api/pagamentos/:id` deletes a record.
- [ ] List page shows only *list column* fields, with search + pagination.
- [ ] Create and edit forms render all fields in order; required fields validated.
- [ ] Enforce: Conditional
- [ ] Enforce: Derivation of #VLR-BENF — * * * * * * * * * * * * * * * * * * * * * * * * * * * *
- [ ] Enforce: Derivation of #VLR-BENF — Aplicar Reajuste Do Programa
- [ ] Enforce: Derivation of #VLR-TEMP — Truncar P/ 2 Casas Decimais - Padrao Mainframe
- [ ] Enforce: Derivation of #VLR-BENF — Truncar P/ 2 Casas Decimais - Padrao Mainframe
- [ ] Enforce: Conditional
- [ ] Enforce: Derivation of #VLR-13 — * * * * * * * * * * * * * * * * * * * * * * * * * * * *
- [ ] Enforce: Derivation of #VLR-TEMP — Truncar 13o
- [ ] Enforce: Derivation of #VLR-13 — Truncar 13o
- [ ] Enforce: Derivation of #VLR-BRUTO — Truncar 13o
- [ ] Enforce: Conditional
- [ ] Enforce: Percentage calculation (15% of #VLR-BENF) — Abono Natalino - 15% Adicional Para Programas Tipo 'A'
- [ ] Enforce: Derivation of #VLR-TEMP — Truncar Abono
- [ ] Enforce: Derivation of #VLR-ABONO — Truncar Abono
- [ ] Enforce: Derivation of #VLR-BRUTO — Truncar Abono
- [ ] Enforce: Derivation of #VLR-LIQ — Calc Vlr Liquido
- [ ] Enforce: Conditional
- [ ] Enforce: Derivation of #VLR-TEMP — Truncar Liquido
- [ ] Enforce: Derivation of #VLR-LIQ — Truncar Liquido
- [ ] Enforce: Conditional
- [ ] Enforce: Conditional
- [ ] Enforce: Percentage calculation (3% of #VLR-BRUTO) — Desconto Basico - 3% Contrib Social
- [ ] Enforce: Derivation of #VLR-TEMP — Desconto Basico - 3% Contrib Social
- [ ] Enforce: Derivation of #VLR-DESC — Desconto Basico - 3% Contrib Social
- [ ] Enforce: Conditional
- [ ] Enforce: Derivation of #DIFF — Conciliar Valores
- [ ] Enforce: Conditional
- [ ] Enforce: Derivation of #DIFF — Conciliar Valores
- [ ] Enforce: Conditional
- [ ] Enforce: Conditional
- [ ] Enforce: Conditional
- [ ] Enforce: Conditional
- [ ] Enforce: Conditional
- [ ] Enforce: Derivation of #VLR-CORR — Aplicar Correcao
- [ ] Enforce: Derivation of #VLR-TEMP — Truncar
- [ ] Enforce: Derivation of #VLR-CORR — Truncar
- [ ] Enforce: Derivation of #VLR-DIFF — Truncar
- [ ] Enforce: Conditional
- [ ] Enforce: Conditional
- [ ] Enforce: Derivation of #VLR-ARR — Nota: Arredondamento Difere Do Calcbenf (Round Vs Truncate)
- [ ] Enforce: Derivation of #VLR-TEMP — Nota: Arredondamento Difere Do Calcbenf (Round Vs Truncate)
- [ ] Enforce: Derivation of #VLR-ARR — Nota: Arredondamento Difere Do Calcbenf (Round Vs Truncate)
- [ ] Enforce: DECIDE ON PAGAMENTO-V.STATUS-PGTO
- [ ] Enforce: Conditional
- [ ] Enforce: Conditional
- [ ] Enforce: DECIDE ON PAGAMENTO-V.TIPO-PGTO
- [ ] Enforce: DECIDE ON PAGAMENTO-V.STATUS-PGTO
- [ ] Enforce: Conditional
- [ ] Enforce: Derivation of #VLR-BENF — Calculo Principal
- [ ] Enforce: Derivation of #VLR-BENF — #Fator-Rnd * #Fator-Idade
- [ ] Enforce: Derivation of #VLR-TEMP — Truncar
- [ ] Enforce: Derivation of #VLR-BENF — Truncar
- [ ] Enforce: Conditional
- [ ] Enforce: Derivation of #VLR-13 — 13o Salario E Abono - Dezembro
- [ ] Enforce: Derivation of #VLR-TEMP — 13o Salario E Abono - Dezembro
- [ ] Enforce: Derivation of #VLR-13 — 13o Salario E Abono - Dezembro
- [ ] Enforce: Derivation of #VLR-BRUTO — 13o Salario E Abono - Dezembro
- [ ] Enforce: Conditional
- [ ] Enforce: Percentage calculation (15% of #VLR-BENF)
- [ ] Enforce: Derivation of #VLR-TEMP
- [ ] Enforce: Derivation of #VLR-ABONO
- [ ] Enforce: Derivation of #VLR-BRUTO
- [ ] Enforce: Conditional
- [ ] Enforce: Percentage calculation (3% of #VLR-BRUTO) — Calc Descontos Simplificado
- [ ] Enforce: Derivation of #VLR-TEMP — Calc Descontos Simplificado
- [ ] Enforce: Derivation of #VLR-DESC — Calc Descontos Simplificado
- [ ] Enforce: Derivation of #VLR-LIQ — Calc Liquido
- [ ] Enforce: Conditional
- [ ] Enforce: Derivation of #VLR-TEMP — Calc Liquido
- [ ] Enforce: Derivation of #VLR-LIQ — Calc Liquido
- [ ] Enforce: Conditional
- [ ] Enforce: Percentage calculation (30% of #VLR-BRUTO) — Calc Teto Maximo Desconto - 30% Do Bruto
- [ ] Enforce: Derivation of #VLR-TEMP — Truncar
- [ ] Enforce: Derivation of #VLR-MAX-DSCT — Truncar
- [ ] Enforce: Conditional
- [ ] Enforce: Conditional
- [ ] Enforce: Conditional
- [ ] Enforce: Percentage calculation (PCT-DSCT% of #VLR-BRUTO) — Desconto Judicial - Valor Fixo Ou Percentual
- [ ] Enforce: Conditional
- [ ] Enforce: Percentage calculation (PCT-DSCT% of #VLR-BRUTO) — Pensao Alimenticia
- [ ] Enforce: Percentage calculation (PCT-DSCT% of #VLR-BRUTO) — Imposto Retido
- [ ] Enforce: Percentage calculation (1% of #VLR-BRUTO) — Desconto Sindical
- [ ] Enforce: Conditional
- [ ] Enforce: Percentage calculation (PCT-DSCT% of #VLR-BRUTO) — Desconto Administrativo
- [ ] Enforce: Conditional
- [ ] Enforce: Derivation of #VLR-TEMP — Truncar Total Desconto
- [ ] Enforce: Derivation of #VLR-TOTAL-DSCT — Truncar Total Desconto
- [ ] Enforce: Conditional
- [ ] Enforce: Derivation of #VLR-DSCT-ITEM
- [ ] If the RNC MCP server is connected: verified each rule above with `getRule` (see `bmad-context.md` § RNC MCP guardrail).

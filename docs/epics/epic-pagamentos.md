# Epic — Manage Pagamentos

**Goal:** full lifecycle management of Pagamentos records at `/pagamentos`.

## Stories

- `story-pagamentos-crud` — list, create, view, edit, delete Pagamentos.

## Business rules affecting this entity

- Conditional
- Derivation of #VLR-BENF — * * * * * * * * * * * * * * * * * * * * * * * * * * * *
- Derivation of #VLR-BENF — Aplicar Reajuste Do Programa
- Derivation of #VLR-TEMP — Truncar P/ 2 Casas Decimais - Padrao Mainframe
- Derivation of #VLR-BENF — Truncar P/ 2 Casas Decimais - Padrao Mainframe
- Conditional
- Derivation of #VLR-13 — * * * * * * * * * * * * * * * * * * * * * * * * * * * *
- Derivation of #VLR-TEMP — Truncar 13o
- Derivation of #VLR-13 — Truncar 13o
- Derivation of #VLR-BRUTO — Truncar 13o
- Conditional
- Percentage calculation (15% of #VLR-BENF) — Abono Natalino - 15% Adicional Para Programas Tipo 'A'
- Derivation of #VLR-TEMP — Truncar Abono
- Derivation of #VLR-ABONO — Truncar Abono
- Derivation of #VLR-BRUTO — Truncar Abono
- Derivation of #VLR-LIQ — Calc Vlr Liquido
- Conditional
- Derivation of #VLR-TEMP — Truncar Liquido
- Derivation of #VLR-LIQ — Truncar Liquido
- Conditional
- Conditional
- Percentage calculation (3% of #VLR-BRUTO) — Desconto Basico - 3% Contrib Social
- Derivation of #VLR-TEMP — Desconto Basico - 3% Contrib Social
- Derivation of #VLR-DESC — Desconto Basico - 3% Contrib Social
- Conditional
- Derivation of #DIFF — Conciliar Valores
- Conditional
- Derivation of #DIFF — Conciliar Valores
- Conditional
- Conditional
- Conditional
- Conditional
- Conditional
- Derivation of #VLR-CORR — Aplicar Correcao
- Derivation of #VLR-TEMP — Truncar
- Derivation of #VLR-CORR — Truncar
- Derivation of #VLR-DIFF — Truncar
- Conditional
- Conditional
- Derivation of #VLR-ARR — Nota: Arredondamento Difere Do Calcbenf (Round Vs Truncate)
- Derivation of #VLR-TEMP — Nota: Arredondamento Difere Do Calcbenf (Round Vs Truncate)
- Derivation of #VLR-ARR — Nota: Arredondamento Difere Do Calcbenf (Round Vs Truncate)
- DECIDE ON PAGAMENTO-V.STATUS-PGTO
- Conditional
- Conditional
- DECIDE ON PAGAMENTO-V.TIPO-PGTO
- DECIDE ON PAGAMENTO-V.STATUS-PGTO
- Conditional
- Derivation of #VLR-BENF — Calculo Principal
- Derivation of #VLR-BENF — #Fator-Rnd * #Fator-Idade
- Derivation of #VLR-TEMP — Truncar
- Derivation of #VLR-BENF — Truncar
- Conditional
- Derivation of #VLR-13 — 13o Salario E Abono - Dezembro
- Derivation of #VLR-TEMP — 13o Salario E Abono - Dezembro
- Derivation of #VLR-13 — 13o Salario E Abono - Dezembro
- Derivation of #VLR-BRUTO — 13o Salario E Abono - Dezembro
- Conditional
- Percentage calculation (15% of #VLR-BENF)
- Derivation of #VLR-TEMP
- Derivation of #VLR-ABONO
- Derivation of #VLR-BRUTO
- Conditional
- Percentage calculation (3% of #VLR-BRUTO) — Calc Descontos Simplificado
- Derivation of #VLR-TEMP — Calc Descontos Simplificado
- Derivation of #VLR-DESC — Calc Descontos Simplificado
- Derivation of #VLR-LIQ — Calc Liquido
- Conditional
- Derivation of #VLR-TEMP — Calc Liquido
- Derivation of #VLR-LIQ — Calc Liquido
- Conditional
- Percentage calculation (30% of #VLR-BRUTO) — Calc Teto Maximo Desconto - 30% Do Bruto
- Derivation of #VLR-TEMP — Truncar
- Derivation of #VLR-MAX-DSCT — Truncar
- Conditional
- Conditional
- Conditional
- Percentage calculation (PCT-DSCT% of #VLR-BRUTO) — Desconto Judicial - Valor Fixo Ou Percentual
- Conditional
- Percentage calculation (PCT-DSCT% of #VLR-BRUTO) — Pensao Alimenticia
- Percentage calculation (PCT-DSCT% of #VLR-BRUTO) — Imposto Retido
- Percentage calculation (1% of #VLR-BRUTO) — Desconto Sindical
- Conditional
- Percentage calculation (PCT-DSCT% of #VLR-BRUTO) — Desconto Administrativo
- Conditional
- Derivation of #VLR-TEMP — Truncar Total Desconto
- Derivation of #VLR-TOTAL-DSCT — Truncar Total Desconto
- Conditional
- Derivation of #VLR-DSCT-ITEM

## Definition of done

- CRUD works end to end; required fields validated; relations resolve; business rules enforced.

# UX — Diseño de pantallas (DESIGN)

> Versión 2 — corrección de rumbo del 2026-09-24. Fuente: 16 pantallas legadas
> del UIR (`603f473c-…`) + programas Natural. Flujos en `EXPERIENCE.md`.

## 1. Principios

- **Idioma de la interfaz: portugués (pt-BR).** Los operadores son brasileños y los
  mensajes del legado se muestran literalmente (PRD §4). Los documentos del
  proyecto están en español; la UI no.
- **Equivalencia antes que rediseño:** cada pantalla web corresponde a una
  pantalla 3270 del legado, con los mismos campos de entrada; la mejora es de
  usabilidad (máscaras, selectores, tablas), no de comportamiento.
- **Densidad de back-office:** tablas compactas, formularios en 2 columnas en
  desktop, 1 columna en móvil.
- **Mensajes del legado visibles tal cual** (mayúsculas, portugués) en el panel de
  resultado; ayudas de interfaz nuevas en tono normal.

## 2. Sistema visual

- Base: Tailwind CSS + shadcn/ui. Tema claro por defecto, oscuro opcional.
- Tipografía: sans del sistema; valores (R$, CPF, competencia) en cifras tabulares.
- Colores semánticos: `success` (válido/elegível/conciliado), `destructive`
  (erro/inválido/divergente), `warning` (suspenso/LEGACY-QUIRK visible), `muted`.
- Layout: barra lateral con los grupos **Cadastro**, **Validação**, **Cálculo e
  Pagamentos**, **Processos**, **Relatórios**; encabezado con usuario operativo (`SIFAP_USER`).

## 3. Componentes de campo

| Componente | Uso | Entrada → valor enviado |
|---|---|---|
| `CpfInput` | CPF, CPF titular, CPF dependente | máscara `000.000.000-00` → `String(11)` con ceros a la izquierda |
| `NisInput` | NIS | 11 dígitos → `String(11)` |
| `DataLegada` | fechas | selector de fecha → `Int` AAAAMMDD (0 si vacío cuando el campo lo admite) |
| `Competencia` | competencias | selector mes/año → `Int` AAAAMM |
| `Moeda` | valores | `R$ 0.000,00` → `Int` centavos |
| `Fator` | factores y porcentajes | decimal con 4 (factor) o 2 (%) casas → `String` |
| `Codigo` | código de programa, región | numérico con longitud fija (4 / 2) |
| `Select` | dominios cerrados | valores del código legado (D15) con etiqueta |
| `ResultadoLegado` | panel de resultado | título (`V`/`I`, elegível/não) + lista numerada de mensajes literales |
| `ResumoProcesso` | fin de procesos | tarjeta de contadores y totales |
| `TabelaPaginada` | listas e informes | orden, búsqueda, paginación; CPF siempre enmascarado |

## 4. Pantallas

### 4.1 Programas — lista `/programas`
Columnas: Código · Nome · Sigla · Tipo · Situação · Valor base (R$). Búsqueda por código/nombre. Botón **Novo programa**.

### 4.2 Programa — inclusión `/programas/novo` (legado: CADASTRO PROGRAMAS SOCIAIS + DADOS DO PROGRAMA)

| Campo | Componente | Legado | Validación |
|---|---|---|---|
| Código do programa | `Codigo(4)` | COD PROGRAMA (N4) | obligatorio, único |
| Nome | texto (60) | NOME | |
| Tipo | `Select` A=Assistencial · P=Previdenciário · T=Trabalho | TIPO (A1) | |
| Valor base | `Moeda` | VLR BASE (N9.2) | nota: "será gravado ajustado pelo fator K" |
| Código de elegibilidade | texto (5) | COD ELEGIBIL | ayuda: pos.1 R = exige NIS; pos.2 D = exige dependentes |
| Data início | `DataLegada` | DT INICIO | |
| Data fim | `DataLegada` (vacío = indeterminado → 0) | DT FIM | |
| Renda máxima | `Moeda` (0 = sem limite) | RENDA MAXIMA | |
| Idade mínima / máxima | numérico (3) (0 = sem limite) | IDADE MINIMA/MAXIMA | |
| Fator de reajuste | `Fator(4)` | FATOR REAJUSTE (N3.4) | |

Tras grabar: `ResultadoLegado` con "PROGRAMA INCLUIDO COM SUCESSO - VLR AJUSTADO: R$ …".

### 4.3 Programa — consulta `/programas/[cod]`
Ficha: código, nombre, tipo, valor base, elegibilidad, situación (FR-PRG-01). Dos
secciones editables en línea:
- **Faixas de cálculo** (máx. 5): Renda início · Renda fim · Fator multiplicador · Valor adicional · Acumulativo (S/N).
- **Parâmetros regionais** (máx. 6): Código região · Fator regional · Complemento · Ativo (S/N).
Aviso fijo: "Parâmetros informativos — o cálculo usa as tabelas legadas (D1)".

### 4.4 Beneficiários — lista `/beneficiarios`
Columnas: CPF (enmascarado) · Nome · Programa · Situação (badge) · Região · Dependentes. Búsqueda por CPF o nombre. Acciones por fila: Editar · Dependentes · Descontos · Consultar.

### 4.5 Beneficiário — inclusión/alteración `/beneficiarios/novo`, `/beneficiarios/[chave]/editar` (legado: CADASTRO DE BENEFICIARIO)

| Campo | Componente | Legado | Alteración |
|---|---|---|---|
| CPF | `CpfInput` | CPF (N11) | solo lectura |
| Nome | texto (60) | NOME | editable |
| Data de nascimento | `DataLegada` | DT NASCIMENTO (AAAAMMDD) | solo lectura |
| Sexo | `Select` M/F | SEXO | solo lectura |
| Endereço | texto (80) | ENDERECO | editable |
| Município | texto (40) | MUNICIPIO | editable |
| UF | `Select` 27 UFs | UF | editable |
| CEP | máscara `00000-000` → Int | CEP (N8) | editable |
| Telefone | texto (15) | TELEFONE | editable |
| RG | texto (15) | RG | editable |
| Programa | `Select` de programas (código – nome) | COD PROGRAMA (N4) | solo lectura |
| Renda familiar | `Moeda` | RENDA FAMILIAR | editable |
| Nº dependentes | numérico (2) | NUM DEPENDENTES | editable (también lo actualiza la pantalla de dependientes) |
| Região | `Codigo(2)` con ayuda de regiones 1–25 / 99 | COD REGIAO | solo lectura |
| NIS | `NisInput` | NIS | solo lectura |
| Situação | `Select` A/S/C/I/D | STATUS | solo en alteración |

Error: un solo mensaje literal (FR-BEN-01, corta en el primero) junto al campo y en el panel.
Si al grabar el status pasa a `S` por edad > 75: aviso `warning` "Situação ajustada para SUSPENSO (idade > 75 — regra legada)".

### 4.6 Dependentes `/beneficiarios/[chave]/dependentes` (legado: CADASTRO DE DEPENDENTES + DADOS DO DEPENDENTE)
Encabezado: titular (CPF enmascarado, nombre, situación, total de dependientes).
Tabla: Nome · Nascimento · Parentesco · CPF · Documento · Sexo.
Formulario de alta: Nome (60) · Data de nascimento (`DataLegada`) · Parentesco (`Select` FI=Filho · CO=Cônjuge · IR=Irmão · OU=Outro) · CPF (`CpfInput`, opcional) · Documento (15) · Sexo (M/F).
Tras grabar: "DEPENDENTE INCLUIDO - TOTAL: n" + botones **Incluir outro dependente** / **Concluir**.
Titular C/D: formulario deshabilitado con el mensaje literal.

### 4.7 Descontos do beneficiário `/beneficiarios/[chave]/descontos`
Tabla editable (máx. 8): Tipo (`Select` C=Contribuição · I=Imposto · J=Judicial · S=Sindical · P=Pensão alimentícia · A=Administrativo) · Valor (`Moeda`) · Percentual (`Fator(2)`) · Início · Fim (vacío = indefinido) · Nº processo (obligatorio si J). Indicador "vigente hoje" por fila.

### 4.8 Consulta `/consulta` (legado: CONSULTA BENEFICIARIO)
Entrada: Tipo de busca (radio CPF / NIS, default CPF) + CPF o NIS.
Resultado: ficha (FR-CON-01) con situación + descripción; tabla **Histórico de pagamentos (últimos 12)**: Competência · Bruto · Líquido · Situação · Tipo; vacío → "NENHUM PAGAMENTO ENCONTRADO".

### 4.9 Validação cadastral `/validacao/cadastro` (VALBENEF)
Entrada: CPF, Nome, Data de nascimento, UF, Situação (o botón "Carregar do cadastro" por CPF).
Resultado: `ResultadoLegado` con `V`/`I` y hasta 10 errores numerados.

### 4.10 Validação de documentos `/validacao/documentos` (legado: VALIDACAO DE DOCUMENTOS)
Entrada: CPF · RG (15) · Título de eleitor (12) · CTPS (15).
Resultado: `V`/`I` + hasta 5 errores; si aplica (flag activo), sello "** DOCUMENTO ESPECIAL VALIDADO **".

### 4.11 Elegibilidade `/elegibilidade` (legado: VALIDACAO ELEGIBILIDADE)
Entrada: CPF do beneficiário · Programa (`Select`).
Resultado: badge **ELEGÍVEL** / **NÃO ELEGÍVEL** + motivos numerados literales; región 99 muestra "BENEFICIARIO ELEGIVEL - REGIAO ESPECIAL".

### 4.12 Cálculo de benefício `/calculo` (legado: CALCULO BENEFICIO)
Entrada: CPF do beneficiário · Competência.
Resultado (`ResumoProcesso`): CPF, competência, valor bruto, desconto, líquido, tipo de pagamento; en diciembre además 13º y abono. Enlace al pago generado.

### 4.13 Lote mensal `/lote` (BATCHPGT)
Muestra la competencia que se procesará (mes actual) y cuántos pagos ya existen en ella.
Botón **Executar lote** con confirmación ("Gerar pagamentos da competência AAAAMM para todos os beneficiários ativos?").
Durante la ejecución: progreso (procesados / último CPF). Al final `ResumoProcesso`: processados, gerados, ignorados, erros, totais bruto/desconto/líquido/abono + lista de errores.

### 4.14 Cálculo de descontos `/descontos` (legado: CALCULO DESCONTOS)
Entrada: CPF do beneficiário · Nº do pagamento.
Resultado: "DESCONTOS CALCULADOS" — valor bruto, desconto total, teto 30 % + tabla de descuentos aplicados. Aviso `warning`: "O valor líquido não é recalculado (regra legada D13)".

### 4.15 Pagamentos `/pagamentos`, `/pagamentos/[num]` (solo lectura)
Lista: Nº · CPF · Programa · Competência · Bruto · Desconto · Líquido · Situação · Tipo; filtros CPF, competência, programa, situación.
Detalle: valores, descuentos aplicados, corrección (valor, fecha, corregido S/N), conciliación (fecha de pago, código de retorno).

### 4.16 Correção retroativa `/correcao` (legado: CORRECAO RETROATIVA)
Entrada: CPF do beneficiário · Competência inicial · Competência final.
Resultado: "CORRECAO RETROATIVA FINALIZADA" — registros corrigidos, valor total + tabla de pagos corregidos (competência, original, corrigido, diferença).

### 4.17 Conciliação bancária `/conciliacao` (legado: CONCILIACAO BANCARIA)
Entrada: Competência · Arquivo de retorno (upload `.ret`/`.txt`, CNAB 240) — reemplaza el campo "ARQUIVO RETORNO" (ruta de archivo) del legado.
Resultado: `ResumoProcesso` (lidos, conciliados, divergentes, não encontrados, registros de auditoria) + tablas **Divergências** (CPF enmascarado, SIFAP, banco) y **Não encontrados** (CPF, documento).

### 4.18 Relatório de pagamentos `/relatorios/pagamentos` (legado: RELATORIO PAGAMENTOS)
Filtros: Competência inicial · Competência final · Programa (0/vacío = todos).
Tabla con corte por programa: Competência · CPF (`***.XXX.XXX-XX`) · Nome (30) · UF · Bruto · Desconto · Líquido · Tipo · Situação; subtotal por programa y total general. Botón **Versão para impressão** (66 linhas/página).

### 4.19 Relatório consolidado `/relatorios/consolidado` (legado: COMPETENCIA RELATORIO)
Filtro: Competência. Tres bloques: **Por região** (Norte, Nordeste, Sudeste, Sul, Centro-Oeste: qtd, bruto, desconto, líquido) · **Por situação** (Gerado, Pago, Cancelado, Devolvido, Estornado: qtd, bruto) · **Totais gerais**.

### 4.20 Relatório de auditoria `/relatorios/auditoria` (legado: RELATORIO AUDITORIA)
Filtros: Data inicial (default 01/01/1997) · Data final (default hoje) · Ação (`Select` IN/AL/CO/CN/DV, vacío = todas) · Usuário (8) · Tabela (15) · Saída (T = tela, I = impressão).
Tabla: Data · Hora (HH:MM:SS) · Usuário · Ação · Tabela · Chave (+ Descrição en salida I). Resumen por acción al pie.

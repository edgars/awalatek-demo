# UX Design — SIFAP

One section per managed entity. Each has a list page, a create form and an edit form. Render fields in the order shown.

## ProgramaSocials  (`/programa_socials`)

| Field | Label | Component | Required | List column |
|---|---|---|---|---|
| codPrograma | Cod Programa | input | no | yes |
| nomePrograma | Nome Programa | input | no | yes |
| siglaPrograma | Sigla Programa | input | no | yes |
| tipoPrograma | Tipo Programa | input | no | yes |
| orgaoResponsavel | Orgao Responsavel | input | no | yes |
| leiCriacao | Lei Criacao | input | no | yes |
| dtCriacao | Dt Criacao | input | no | yes |
| dtEncerramento | Dt Encerramento | input | no | yes |
| sitPrograma | Sit Programa | input | no | yes |
| vlrBaseIndividual | Vlr Base Individual | input | no | yes |
| vlrBaseFamiliar | Vlr Base Familiar | input | no | yes |
| vlrTetoBenef | Vlr Teto Benef | input | no | yes |
| vlrPisoBenef | Vlr Piso Benef | input | no | yes |
| pctReajusteAnual | Pct Reajuste Anual | input | no | yes |
| dtUltReajuste | Dt Ult Reajuste | input | no | yes |
| fatorK | Fator K | input | no | yes |
| rendaMaxPercap | Renda Max Percap | input | no | yes |
| idadeMin | Idade Min | input | no | yes |
| idadeMax | Idade Max | input | no | yes |
| indExigeFilhos | Ind Exige Filhos | input | no | yes |
| qtdMinFilhos | Qtd Min Filhos | input | no | yes |
| indExigeEscola | Ind Exige Escola | input | no | yes |
| indExigeVacina | Ind Exige Vacina | input | no | yes |
| indExigePrenatal | Ind Exige Prenatal | input | no | yes |
| indExigeBiometria | Ind Exige Biometria | input | no | yes |
| dtInclusao | Dt Inclusao | input | no | yes |
| usrInclusao | Usr Inclusao | input | no | yes |
| dtUltAlteracao | Dt Ult Alteracao | input | no | yes |
| usrUltAlteracao | Usr Ult Alteracao | input | no | yes |

## ProgramaSocialGrpFaixaCalculos  (`/programa_social_grp_faixa_calculos`)

| Field | Label | Component | Required | List column |
|---|---|---|---|---|
| rendaInicio | Renda Inicio | input | no | yes |
| rendaFim | Renda Fim | input | no | yes |
| fatorMultiplicador | Fator Multiplicador | input | no | yes |
| vlrAdicional | Vlr Adicional | input | no | yes |
| indAcumulativo | Ind Acumulativo | input | no | yes |

## ProgramaSocialGrpParamRegionals  (`/programa_social_grp_param_regionals`)

| Field | Label | Component | Required | List column |
|---|---|---|---|---|
| codRegiao | Cod Regiao | input | no | yes |
| fatorRegional | Fator Regional | input | no | yes |
| vlrComplementoReg | Vlr Complemento Reg | input | no | yes |
| indAtivoRegiao | Ind Ativo Regiao | input | no | yes |

## Auditorias  (`/auditorias`)

| Field | Label | Component | Required | List column |
|---|---|---|---|---|
| numAuditoria | Num Auditoria | input | no | yes |
| dtEvento | Dt Evento | input | no | yes |
| hrEvento | Hr Evento | input | no | yes |
| tsEvento | Ts Evento | input | no | yes |
| codAcao | Cod Acao | input | no | yes |
| codModulo | Cod Modulo | input | no | yes |
| desAcao | Des Acao | input | no | yes |
| tipoEntidade | Tipo Entidade | input | no | yes |
| idEntidade | Id Entidade | input | no | yes |
| numCpfAfetado | Num Cpf Afetado | input | no | yes |
| usrEvento | Usr Evento | input | no | yes |
| nomeUsuario | Nome Usuario | input | no | yes |
| codPerfil | Cod Perfil | input | no | yes |
| codLotacao | Cod Lotacao | input | no | yes |
| ipOrigem | Ip Origem | input | no | yes |
| idSessao | Id Sessao | input | no | yes |
| numCicloBatch | Num Ciclo Batch | input | no | yes |
| numSeqBatch | Num Seq Batch | input | no | yes |
| nomJobBatch | Nom Job Batch | input | no | yes |
| sitBatch | Sit Batch | input | no | yes |
| desErroBatch | Des Erro Batch | input | no | yes |
| idCorrelacao | Id Correlacao | input | no | yes |
| numSeqCorrelacao | Num Seq Correlacao | input | no | yes |

## Beneficiarios  (`/beneficiarios`)

| Field | Label | Component | Required | List column |
|---|---|---|---|---|
| numInscricao | Num Inscricao | input | no | yes |
| numCpf | Num Cpf | input | no | yes |
| nomeCompleto | Nome Completo | input | no | yes |
| nomeMae | Nome Mae | input | no | yes |
| nomePai | Nome Pai | input | no | yes |
| dtNascimento | Dt Nascimento | input | no | yes |
| sexo | Sexo | input | no | yes |
| estCivil | Est Civil | input | no | yes |
| rgNumero | Rg Numero | input | no | yes |
| rgOrgao | Rg Orgao | input | no | yes |
| rgUf | Rg Uf | input | no | yes |
| rgDtExpedicao | Rg Dt Expedicao | input | no | yes |
| logradouro | Logradouro | input | no | yes |
| numero | Numero | input | no | yes |
| complemento | Complemento | input | no | yes |
| bairro | Bairro | input | no | yes |
| municipio | Municipio | input | no | yes |
| uf | Uf | input | no | yes |
| cep | Cep | input | no | yes |
| codIbge | Cod Ibge | input | no | yes |
| codRegiao | Cod Regiao | input | no | yes |
| codPrograma | Cod Programa | input | no | yes |
| dtCadastro | Dt Cadastro | input | no | yes |
| dtInicioBenef | Dt Inicio Benef | input | no | yes |
| dtFimBenef | Dt Fim Benef | input | no | yes |
| sitBeneficiario | Sit Beneficiario | input | no | yes |
| motSituacao | Mot Situacao | input | no | yes |
| dtUltSituacao | Dt Ult Situacao | input | no | yes |
| vlrRendaFamiliar | Vlr Renda Familiar | input | no | yes |
| qtdMembrosFamilia | Qtd Membros Familia | input | no | yes |
| indRendaPercap | Ind Renda Percap | input | no | yes |
| telFixo | Tel Fixo | input | no | yes |
| telCelular | Tel Celular | input | no | yes |
| email | Email | input | no | yes |
| indBiometria | Ind Biometria | input | no | yes |
| dtColetaBio | Dt Coleta Bio | input | no | yes |
| codPostoBio | Cod Posto Bio | input | no | yes |
| hashDigital | Hash Digital | input | no | yes |
| dtInclusao | Dt Inclusao | input | no | yes |
| hrInclusao | Hr Inclusao | input | no | yes |
| usrInclusao | Usr Inclusao | input | no | yes |
| dtUltAlteracao | Dt Ult Alteracao | input | no | yes |
| hrUltAlteracao | Hr Ult Alteracao | input | no | yes |
| usrUltAlteracao | Usr Ult Alteracao | input | no | yes |
| numVersao | Num Versao | input | no | yes |

## BeneficiarioGrpDependentes  (`/beneficiario_grp_dependentes`)

| Field | Label | Component | Required | List column |
|---|---|---|---|---|
| cpfDependente | Cpf Dependente | input | no | yes |
| nomeDependente | Nome Dependente | input | no | yes |
| dtNascDepend | Dt Nasc Depend | input | no | yes |
| parentesco | Parentesco | input | no | yes |
| sitDependente | Sit Dependente | input | no | yes |
| indDeficiencia | Ind Deficiencia | input | no | yes |

## Pagamentos  (`/pagamentos`)

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

## PagamentoGrpDescontos  (`/pagamento_grp_descontos`)

| Field | Label | Component | Required | List column |
|---|---|---|---|---|
| tipoDesconto | Tipo Desconto | input | no | yes |
| vlrDesconto | Vlr Desconto | input | no | yes |
| pctDesconto | Pct Desconto | input | no | yes |
| numProcesso | Num Processo | input | no | yes |
| dtInicioDsct | Dt Inicio Dsct | input | no | yes |
| dtFimDsct | Dt Fim Dsct | input | no | yes |


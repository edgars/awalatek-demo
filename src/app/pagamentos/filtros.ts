// H2 (LGPD): el filtro por CPF de /pagamentos viaja como clave opaca del beneficiario
// (`?benef=`), nunca como CPF. Valores especiales de `benef` (no son claves válidas):

/** CPF informado pero incompleto → ninguna coincidencia y aviso "Informe o CPF completo". */
export const BENEF_CPF_INCOMPLETO = "cpf-incompleto";

/** CPF completo sin beneficiario registrado → ninguna coincidencia ("Nenhum pagamento"). */
export const BENEF_NAO_ENCONTRADO = "nao-encontrado";

/** Filtros (además de `benef`) que la URL de la lista conserva, en orden. */
export const PARAMS_LISTA = ["competencia", "programa", "situacao"] as const;

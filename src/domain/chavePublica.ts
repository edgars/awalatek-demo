// H2 (LGPD): las URLs identifican al beneficiario por `Beneficiario.chavePublica`
// (UUID v4 opaco y estable), nunca por el CPF ni el NIS. La clave sigue siendo un dato
// personal seudonimizado (LGPD art. 13 §4): no se registra en logs ni se expone fuera
// de la aplicación (Referrer-Policy: same-origin en next.config.ts).

/** Formato de la clave opaca (UUID en minúsculas, como lo genera Prisma y el backfill). */
export const FORMATO_CHAVE_PUBLICA = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// Valores especiales de `?benef=` (no son claves válidas): los generan las acciones de
// búsqueda por CPF (POST) al redirigir, para que el CPF nunca vaya a la URL.

/** CPF completo sin beneficiario registrado → ninguna coincidencia. */
export const BENEF_NAO_ENCONTRADO = "nao-encontrado";

/** CPF informado pero incompleto → ninguna coincidencia y aviso "Informe o CPF completo". */
export const BENEF_CPF_INCOMPLETO = "cpf-incompleto";

/** Falla inesperada al resolver el CPF → panel de error genérico de la pantalla. */
export const BENEF_ERRO = "erro";

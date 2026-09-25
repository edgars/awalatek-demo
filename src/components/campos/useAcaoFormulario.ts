"use client";

import { startTransition, useActionState, type FormEvent } from "react";

/**
 * `useActionState` sin el reset automático del formulario de React 19: tras un
 * error el operador conserva lo tecleado. Enter sigue enviando el formulario.
 */
export function useAcaoFormulario<S>(acao: (estado: Awaited<S>, dados: FormData) => Promise<S>, inicial: Awaited<S>) {
  const [estado, executar, pendente] = useActionState(acao, inicial);
  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const dados = new FormData(e.currentTarget);
    startTransition(() => executar(dados));
  };
  return { estado, onSubmit, pendente };
}

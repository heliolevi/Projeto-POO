"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { limparSessao, lerToken, type Sessao } from "./sessao";
import { useSessao } from "./use-sessao";

type EstadoGuarda = { sessao: Sessao | null; carregando: boolean };

// Só redireciona depois de ler a sessão (carregando = false). Sem sessão, ou com token
// inválido/expirado, manda para o login e guarda a rota de origem (com a query string) em
// ?next= para voltar depois de autenticar. Um token expirado que ficou no localStorage é
// apagado antes de sair.
export function useGuardaRota(): EstadoGuarda {
  const router = useRouter();
  const pathname = usePathname();
  const estado = useSessao();

  useEffect(() => {
    if (estado.carregando || estado.sessao) return;
    if (lerToken()) limparSessao();
    const origem = pathname + window.location.search;
    router.replace(`/login?next=${encodeURIComponent(origem)}`);
  }, [estado.carregando, estado.sessao, router, pathname]);

  return estado;
}

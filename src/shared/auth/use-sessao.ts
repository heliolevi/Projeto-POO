"use client";

import { useMemo, useSyncExternalStore } from "react";
import { assinarSessao, decodificarSessao, lerToken, type Sessao } from "./sessao";

type EstadoSessao = { sessao: Sessao | null; carregando: boolean };

// undefined = ainda não leu o localStorage. É o que o servidor e a hidratação veem, então
// o primeiro render é igual nos dois lados e não há aviso de hidratação divergente.
const naoLido = () => undefined;

export function useSessao(): EstadoSessao {
  const token = useSyncExternalStore<string | null | undefined>(assinarSessao, lerToken, naoLido);
  return useMemo(
    () => ({ sessao: decodificarSessao(token ?? null), carregando: token === undefined }),
    [token],
  );
}

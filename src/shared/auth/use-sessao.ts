"use client";

import { useMemo, useSyncExternalStore } from "react";
import { ArmazemDeSessao, Sessao } from "./sessao";

type EstadoSessao = { sessao: Sessao | null; carregando: boolean };

// undefined = ainda não leu o localStorage. É o que o servidor e a hidratação veem, então
// o primeiro render é igual nos dois lados e não há aviso de hidratação divergente.
const naoLido = () => undefined;
const assinar = (aoMudar: () => void) => ArmazemDeSessao.navegador.assinar(aoMudar);
const lerToken = () => ArmazemDeSessao.navegador.token();

export function useSessao(): EstadoSessao {
  const token = useSyncExternalStore<string | null | undefined>(assinar, lerToken, naoLido);
  return useMemo(
    () => ({ sessao: Sessao.decodificar(token ?? null), carregando: token === undefined }),
    [token],
  );
}

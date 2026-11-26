"use client";

import { useEffect, useState } from "react";
import { montarMapa, type AtividadesPorTipo } from "./fotos-dos-tipos";
import type { TipoPublico } from "./locadora";

// Uma única busca ao catálogo por visita: as telas seguintes reaproveitam a resposta.
let promessa: Promise<TipoPublico[]> | null = null;

export function carregarTiposPublicos(): Promise<TipoPublico[]> {
  promessa ??= fetch("/api/catalogo/tipos")
    .then((resposta) => (resposta.ok ? resposta.json() : Promise.reject(new Error("falhou"))))
    .then((json: { data: TipoPublico[] }) => json.data)
    .catch((erro) => {
      promessa = null; // falhou: a próxima tela tenta de novo
      throw erro;
    });
  return promessa;
}

// null enquanto carrega ou se o catálogo falhar; as telas usam a foto estável pelo id nesse caso.
export function useAtividadesPorTipo(): AtividadesPorTipo | null {
  const [mapa, setMapa] = useState<AtividadesPorTipo | null>(null);

  useEffect(() => {
    let ativo = true;
    carregarTiposPublicos()
      .then((tipos) => ativo && setMapa(montarMapa(tipos)))
      .catch(() => {
        // Sem o mapa, as fotos usam a escolha estável pelo id.
      });
    return () => {
      ativo = false;
    };
  }, []);

  return mapa;
}

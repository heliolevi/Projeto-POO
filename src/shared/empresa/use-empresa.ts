"use client";

import { useCallback, useEffect, useState } from "react";
import { buscarEmpresa, type ResultadoEmpresa } from "./empresa";

/**
 * Dados da locadora vindos de GET /api/empresa. `resultado` é null enquanto carrega. Uma resposta
 * que chega depois de a tela sair (ou depois de um novo "tentar de novo") é ignorada.
 */
export function useEmpresa(): { resultado: ResultadoEmpresa | null; recarregar: () => void } {
  const [resultado, setResultado] = useState<ResultadoEmpresa | null>(null);
  const [tentativa, setTentativa] = useState(0);

  useEffect(() => {
    let ativo = true;
    void buscarEmpresa().then((r) => {
      if (ativo) setResultado(r);
    });
    return () => {
      ativo = false;
    };
  }, [tentativa]);

  const recarregar = useCallback(() => {
    setResultado(null);
    setTentativa((atual) => atual + 1);
  }, []);

  return { resultado, recarregar };
}

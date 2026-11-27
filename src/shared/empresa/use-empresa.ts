"use client";

import { useCallback, useEffect, useState } from "react";
import { EmpresaEmCache } from "./empresa-em-cache";
import type { ResultadoDaEmpresa } from "./resultado-da-empresa";

/**
 * Dados da locadora vindos de GET /api/empresa. `resultado` é null enquanto carrega. Uma resposta
 * que chega depois de a tela sair (ou depois de um novo "tentar de novo") é ignorada. A busca é
 * dividida entre as telas pelo EmpresaEmCache; recarregar() descarta o que ele guardou.
 */
export function useEmpresa(): { resultado: ResultadoDaEmpresa | null; recarregar: () => void } {
  const [resultado, setResultado] = useState<ResultadoDaEmpresa | null>(null);
  const [tentativa, setTentativa] = useState(0);

  useEffect(() => {
    let ativo = true;
    void EmpresaEmCache.padrao.obter().then((r) => {
      if (ativo) setResultado(r);
    });
    return () => {
      ativo = false;
    };
  }, [tentativa]);

  const recarregar = useCallback(() => {
    EmpresaEmCache.padrao.invalidar();
    setResultado(null);
    setTentativa((atual) => atual + 1);
  }, []);

  return { resultado, recarregar };
}

"use client";

import { useEffect, useRef, useState } from "react";
import { formatarContagem, segundosRestantes } from "./reserva";

type Props = {
  expiraEm: string | null;
  /** Chamado uma vez quando o prazo chega a zero (por exemplo, para recarregar a reserva). */
  aoExpirar?: () => void;
};

// Contagem até o fim do prazo de pagamento de uma reserva pendente. O relógio só começa
// depois do mount, então o HTML do servidor e o primeiro render do cliente são iguais.
export function ContagemRegressiva({ expiraEm, aoExpirar }: Props) {
  const [agora, setAgora] = useState<Date | null>(null);
  const jaAvisou = useRef(false);

  useEffect(() => {
    const relogio = setInterval(() => setAgora(new Date()), 1000);
    const primeira = setTimeout(() => setAgora(new Date()), 0);
    return () => {
      clearInterval(relogio);
      clearTimeout(primeira);
    };
  }, []);

  const restante = agora ? segundosRestantes(expiraEm, agora) : null;

  useEffect(() => {
    if (restante === 0 && !jaAvisou.current) {
      jaAvisou.current = true;
      aoExpirar?.();
    }
  }, [restante, aoExpirar]);

  if (restante === null) return null;
  return restante > 0 ? (
    <span>Pague em {formatarContagem(restante)} para manter a reserva</span>
  ) : (
    <span>O prazo para pagar terminou</span>
  );
}

"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { lerSessao, type Sessao } from "./sessao";

// Sem sessão (ou com token inválido/expirado), manda para o login e guarda a
// rota de origem em ?next= para voltar depois de autenticar.
export function useGuardaRota(): Sessao | null {
  const router = useRouter();
  const pathname = usePathname();
  const [sessao] = useState<Sessao | null>(() => lerSessao());

  useEffect(() => {
    if (!sessao) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
  }, [sessao, router, pathname]);

  return sessao;
}

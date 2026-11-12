"use client";

import { useEffect, useState } from "react";
import { ROTULO_ATIVIDADE } from "@/shared/dominio/ciclista-rotulos";
import { ehAtividade } from "@/shared/dominio/ciclista";
import { formatarReais } from "@/shared/format/moeda-e-data";
import { Alert } from "@/shared/ui/Alert";
import { Badge } from "@/shared/ui/Badge";
import { Card } from "@/shared/ui/Card";
import { EmptyState } from "@/shared/ui/EmptyState";
import { faixaDeAltura, ordenarPorPreco, type TipoPublico } from "./locadora";
import styles from "./landing.module.css";

type Estado =
  | { tipo: "carregando" }
  | { tipo: "erro" }
  | { tipo: "pronto"; tipos: TipoPublico[] };

// A rota do catálogo é pública: a lista aparece mesmo para quem ainda não tem conta.
export function TiposEmDestaque() {
  const [estado, setEstado] = useState<Estado>({ tipo: "carregando" });
  const [tentativa, setTentativa] = useState(0);

  useEffect(() => {
    let ativo = true;
    fetch("/api/catalogo/tipos")
      .then((resposta) => (resposta.ok ? resposta.json() : Promise.reject(new Error("falhou"))))
      .then((json: { data: TipoPublico[] }) => {
        if (ativo) setEstado({ tipo: "pronto", tipos: ordenarPorPreco(json.data) });
      })
      .catch(() => {
        if (ativo) setEstado({ tipo: "erro" });
      });
    return () => {
      ativo = false;
    };
  }, [tentativa]);

  if (estado.tipo === "carregando") {
    return <p className={styles.secaoTexto}>Carregando as bicicletas...</p>;
  }

  if (estado.tipo === "erro") {
    return (
      <Alert
        variant="erro"
        action={
          <button
            type="button"
            className={styles.botaoSecundario}
            onClick={() => {
              setEstado({ tipo: "carregando" });
              setTentativa((atual) => atual + 1);
            }}
          >
            Tentar de novo
          </button>
        }
      >
        Não foi possível carregar as bicicletas agora.
      </Alert>
    );
  }

  if (estado.tipos.length === 0) {
    return (
      <EmptyState title="Em breve por aqui">
        Ainda não há bicicletas cadastradas. Volte daqui a pouco.
      </EmptyState>
    );
  }

  return (
    <ul className={`${styles.grade} ${styles.grade3}`}>
      {estado.tipos.map((tipo) => (
        <li key={tipo.id}>
          <Card className={styles.cartaoDaLista} title={tipo.nome} action={<Badge variant="sucesso">{formatarReais(tipo.precoDiaCentavos)}/dia</Badge>}>
            {tipo.descricao && <p style={{ margin: 0 }}>{tipo.descricao}</p>}
            <p className={styles.precoCartao}>
              <strong>{formatarReais(tipo.precoHoraCentavos)}</strong> por hora
            </p>
            <p style={{ margin: "var(--space-4) 0 0" }}>{faixaDeAltura(tipo)}</p>
            <div className={styles.etiquetas}>
              {tipo.atividades.filter(ehAtividade).map((atividade) => (
                <Badge key={atividade} variant="neutro">
                  {ROTULO_ATIVIDADE[atividade]}
                </Badge>
              ))}
            </div>
          </Card>
        </li>
      ))}
    </ul>
  );
}

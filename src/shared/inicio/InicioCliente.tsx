"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { formatarPeriodo, formatarReais } from "@/shared/format/moeda-e-data";
import { getAutenticado } from "@/shared/http/api-cliente";
import { FOTO_TURISMO, fotoDoTipo } from "@/shared/landing/fotos";
import { fotoDoTipoPorId } from "@/shared/landing/fotos-dos-tipos";
import {
  faixaDeAltura,
  LOCADORA,
  ordenarPorPreco,
  type TipoPublico,
} from "@/shared/landing/locadora";
import { carregarTiposPublicos, useAtividadesPorTipo } from "@/shared/landing/use-fotos-dos-tipos";
import type { ContaLogada } from "@/shared/perfil/perfil-ciclista";
import type { Reserva } from "@/shared/reservas/reserva";
import { SeloStatus } from "@/shared/reservas/SeloStatus";
import { FotoCapa } from "@/shared/ui/FotoCapa";
import { primeiroNome, proximaReserva, saudacao } from "./inicio";
import styles from "./Inicio.module.css";

type Carga<T> = { tipo: "carregando" } | { tipo: "erro" } | { tipo: "pronto"; dados: T };

// Tela inicial do cliente: um convite para buscar, o que ele já reservou e as bicicletas da casa.
export function InicioCliente() {
  const [conta, setConta] = useState<ContaLogada | null>(null);
  const [reservas, setReservas] = useState<Carga<Reserva[]>>({ tipo: "carregando" });
  const [tipos, setTipos] = useState<Carga<TipoPublico[]>>({ tipo: "carregando" });
  const atividades = useAtividadesPorTipo();

  useEffect(() => {
    let ativo = true;
    getAutenticado<ContaLogada>("/api/conta/me")
      .then((dados) => ativo && setConta(dados))
      .catch(() => {
        // O nome é só um carinho: sem ele a saudação fica sem o nome.
      });
    getAutenticado<Reserva[]>("/api/reservas")
      .then((dados) => ativo && setReservas({ tipo: "pronto", dados }))
      .catch(() => ativo && setReservas({ tipo: "erro" }));
    carregarTiposPublicos()
      .then((dados) => ativo && setTipos({ tipo: "pronto", dados: ordenarPorPreco(dados) }))
      .catch(() => ativo && setTipos({ tipo: "erro" }));
    return () => {
      ativo = false;
    };
  }, []);

  const nome = conta ? primeiroNome(conta.nome) : "";
  const proxima = reservas.tipo === "pronto" ? proximaReserva(reservas.dados) : null;

  return (
    <div className={styles.pagina}>
      <header className={styles.saudacao}>
        <p className={styles.saudacaoLinha}>
          {saudacao()}
          {nome ? "," : ""}
        </p>
        <h2 className={styles.saudacaoNome}>{nome || "Bem-vindo"}</h2>
      </header>

      <FotoCapa foto={FOTO_TURISMO} formato="capa" sizes="(min-width: 768px) 592px, 100vw" priority>
        <span className={styles.etiqueta}>São Luís · {LOCADORA.ponto.nome}</span>
        <p className={styles.heroiTitulo}>Qual bicicleta combina com o seu passeio?</p>
        <p className={styles.heroiTexto}>
          Conte sua altura e o que quer fazer. Mostramos primeiro a mais indicada para você.
        </p>
        <Link href="/app/buscar" className={styles.botaoMenta}>
          Buscar bicicleta <span aria-hidden="true">→</span>
        </Link>
      </FotoCapa>

      <section className={styles.secao} aria-labelledby="inicio-reserva">
        <div className={styles.secaoTopo}>
          <h3 id="inicio-reserva" className={styles.secaoTitulo}>
            Sua próxima reserva
          </h3>
          {reservas.tipo === "pronto" && reservas.dados.length > 0 && (
            <Link href="/app/reservas" className={styles.secaoLink}>
              Ver todas
            </Link>
          )}
        </div>

        {reservas.tipo === "carregando" && (
          <div className={`${styles.esqueleto} ${styles.esqueletoReserva}`} aria-hidden="true" />
        )}

        {reservas.tipo === "erro" && (
          <p className={styles.aviso} role="status">
            Não foi possível carregar suas reservas agora.{" "}
            <Link href="/app/reservas">Abrir minhas reservas</Link>
          </p>
        )}

        {proxima && (
          <Link href={`/app/reservas/${proxima.id}`} className={styles.reservaCartao}>
            <FotoCapa
              foto={fotoDoTipoPorId(atividades, proxima.tipo.id)}
              formato="miniatura"
              sizes="104px"
            />
            <div className={styles.reservaCorpo}>
              <SeloStatus status={proxima.status} />
              <strong className={styles.reservaTitulo}>Bicicleta {proxima.tipo.nome}</strong>
              <span className={styles.reservaLinha}>
                {formatarPeriodo(proxima.periodo.inicio, proxima.periodo.fim)}
              </span>
              <span className={styles.reservaLinha}>{proxima.ponto.nome}</span>
            </div>
          </Link>
        )}

        {reservas.tipo === "pronto" && !proxima && (
          <div className={styles.vazioCartao}>
            <strong>Nenhuma reserva por aqui ainda</strong>
            <span>
              Escolha o dia e a bicicleta certa para o seu passeio. A retirada é no balcão, em um
              único ponto.
            </span>
            <Link href="/app/buscar" className={styles.botaoSecundario}>
              Fazer minha primeira reserva
            </Link>
          </div>
        )}
      </section>

      <section className={styles.secao} aria-labelledby="inicio-bicicletas">
        <div className={styles.secaoTopo}>
          <h3 id="inicio-bicicletas" className={styles.secaoTitulo}>
            Bicicletas da casa
          </h3>
          <Link href="/app/buscar" className={styles.secaoLink}>
            Buscar
          </Link>
        </div>

        {tipos.tipo === "carregando" && (
          <div className={`${styles.esqueleto} ${styles.esqueletoCarrossel}`} aria-hidden="true" />
        )}

        {tipos.tipo === "erro" && (
          <p className={styles.aviso} role="status">
            Não foi possível carregar as bicicletas agora.{" "}
            <Link href="/app/buscar">Ir para a busca</Link>
          </p>
        )}

        {tipos.tipo === "pronto" && tipos.dados.length === 0 && (
          <p className={styles.aviso}>
            Em breve por aqui: a locadora ainda está cadastrando as bicicletas.
          </p>
        )}

        {tipos.tipo === "pronto" && tipos.dados.length > 0 && (
          <ul className={styles.carrossel}>
            {tipos.dados.map((tipo) => (
              <li key={tipo.id}>
                <Link href="/app/buscar" className={styles.tipoCartao}>
                  <FotoCapa foto={fotoDoTipo(tipo.atividades)} formato="cartao" sizes="240px">
                    <span className={styles.preco}>
                      {formatarReais(tipo.precoDiaCentavos)}
                      <small>/dia</small>
                    </span>
                  </FotoCapa>
                  <span className={styles.tipoNome}>{tipo.nome}</span>
                  <span className={styles.tipoInfo}>
                    {faixaDeAltura(tipo)} · {formatarReais(tipo.precoHoraCentavos)}/hora
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={styles.retirada} aria-labelledby="inicio-retirada">
        <h3 id="inicio-retirada" className={styles.secaoTitulo}>
          Retirada e devolução
        </h3>
        <p>
          <strong>{LOCADORA.ponto.nome}</strong>
        </p>
        <p>{LOCADORA.ponto.endereco}</p>
        <p>Leve {LOCADORA.documentosNaRetirada.toLowerCase()}.</p>
      </section>
    </div>
  );
}

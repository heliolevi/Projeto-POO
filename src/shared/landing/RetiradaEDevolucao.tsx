"use client";

import { Fragment } from "react";
import { EmpresaCarregada, type EmpresaDaLocadora } from "@/shared/empresa";
import { useEmpresa } from "@/shared/empresa/use-empresa";
import { Alert } from "@/shared/ui/Alert";
import { Card } from "@/shared/ui/Card";
import { EmptyState } from "@/shared/ui/EmptyState";
import { LOCADORA } from "./locadora";
import styles from "./landing.module.css";

// Seção "Retirada e devolução" da página inicial. Endereço, contato e horários vêm de
// GET /api/empresa (rota pública, então aparece também para quem não tem conta). A retirada com
// documento e o pagamento são regra da casa e não vêm da API.
export function RetiradaEDevolucao() {
  const { resultado, recarregar } = useEmpresa();

  return (
    <div className={`${styles.grade} ${styles.grade2}`}>
      {resultado === null && (
        <p className={styles.secaoTexto} role="status">
          Carregando os dados da locadora...
        </p>
      )}

      {resultado?.tipo === "erro" && (
        <div style={{ gridColumn: "1 / -1" }}>
          <Alert
            variant="erro"
            action={
              <button type="button" className={styles.botaoSecundario} onClick={recarregar}>
                Tentar de novo
              </button>
            }
          >
            Não foi possível carregar o endereço e os horários agora.
          </Alert>
        </div>
      )}

      {resultado?.tipo === "semCadastro" && <SemPonto />}

      {resultado instanceof EmpresaCarregada &&
        (resultado.empresa.pontos.length === 0 ? <SemPonto /> : <PontosDaEmpresa empresa={resultado.empresa} />)}

      <Card title="Na retirada, leve">
        <p style={{ margin: 0 }}>{LOCADORA.documentosNaRetirada}.</p>
      </Card>
      <Card title="Pagamento">
        <p style={{ margin: 0 }}>
          O aluguel é pago por Pix na hora da reserva. A caução é combinada no balcão.
        </p>
      </Card>
    </div>
  );
}

function SemPonto() {
  return (
    <div style={{ gridColumn: "1 / -1" }}>
      <EmptyState title="Ponto de retirada em breve">
        O endereço e os horários ainda não foram informados. Volte daqui a pouco.
      </EmptyState>
    </div>
  );
}

function PontosDaEmpresa({ empresa }: { empresa: EmpresaDaLocadora }) {
  const varios = empresa.pontos.length > 1;
  return (
    <>
      {empresa.pontos.map((ponto) => {
        const horarios = ponto.horarios.resumir();
        const endereco = ponto.endereco();
        const telefone = empresa.telefoneDoPonto(ponto);
        return (
          <Fragment key={ponto.id}>
            <Card title={ponto.nome}>
              <ul className={styles.listaSimples}>
                {endereco && <li>{endereco}</li>}
                {telefone && <li>Telefone: {telefone}</li>}
                {empresa.email && <li>E-mail: {empresa.email}</li>}
                {!endereco && !telefone && !empresa.email && <li>Dados de contato não informados.</li>}
              </ul>
            </Card>
            <Card title={varios ? `Horário: ${ponto.nome}` : "Horário de funcionamento"}>
              {horarios.length === 0 ? (
                <p style={{ margin: 0 }}>Horário não informado.</p>
              ) : (
                <ul className={styles.listaSimples}>
                  {horarios.map((linha) => (
                    <li key={linha.dias}>
                      <strong>{linha.dias}:</strong> {linha.horario}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </Fragment>
        );
      })}
    </>
  );
}

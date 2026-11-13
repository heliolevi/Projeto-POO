import type { Metadata } from "next";
import { ChamadasDoHeroi, LandingHeader } from "@/shared/landing/LandingHeader";
import { TiposEmDestaque } from "@/shared/landing/TiposEmDestaque";
import { LOCADORA, PASSOS } from "@/shared/landing/locadora";
import styles from "@/shared/landing/landing.module.css";
import { Card } from "@/shared/ui/Card";

export const metadata: Metadata = {
  title: "Bike Ilha Club | Aluguel de bicicletas em São Luís",
  description:
    "Alugue a bicicleta certa para o seu passeio em São Luís: informe sua altura, experiência e atividade e reserve com Pix.",
};

export default function Home() {
  return (
    <div className={styles.pagina}>
      <LandingHeader />

      <main>
        <section className={styles.heroi} aria-labelledby="titulo-heroi">
          <div className={styles.heroiConteudo}>
            <span className={styles.selo}>Aluguel de bicicletas em São Luís</span>
            <h1 id="titulo-heroi" className={styles.titulo}>
              A bicicleta certa para o seu passeio
            </h1>
            <p className={styles.subtitulo}>
              Conte sua altura, sua experiência e o que você quer fazer. Mostramos as bicicletas
              livres no dia que você escolher, da mais indicada para a menos.
            </p>
            <ChamadasDoHeroi />
          </div>
        </section>

        <section className={styles.secao} aria-labelledby="titulo-como-funciona">
          <h2 id="titulo-como-funciona" className={styles.secaoTitulo}>
            Como funciona
          </h2>
          <p className={styles.secaoTexto}>Três passos, do cadastro à retirada.</p>
          <ol className={`${styles.grade} ${styles.grade3}`}>
            {PASSOS.map((passo, indice) => (
              <li key={passo.titulo}>
                <Card>
                  <span className={styles.numero} aria-hidden="true">
                    {indice + 1}
                  </span>
                  <h3 style={{ margin: "var(--space-8) 0 var(--space-4)", fontSize: "var(--font-size-lg)" }}>
                    {passo.titulo}
                  </h3>
                  <p style={{ margin: 0 }}>{passo.texto}</p>
                </Card>
              </li>
            ))}
          </ol>
        </section>

        <section className={styles.secao} aria-labelledby="titulo-bicicletas">
          <h2 id="titulo-bicicletas" className={styles.secaoTitulo}>
            Nossas bicicletas
          </h2>
          <p className={styles.secaoTexto}>
            Modelos para passeio, cidade, trilha e esporte. A recomendação mostra a mais indicada
            para você.
          </p>
          <TiposEmDestaque />
        </section>

        <section className={styles.secao} aria-labelledby="titulo-retirada">
          <h2 id="titulo-retirada" className={styles.secaoTitulo}>
            Retirada e devolução
          </h2>
          <p className={styles.secaoTexto}>Um único ponto, onde ficam todas as bicicletas.</p>
          <div className={`${styles.grade} ${styles.grade2}`}>
            <Card title={LOCADORA.ponto.nome}>
              <ul className={styles.listaSimples}>
                <li>{LOCADORA.ponto.endereco}</li>
                <li>Telefone e WhatsApp: {LOCADORA.telefone}</li>
                <li>E-mail: {LOCADORA.email}</li>
              </ul>
            </Card>
            <Card title="Horário de funcionamento">
              <ul className={styles.listaSimples}>
                {LOCADORA.horarios.map((linha) => (
                  <li key={linha.dias}>
                    <strong>{linha.dias}:</strong> {linha.horario}
                  </li>
                ))}
              </ul>
            </Card>
            <Card title="Na retirada, leve">
              <p style={{ margin: 0 }}>{LOCADORA.documentosNaRetirada}.</p>
            </Card>
            <Card title="Pagamento">
              <p style={{ margin: 0 }}>
                O aluguel é pago por Pix na hora da reserva. A caução é combinada no balcão.
              </p>
            </Card>
          </div>
        </section>
      </main>

      <footer className={styles.rodape}>
        <p style={{ margin: 0 }}>
          {LOCADORA.nome} é um projeto acadêmico da UNDB. Nomes, preços, telefones e e-mails desta
          página são fictícios.
        </p>
      </footer>
    </div>
  );
}

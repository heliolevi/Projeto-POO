import Link from "next/link";
import { FOTO_URBANA } from "@/shared/landing/fotos";
import { FotoCapa } from "./FotoCapa";
import styles from "./PainelDaEquipe.module.css";

type Atalho = { href: string; titulo: string; texto: string };

// Início da equipe (OPERADOR e ADMIN): uma foto de capa e os atalhos de cada painel.
export function PainelDaEquipe({ admin }: { admin: boolean }) {
  const atalhos: Atalho[] = [
    {
      href: "/app/operacao",
      titulo: "Operação",
      texto: "Reservas do dia, retirada e devolução com checklist.",
    },
    ...(admin
      ? [
          {
            href: "/admin",
            titulo: "Catálogo",
            texto: "Tipos de bicicleta, preços e as unidades da frota.",
          },
        ]
      : []),
    { href: "/app/conta", titulo: "Minha conta", texto: "Dados de acesso e senha." },
  ];

  return (
    <div className={styles.pagina}>
      <FotoCapa
        foto={FOTO_URBANA}
        formato="capa"
        texto="topo"
        sizes="(min-width: 768px) 592px, 100vw"
        priority
      >
        <span className={styles.etiqueta}>{admin ? "Administração" : "Balcão"}</span>
        <h2 className={styles.titulo}>Painel da equipe</h2>
        <p className={styles.texto}>
          {admin
            ? "Acompanhe o balcão e mantenha o catálogo da locadora em dia."
            : "Registre retiradas e devoluções e acompanhe as reservas do dia."}
        </p>
      </FotoCapa>

      <ul className={styles.atalhos}>
        {atalhos.map((atalho) => (
          <li key={atalho.href}>
            <Link href={atalho.href} className={styles.atalho}>
              <span className={styles.atalhoTitulo}>{atalho.titulo}</span>
              <span className={styles.atalhoTexto}>{atalho.texto}</span>
              <span className={styles.seta} aria-hidden="true">
                →
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

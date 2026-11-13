import { redirect } from "next/navigation";

// Endereço antigo: a tela de verdade fica dentro do app.
export default function Page() {
  redirect("/app/reservas");
}

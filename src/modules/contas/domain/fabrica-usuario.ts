import { Admin } from "./admin.ts";
import { Cliente, type DadosCliente } from "./cliente.ts";
import { Operador, type DadosOperador } from "./operador.ts";
import type { DadosUsuario, Usuario } from "./usuario-base.ts";
import type { PerfilUsuario } from "./usuario.ts";

export type LinhaDeUsuario = { perfil: PerfilUsuario } & DadosUsuario &
  Partial<Omit<DadosCliente, keyof DadosUsuario>> &
  Partial<Pick<DadosOperador, "pontoId">>;

// Fábrica: escolhe a subclasse certa pelo perfil. Quem usa o resultado só conhece Usuario e
// chama os mesmos métodos; o comportamento de cada perfil vem da própria subclasse (polimorfismo).
export function criarUsuario(linha: LinhaDeUsuario): Usuario {
  switch (linha.perfil) {
    case "CLIENTE":
      return new Cliente(linha);
    case "OPERADOR":
      return new Operador(linha);
    case "ADMIN":
      return new Admin(linha);
    default: {
      // um perfil fora da lista (banco num estado inesperado) não vira nenhum objeto
      const desconhecido: never = linha.perfil;
      throw new RangeError(`Perfil de usuário desconhecido: ${String(desconhecido)}`);
    }
  }
}

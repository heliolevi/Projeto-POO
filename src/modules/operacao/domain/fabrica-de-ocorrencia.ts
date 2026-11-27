import { Atraso, type DadosAtraso } from "./atraso.ts";
import { Dano, type DadosDano } from "./dano.ts";
import { Furto, type DadosFurto } from "./furto.ts";
import { OcorrenciaInvalida, type DadosBaseOcorrencia, type TipoDeOcorrencia } from "./ocorrencia.ts";

// Fábrica: escolhe a subclasse certa pelo tipo (polimorfismo). A ocorrência já nasce aberta, a menos
// que os dados tragam o estado de uma que veio do banco. ACIDENTE e OUTRO existem no banco, mas ainda
// não têm classe nem regra de cobrança: pedir um deles dá erro (409), em vez de cobrar sem regra.
export class FabricaDeOcorrencia {
  private constructor() {
    throw new Error("FabricaDeOcorrencia só tem métodos estáticos: use FabricaDeOcorrencia.abrir().");
  }

  static abrir(tipo: "DANO", dados: DadosDano): Dano;
  static abrir(tipo: "ATRASO", dados: DadosAtraso): Atraso;
  static abrir(tipo: "FURTO", dados: DadosFurto): Furto;
  static abrir(tipo: "ACIDENTE" | "OUTRO", dados: DadosBaseOcorrencia): never;
  static abrir(tipo: TipoDeOcorrencia, dados: DadosBaseOcorrencia): Dano | Atraso | Furto {
    switch (tipo) {
      case "DANO":
        return new Dano(dados as DadosDano);
      case "ATRASO":
        return new Atraso(dados as DadosAtraso);
      case "FURTO":
        return new Furto(dados as DadosFurto);
      case "ACIDENTE":
      case "OUTRO":
        throw new OcorrenciaInvalida(`Ainda não há regra de cobrança para ocorrência do tipo ${tipo}.`);
      default:
        throw new OcorrenciaInvalida("Tipo de ocorrência desconhecido.");
    }
  }
}

import { ValidationError } from "../../../shared/http/errors.ts";

// O checklist que o operador preenche no balcão na retirada e na devolução (rotas 26 e 27 de
// docs/contrato-api-mvp.md). Objetos de valor: só existem válidos, os campos são privados e quem
// pede os itens recebe uma cópia.

// Limites: o painel manda 5 itens; a folga cobre itens a mais sem abrir espaço para abuso (o corpo
// inteiro já é limitado a 16 KiB).
export const MAXIMO_DE_ITENS = 20;
export const TAMANHO_MAXIMO_DO_NOME = 40;
export const TAMANHO_MAXIMO_DAS_OBSERVACOES = 1000;

export type ItemDoChecklistDto = { nome: string; ok: boolean };

// Um item conferido: o que foi olhado (freios, pneus...) e se estava em ordem.
export class ItemDoChecklist {
  readonly #nome: string;
  readonly #ok: boolean;

  constructor(nome: string, ok: boolean) {
    const limpo = nome.trim();
    if (limpo === "" || limpo.length > TAMANHO_MAXIMO_DO_NOME) {
      throw new RangeError(`O item precisa de um nome de 1 a ${TAMANHO_MAXIMO_DO_NOME} caracteres.`);
    }
    if (typeof ok !== "boolean") throw new RangeError("O item precisa estar ok (true) ou com problema (false).");
    this.#nome = limpo;
    this.#ok = ok;
  }

  get nome(): string {
    return this.#nome;
  }

  get ok(): boolean {
    return this.#ok;
  }

  /** Mesmo item, sem diferenciar maiúsculas: "Freios" e "freios" são o mesmo. */
  mesmoItemQue(outro: ItemDoChecklist): boolean {
    return this.#nome.toLowerCase() === outro.#nome.toLowerCase();
  }

  paraDto(): ItemDoChecklistDto {
    return { nome: this.#nome, ok: this.#ok };
  }

  toJSON(): ItemDoChecklistDto {
    return this.paraDto();
  }
}

// A lista de itens (1 a 20, sem repetir) e as observações do operador.
export class Checklist {
  readonly #itens: readonly ItemDoChecklist[];
  readonly #observacoes: string | null;

  constructor(itens: readonly ItemDoChecklist[], observacoes: string | null = null) {
    if (itens.length === 0 || itens.length > MAXIMO_DE_ITENS) {
      throw new RangeError(`O checklist precisa de 1 a ${MAXIMO_DE_ITENS} itens.`);
    }
    itens.forEach((item, i) => {
      if (itens.slice(0, i).some((anterior) => anterior.mesmoItemQue(item))) {
        throw new RangeError(`O item "${item.nome}" está repetido no checklist.`);
      }
    });
    const texto = observacoes?.trim() ?? "";
    if (texto.length > TAMANHO_MAXIMO_DAS_OBSERVACOES) {
      throw new RangeError(`As observações podem ter até ${TAMANHO_MAXIMO_DAS_OBSERVACOES} caracteres.`);
    }
    this.#itens = [...itens];
    this.#observacoes = texto === "" ? null : texto;
  }

  /**
   * Lê o corpo das rotas 26 e 27: `{ "checklist": { "itens": [{ "nome", "ok" }], "observacoes" } }`.
   * Junta todos os problemas num ValidationError (400) com o campo de cada um, como a API responde.
   */
  static #ehObjeto(valor: unknown): valor is Record<string, unknown> {
    return typeof valor === "object" && valor !== null && !Array.isArray(valor);
  }

  static deCorpo(corpo: unknown): Checklist {
    if (!Checklist.#ehObjeto(corpo)) throw new ValidationError("O corpo precisa ser um objeto JSON.");
    const bruto = corpo.checklist;
    if (!Checklist.#ehObjeto(bruto)) {
      throw new ValidationError("Dados inválidos.", { checklist: "Envie o checklist com a lista de itens." });
    }

    const erros: Record<string, string> = {};
    const itens: ItemDoChecklist[] = [];
    const brutos = bruto.itens;
    if (!Array.isArray(brutos) || brutos.length === 0 || brutos.length > MAXIMO_DE_ITENS) {
      erros.itens = `Envie de 1 a ${MAXIMO_DE_ITENS} itens no checklist.`;
    } else {
      brutos.forEach((itemBruto, i) => {
        const nome = Checklist.#ehObjeto(itemBruto) && typeof itemBruto.nome === "string" ? itemBruto.nome.trim() : "";
        if (!nome || nome.length > TAMANHO_MAXIMO_DO_NOME) {
          erros[`itens[${i}].nome`] = `Informe o nome do item (até ${TAMANHO_MAXIMO_DO_NOME} caracteres).`;
          return;
        }
        if (!Checklist.#ehObjeto(itemBruto) || typeof itemBruto.ok !== "boolean") {
          erros[`itens[${i}].ok`] = "Marque o item como ok (true) ou com problema (false).";
          return;
        }
        const item = new ItemDoChecklist(nome, itemBruto.ok);
        if (itens.some((anterior) => anterior.mesmoItemQue(item))) {
          erros[`itens[${i}].nome`] = "Item repetido no checklist.";
          return;
        }
        itens.push(item);
      });
    }

    let observacoes: string | null = null;
    if (bruto.observacoes !== undefined && bruto.observacoes !== null) {
      if (typeof bruto.observacoes !== "string") {
        erros.observacoes = "As observações precisam ser texto.";
      } else if (bruto.observacoes.trim().length > TAMANHO_MAXIMO_DAS_OBSERVACOES) {
        erros.observacoes = `As observações podem ter até ${TAMANHO_MAXIMO_DAS_OBSERVACOES} caracteres.`;
      } else {
        observacoes = bruto.observacoes;
      }
    }

    if (Object.keys(erros).length > 0) throw new ValidationError("Checklist inválido.", erros);
    return new Checklist(itens, observacoes);
  }

  get itens(): ItemDoChecklist[] {
    return [...this.#itens];
  }

  get observacoes(): string | null {
    return this.#observacoes;
  }

  /** Algum item foi marcado com problema (o painel pode destacar a movimentação). */
  temProblema(): boolean {
    return this.#itens.some((item) => !item.ok);
  }

  /** O que vai para a coluna jsonb `movimentacao.checklist`: a lista de `{ nome, ok }`. */
  itensParaPersistir(): ItemDoChecklistDto[] {
    return this.#itens.map((item) => item.paraDto());
  }
}

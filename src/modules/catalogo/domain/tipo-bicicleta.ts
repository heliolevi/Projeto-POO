import {
  ALTURA_MAX_CM,
  ALTURA_MIN_CM,
  EXPERIENCIAS,
  type Atividade,
  type Experiencia,
} from "../../../shared/dominio/ciclista.ts";
import { Dinheiro } from "../../../shared/dominio/dinheiro.ts";
import { calcularValorAluguel, type PeriodoCobravel } from "../../../shared/dominio/preco-aluguel.ts";
import { paraPublico as paraPublicoDoDto, type TipoAdmin, type TipoPublico } from "./catalogo.ts";

// Um modelo de bicicleta que a locadora aluga (Urbana, Mountain bike...): para quem serve, quanto
// custa e qual caução cobra. As unidades físicas são `Bicicleta`.
//
// Encapsulamento: os dados são privados e só mudam por métodos que mantêm a regra (faixa de altura
// coerente, preços em centavos inteiros). O construtor recusa SÓ o que o banco também recusa
// (tipo_bicicleta_altura_faixa, tipo_bicicleta_altura_ordem, tipo_bicicleta_atividades_nao_vazia,
// preços inteiros não negativos e o enum de nível): assim uma linha válida no banco nunca derruba a
// listagem pública. Regras de formato que o banco não impõe, como o tamanho do nome, são da API
// (validarTipo), não do domínio.
export class TipoBicicleta {
  readonly #id: string;
  #nome: string;
  #descricao: string | null;
  #atividades: readonly Atividade[];
  #alturaMinCm: number;
  #alturaMaxCm: number;
  #nivelRecomendado: Experiencia;
  #precoHora: Dinheiro;
  #precoDia: Dinheiro;
  #valorCaucao: Dinheiro;
  #ativo: boolean;

  constructor(dados: TipoAdmin) {
    if (!dados.id) throw new RangeError("O tipo precisa de um id.");
    if (dados.atividades.length === 0) throw new RangeError("O tipo precisa servir a ao menos uma atividade.");
    for (const altura of [dados.alturaMinCm, dados.alturaMaxCm]) {
      if (!Number.isInteger(altura) || altura < ALTURA_MIN_CM || altura > ALTURA_MAX_CM) {
        throw new RangeError(`A altura do tipo precisa ser um inteiro entre ${ALTURA_MIN_CM} e ${ALTURA_MAX_CM} cm.`);
      }
    }
    if (dados.alturaMinCm > dados.alturaMaxCm) {
      throw new RangeError("A altura máxima precisa ser maior ou igual à mínima.");
    }
    if (!EXPERIENCIAS.includes(dados.nivelRecomendado)) {
      throw new RangeError("Nível recomendado inválido.");
    }
    this.#id = dados.id;
    this.#nome = dados.nome;
    this.#descricao = dados.descricao;
    this.#atividades = [...dados.atividades];
    this.#alturaMinCm = dados.alturaMinCm;
    this.#alturaMaxCm = dados.alturaMaxCm;
    this.#nivelRecomendado = dados.nivelRecomendado;
    this.#precoHora = Dinheiro.deCentavos(dados.precoHoraCentavos);
    this.#precoDia = Dinheiro.deCentavos(dados.precoDiaCentavos);
    this.#valorCaucao = Dinheiro.deCentavos(dados.valorCaucaoCentavos);
    this.#ativo = dados.ativo;
  }

  get id(): string {
    return this.#id;
  }
  get nome(): string {
    return this.#nome;
  }
  get descricao(): string | null {
    return this.#descricao;
  }
  get atividades(): readonly Atividade[] {
    return [...this.#atividades];
  }
  get alturaMinCm(): number {
    return this.#alturaMinCm;
  }
  get alturaMaxCm(): number {
    return this.#alturaMaxCm;
  }
  get nivelRecomendado(): Experiencia {
    return this.#nivelRecomendado;
  }
  get precoHora(): Dinheiro {
    return this.#precoHora;
  }
  get precoDia(): Dinheiro {
    return this.#precoDia;
  }
  get valorCaucao(): Dinheiro {
    return this.#valorCaucao;
  }
  get ativo(): boolean {
    return this.#ativo;
  }

  // A faixa de altura inclui as duas pontas.
  servePara(alturaCm: number): boolean {
    return alturaCm >= this.#alturaMinCm && alturaCm <= this.#alturaMaxCm;
  }

  serveParaAtividade(atividade: Atividade): boolean {
    return this.#atividades.includes(atividade);
  }

  // Valor do aluguel no período, pela regra única do sistema (src/shared/dominio/preco-aluguel.ts):
  // a mesma que a recomendação e a reserva usam, então o preço mostrado é o cobrado.
  calcularPreco(periodo: PeriodoCobravel): Dinheiro {
    return Dinheiro.deCentavos(
      calcularValorAluguel(periodo, {
        precoHoraCentavos: this.#precoHora.centavos,
        precoDiaCentavos: this.#precoDia.centavos,
      }),
    );
  }

  // Um tipo sai do catálogo ficando inativo; não existe exclusão.
  desativar(): void {
    this.#ativo = false;
  }

  reativar(): void {
    this.#ativo = true;
  }

  // Troca os preços (Dinheiro já garante centavos inteiros não negativos).
  alterarPrecos(precoHora: Dinheiro, precoDia: Dinheiro): void {
    this.#precoHora = precoHora;
    this.#precoDia = precoDia;
  }

  // A visão da API de administração (rotas 19 a 21).
  paraAdmin(): TipoAdmin {
    return {
      id: this.#id,
      nome: this.#nome,
      descricao: this.#descricao,
      atividades: [...this.#atividades],
      alturaMinCm: this.#alturaMinCm,
      alturaMaxCm: this.#alturaMaxCm,
      nivelRecomendado: this.#nivelRecomendado,
      precoHoraCentavos: this.#precoHora.centavos,
      precoDiaCentavos: this.#precoDia.centavos,
      valorCaucaoCentavos: this.#valorCaucao.centavos,
      ativo: this.#ativo,
    };
  }

  // O catálogo público não mostra `ativo`. A cópia campo a campo mora em paraPublico() (catalogo.ts),
  // de propósito: um campo novo em TipoAdmin não vaza para o público sem alguém decidir.
  paraPublico(): TipoPublico {
    return paraPublicoDoDto(this.paraAdmin());
  }
}

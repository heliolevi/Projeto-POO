import { ConflictError } from "../../../shared/http/errors.ts";
import type { Periodo } from "../../../shared/dominio/periodo-aluguel.ts";
import type { BicicletaAdmin } from "./catalogo.ts";

// Mesmos valores do enum status_bicicleta do banco. ALUGADA existe no banco mas a API não a cria
// (a disponibilidade vem das reservas), então só o domínio a reconhece para recusar alterações.
export type SituacaoDaBicicleta = BicicletaAdmin["status"];

// 409: a bicicleta não está num estado que permita a operação pedida.
export class TransicaoDeBicicletaInvalida extends ConflictError {}

// Uma unidade física da frota. O que a torna alugável é o status (DISPONIVEL) mais a ausência de
// reserva ativa no período; o status só marca manutenção, bloqueio ou baixa.
//
// Encapsulamento: o status é privado e só muda por bloquear(), enviarParaManutencao(), liberar() e
// baixar(); BAIXADA é definitiva (a bicicleta saiu da frota).
export class Bicicleta {
  readonly #id: string;
  readonly #codigo: string;
  readonly #tipo: { id: string; nome: string };
  readonly #ponto: { id: string; nome: string };
  readonly #numeroSerie: string | null;
  readonly #tamanhoQuadro: string | null;
  #status: SituacaoDaBicicleta;
  #observacoes: string | null;

  constructor(dados: BicicletaAdmin) {
    if (!dados.id) throw new RangeError("A bicicleta precisa de um id.");
    if (dados.codigo.trim().length === 0) throw new RangeError("A bicicleta precisa de um código.");
    this.#id = dados.id;
    this.#codigo = dados.codigo;
    this.#tipo = { ...dados.tipo };
    this.#ponto = { ...dados.ponto };
    this.#numeroSerie = dados.numeroSerie;
    this.#tamanhoQuadro = dados.tamanhoQuadro;
    this.#status = dados.status;
    this.#observacoes = dados.observacoes;
  }

  get id(): string {
    return this.#id;
  }
  get codigo(): string {
    return this.#codigo;
  }
  get tipoId(): string {
    return this.#tipo.id;
  }
  get pontoId(): string {
    return this.#ponto.id;
  }
  get numeroSerie(): string | null {
    return this.#numeroSerie;
  }
  get tamanhoQuadro(): string | null {
    return this.#tamanhoQuadro;
  }
  get status(): SituacaoDaBicicleta {
    return this.#status;
  }
  get observacoes(): string | null {
    return this.#observacoes;
  }

  // Pode ser reservada no período: está DISPONIVEL e nenhuma reserva ativa dela se sobrepõe.
  // `ocupacoes` são os períodos das reservas ativas (pendente, confirmada ou em andamento).
  estaDisponivel(periodo: Periodo, ocupacoes: readonly Periodo[] = []): boolean {
    return this.#status === "DISPONIVEL" && !ocupacoes.some((ocupado) => ocupado.sobrepoe(periodo));
  }

  // Tira a bicicleta de circulação por um motivo (anotado nas observações).
  bloquear(motivo: string): void {
    if (motivo.trim().length === 0) throw new RangeError("Informe o motivo do bloqueio.");
    this.#exigirAlteravel("bloquear");
    this.#status = "BLOQUEADA";
    this.#observacoes = motivo.trim();
  }

  enviarParaManutencao(motivo?: string): void {
    this.#exigirAlteravel("enviar para manutenção");
    this.#status = "MANUTENCAO";
    if (motivo !== undefined && motivo.trim() !== "") this.#observacoes = motivo.trim();
  }

  // Volta à circulação. Liberar uma bicicleta já disponível não muda nada. Ao sair do bloqueio ou da
  // manutenção, o motivo deixa de valer e some das observações.
  liberar(): void {
    this.#exigirAlteravel("liberar");
    if (this.#status === "DISPONIVEL") return;
    this.#status = "DISPONIVEL";
    this.#observacoes = null;
  }

  // Saída definitiva da frota (venda, perda): não volta mais. Dar baixa de novo é recusado, para o
  // motivo da primeira baixa não ser sobrescrito.
  baixar(motivo: string): void {
    if (motivo.trim().length === 0) throw new RangeError("Informe o motivo da baixa.");
    if (this.#status === "BAIXADA") {
      throw new TransicaoDeBicicletaInvalida("Esta bicicleta já foi baixada da frota.");
    }
    if (this.#status === "ALUGADA") {
      throw new TransicaoDeBicicletaInvalida("Não é possível dar baixa numa bicicleta alugada.");
    }
    this.#status = "BAIXADA";
    this.#observacoes = motivo.trim();
  }

  #exigirAlteravel(acao: string): void {
    if (this.#status === "BAIXADA") {
      throw new TransicaoDeBicicletaInvalida(`Não é possível ${acao}: a bicicleta foi baixada da frota.`);
    }
    if (this.#status === "ALUGADA") {
      throw new TransicaoDeBicicletaInvalida(`Não é possível ${acao}: a bicicleta está alugada.`);
    }
  }

  paraAdmin(): BicicletaAdmin {
    return {
      id: this.#id,
      codigo: this.#codigo,
      tipo: { ...this.#tipo },
      ponto: { ...this.#ponto },
      numeroSerie: this.#numeroSerie,
      tamanhoQuadro: this.#tamanhoQuadro,
      status: this.#status,
      observacoes: this.#observacoes,
    };
  }
}

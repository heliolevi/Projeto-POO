// O que acontece depois de o cliente tocar em "Simular pagamento". Cada situação é uma subclasse
// que sabe dizer sozinha se a tela muda de estado e que aviso mostra, então o componente pergunta
// ao objeto em vez de decidir por `if` sobre o código do erro.
export type SituacaoFinal = "confirmado" | "encerrado" | "pagoSemReserva";

export abstract class ResultadoDaSimulacao {
  /** Para onde a tela vai (confirmada, encerrada...), ou null se ela continua como está. */
  abstract situacaoFinal(): SituacaoFinal | null;

  /** Aviso para mostrar abaixo do botão, ou null. */
  abstract aviso(): string | null;
}

abstract class SimulacaoQueMudaATela extends ResultadoDaSimulacao {
  abstract readonly destino: SituacaoFinal;

  situacaoFinal(): SituacaoFinal {
    return this.destino;
  }

  aviso(): null {
    return null;
  }
}

/** Pagamento aprovado e reserva confirmada (também quando a reserva já estava paga). */
export class SimulacaoConfirmada extends SimulacaoQueMudaATela {
  readonly destino = "confirmado" as const;
}

/** A reserva expirou, foi cancelada ou o Pix terminou: não aceita mais pagamento. */
export class SimulacaoEncerrada extends SimulacaoQueMudaATela {
  readonly destino = "encerrado" as const;
}

/** O pagamento foi aprovado, mas a reserva já não estava ativa. */
export class SimulacaoPagaSemReserva extends SimulacaoQueMudaATela {
  readonly destino = "pagoSemReserva" as const;
}

/** A aprovação foi enviada, mas a conferência ainda não mostra a reserva confirmada: a tela segue consultando. */
export class SimulacaoAindaPendente extends ResultadoDaSimulacao {
  situacaoFinal(): null {
    return null;
  }

  aviso(): string {
    return "Pagamento enviado. Estamos conferindo, esta tela atualiza sozinha.";
  }
}

/** A rota de simulação não existe ou está desligada no servidor (404 sem o JSON do contrato, ou o código próprio). */
export class SimulacaoIndisponivel extends ResultadoDaSimulacao {
  situacaoFinal(): null {
    return null;
  }

  aviso(): string {
    return "A aprovação simulada não está disponível no servidor agora.";
  }
}

/** 404 com o JSON do contrato: a reserva não existe ou é de outro cliente. */
export class SimulacaoReservaNaoEncontrada extends ResultadoDaSimulacao {
  situacaoFinal(): null {
    return null;
  }

  aviso(): string {
    return "Não encontramos esta reserva na sua conta.";
  }
}

/** 409 e a conferência não mostra pagamento nem reserva encerrada. */
export class SimulacaoReservaNaoAceita extends ResultadoDaSimulacao {
  situacaoFinal(): null {
    return null;
  }

  aviso(): string {
    return "Esta reserva não aceita mais pagamento. Volte para a reserva.";
  }
}

/** Qualquer outra falha (rede, servidor): mostra a mensagem que o cliente da API já preparou. */
export class SimulacaoFalhou extends ResultadoDaSimulacao {
  readonly #mensagem: string;

  constructor(mensagem: string) {
    super();
    this.#mensagem = mensagem;
  }

  situacaoFinal(): null {
    return null;
  }

  aviso(): string {
    return this.#mensagem;
  }
}

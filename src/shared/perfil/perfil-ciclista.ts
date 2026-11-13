import {
  ALTURA_MAX_CM,
  ALTURA_MIN_CM,
  alturaValida,
  ehAtividade,
  ehExperiencia,
  type Atividade,
  type Experiencia,
} from "../dominio/ciclista.ts";

// Dados do ciclista como a API devolve (GET /api/conta/me) e recebe (PUT /api/conta/perfil-ciclista).
export type PerfilCiclista = {
  alturaCm: number | null;
  experiencia: Experiencia | null;
  atividade: Atividade | null;
};

export type ContaLogada = {
  id: string;
  perfil: "CLIENTE" | "OPERADOR" | "ADMIN";
  nome: string;
  email: string;
  ciclista?: PerfilCiclista;
};

// O formulário trabalha com texto: campo vazio quer dizer "não informado".
export type FormularioPerfil = { altura: string; experiencia: string; atividade: string };

export type ErrosPerfil = Partial<Record<keyof FormularioPerfil | "corpo", string>>;

export function formularioInicial(ciclista?: PerfilCiclista | null): FormularioPerfil {
  return {
    altura: ciclista?.alturaCm != null ? String(ciclista.alturaCm) : "",
    experiencia: ciclista?.experiencia ?? "",
    atividade: ciclista?.atividade ?? "",
  };
}

export function validarPerfil(form: FormularioPerfil): ErrosPerfil {
  const erros: ErrosPerfil = {};
  const altura = form.altura.trim();
  if (altura !== "") {
    if (!/^\d+$/.test(altura) || !alturaValida(Number(altura))) {
      erros.altura = `Informe a altura em centímetros, de ${ALTURA_MIN_CM} a ${ALTURA_MAX_CM}.`;
    }
  }
  if (form.experiencia !== "" && !ehExperiencia(form.experiencia)) {
    erros.experiencia = "Escolha uma das opções.";
  }
  if (form.atividade !== "" && !ehAtividade(form.atividade)) {
    erros.atividade = "Escolha uma das opções.";
  }
  return erros;
}

// A rota substitui os três campos de uma vez e só aceita essas três chaves: campo vazio vai
// como null (apaga o dado), nunca fica de fora.
export function montarCorpo(form: FormularioPerfil): PerfilCiclista {
  const altura = form.altura.trim();
  return {
    alturaCm: altura === "" ? null : Number(altura),
    experiencia: ehExperiencia(form.experiencia) ? form.experiencia : null,
    atividade: ehAtividade(form.atividade) ? form.atividade : null,
  };
}

export function perfilCompleto(ciclista?: PerfilCiclista | null): boolean {
  return Boolean(ciclista && ciclista.alturaCm && ciclista.experiencia && ciclista.atividade);
}

/** Quantos dos três dados do formulário estão preenchidos com um valor aceito (0 a 3). */
export function dadosInformados(form: FormularioPerfil): number {
  const altura = form.altura.trim();
  return [
    /^\d+$/.test(altura) && alturaValida(Number(altura)),
    ehExperiencia(form.experiencia),
    ehAtividade(form.atividade),
  ].filter(Boolean).length;
}

// Altura de partida para os botões − e + quando o campo está vazio: perto da média de adultos.
const ALTURA_INICIAL_CM = 170;

/**
 * Soma `passo` centímetros à altura do campo e devolve o texto novo, sempre dentro da faixa
 * aceita. Campo vazio ou com texto parte de 170 cm.
 */
export function ajustarAltura(texto: string, passo: number): string {
  const atual = /^\d+$/.test(texto.trim()) ? Number(texto.trim()) : ALTURA_INICIAL_CM - passo;
  return String(Math.min(ALTURA_MAX_CM, Math.max(ALTURA_MIN_CM, atual + passo)));
}

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

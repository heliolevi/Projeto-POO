// Enumerações do banco (migration 0004) que descrevem o ciclista e o que cada tipo de bicicleta
// serve. Ficam em shared porque três módulos usam as mesmas listas: contas (perfil do cliente),
// catalogo (cadastro dos tipos) e recomendacao (pontuação). Uma só fonte evita que o enum do
// banco e as validações saiam de sincronia.
export const EXPERIENCIAS = ["INICIANTE", "INTERMEDIARIO", "AVANCADO"] as const;
export type Experiencia = (typeof EXPERIENCIAS)[number];

export const ATIVIDADES = ["PASSEIO", "URBANO", "TRILHA", "ESPORTE", "TURISMO"] as const;
export type Atividade = (typeof ATIVIDADES)[number];

// A altura do ciclista (e a faixa de cada tipo) aceita de 100 a 250 cm, como as constraints
// usuario_altura_faixa e tipo_bicicleta_altura_faixa.
export const ALTURA_MIN_CM = 100;
export const ALTURA_MAX_CM = 250;

export function ehExperiencia(valor: unknown): valor is Experiencia {
  return typeof valor === "string" && (EXPERIENCIAS as readonly string[]).includes(valor);
}

export function ehAtividade(valor: unknown): valor is Atividade {
  return typeof valor === "string" && (ATIVIDADES as readonly string[]).includes(valor);
}

export function alturaValida(valor: unknown): valor is number {
  return (
    typeof valor === "number" &&
    Number.isInteger(valor) &&
    valor >= ALTURA_MIN_CM &&
    valor <= ALTURA_MAX_CM
  );
}

// O que as classes precisam de um banco: rodar uma consulta com parâmetros e devolver as linhas.
// O BancoDeDados implementa isto de verdade; os testes entregam um objeto de mentira com o mesmo método.
export interface ExecutorDeConsultas {
  consultar(sql: string, valores?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
}

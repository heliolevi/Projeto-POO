import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CodigoPix } from "./codigo-pix.ts";

// Exemplo oficial do Manual de Padrões para Iniciação do Pix (Banco Central), com o CRC já calculado
// por eles (1D3D). Se o nosso CRC16 bater com este, ele bate com o de qualquer banco.
const EXEMPLO_DO_BANCO_CENTRAL =
  "00020126580014br.gov.bcb.pix0136123e4567-e12b-12d1-a456-426655440000" +
  "5204000053039865802BR5913Fulano de Tal6008BRASILIA62070503***63041D3D";

// O texto que a Stripe devolve em modo de teste (gravado no banco de desenvolvimento).
const CODIGO_DE_TESTE_DA_STRIPE =
  "123456789br.gov.bcb.pixapi.developer.stripe.com/v1/p/v2/1234567890abcdef/789";

// Monta um BR Code com o CRC certo, para variar um campo por vez.
function montar(corpoSemCrc: string): string {
  const base = `${corpoSemCrc}6304`;
  return base + CodigoPix.crc16(base);
}

const CONTA = "0014br.gov.bcb.pix0136123e4567-e12b-12d1-a456-426655440000";
const campo = (id: string, valor: string) => `${id}${String(valor.length).padStart(2, "0")}${valor}`;
const corpo = (extra: { conta?: string; moeda?: string; pais?: string; versao?: string } = {}) =>
  campo("00", extra.versao ?? "01") +
  campo("26", extra.conta ?? CONTA) +
  campo("52", "0000") +
  campo("53", extra.moeda ?? "986") +
  campo("58", extra.pais ?? "BR") +
  campo("59", "Bike Ilha Club") +
  campo("60", "Florianopolis") +
  campo("62", campo("05", "***"));

describe("CodigoPix", () => {
  it("calcula o CRC16 igual ao do exemplo oficial do Banco Central", () => {
    assert.equal(CodigoPix.crc16(EXEMPLO_DO_BANCO_CENTRAL.slice(0, -4)), "1D3D");
  });

  it("o exemplo oficial é pagável em banco", () => {
    assert.equal(CodigoPix.de(EXEMPLO_DO_BANCO_CENTRAL).pagavelEmBanco, true);
  });

  it("o código de teste da Stripe não é pagável (é o motivo do 'copia e cola não existe')", () => {
    const codigo = CodigoPix.de(CODIGO_DE_TESTE_DA_STRIPE);
    assert.equal(codigo.pagavelEmBanco, false);
    assert.equal(codigo.texto, CODIGO_DE_TESTE_DA_STRIPE);
  });

  it("um BR Code montado com o CRC certo é pagável", () => {
    assert.equal(CodigoPix.de(montar(corpo())).pagavelEmBanco, true);
  });

  it("um caractere trocado quebra o CRC e o código deixa de ser pagável", () => {
    const valido = montar(corpo());
    const trocado = valido.replace("Bike Ilha Club", "Bike Ilha Clob");
    assert.equal(CodigoPix.de(trocado).pagavelEmBanco, false);
  });

  it("CRC em minúsculas também confere (alguns geradores escrevem assim)", () => {
    const valido = montar(corpo());
    assert.equal(CodigoPix.de(valido.slice(0, -4) + valido.slice(-4).toLowerCase()).pagavelEmBanco, true);
  });

  it("recusa como pagável: outra moeda, outro país, outra versão ou conta que não é Pix", () => {
    assert.equal(CodigoPix.de(montar(corpo({ moeda: "840" }))).pagavelEmBanco, false);
    assert.equal(CodigoPix.de(montar(corpo({ pais: "US" }))).pagavelEmBanco, false);
    assert.equal(CodigoPix.de(montar(corpo({ versao: "02" }))).pagavelEmBanco, false);
    assert.equal(CodigoPix.de(montar(corpo({ conta: "0014br.gov.bcb.xyz0101X" }))).pagavelEmBanco, false);
  });

  it("um tamanho de campo que passa do fim do texto não é BR Code", () => {
    // o campo 59 diz ter 99 caracteres, mas o texto acaba antes; o CRC é recalculado para não ser
    // ele o motivo da recusa
    assert.equal(CodigoPix.de(montar(`${campo("00", "01")}5999curto`)).pagavelEmBanco, false);
    assert.equal(CodigoPix.campos("5999curto"), null);
  });

  it("lê os campos ID + TAMANHO + VALOR", () => {
    assert.deepEqual(CodigoPix.campos("000201" + "5802BR"), [
      { id: "00", valor: "01" },
      { id: "58", valor: "BR" },
    ]);
  });

  it("não aceita texto vazio e tira espaços das pontas", () => {
    assert.throws(() => CodigoPix.de(""), RangeError);
    assert.throws(() => CodigoPix.de("   "), RangeError);
    assert.equal(CodigoPix.de(`  ${EXEMPLO_DO_BANCO_CENTRAL}\n`).pagavelEmBanco, true);
  });

  it("é um objeto de valor: igual compara pelo texto", () => {
    assert.ok(CodigoPix.de(EXEMPLO_DO_BANCO_CENTRAL).igual(CodigoPix.de(EXEMPLO_DO_BANCO_CENTRAL)));
    assert.ok(!CodigoPix.de(EXEMPLO_DO_BANCO_CENTRAL).igual(CodigoPix.de(CODIGO_DE_TESTE_DA_STRIPE)));
    assert.equal(String(CodigoPix.de(EXEMPLO_DO_BANCO_CENTRAL)), EXEMPLO_DO_BANCO_CENTRAL);
  });

  it("encapsulamento: nenhum campo visível e nada se altera de fora", () => {
    const codigo = CodigoPix.de(EXEMPLO_DO_BANCO_CENTRAL);
    assert.deepEqual(Object.keys(codigo), []);
    assert.throws(() => {
      (codigo as unknown as { texto: string }).texto = "outro";
    }, TypeError);
    assert.equal(codigo.texto, EXEMPLO_DO_BANCO_CENTRAL);
    assert.equal(codigo.pagavelEmBanco, true);
  });

  it("aguenta lixo sem lançar erro (só diz que não é pagável)", () => {
    for (const lixo of ["6304", "63041D3D", "0002", "x".repeat(5000), "00020163041D3D", "'; DROP TABLE pagamento;--"]) {
      assert.equal(CodigoPix.de(lixo).pagavelEmBanco, false, lixo.slice(0, 30));
    }
  });
});

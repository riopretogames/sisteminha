import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * A regra de cor dos botões, cobrada no código.
 *
 * Este teste existe por um motivo específico: a regra foi escrita em 09/08 e
 * em 23/08 tinha **1 único uso** no sistema inteiro — 121 botões azuis, 1
 * verde, 0 âmbar. Regra que só vive num comentário não sobrevive ao segundo
 * mês.
 *
 * Aqui ela é conferida no código-fonte: se alguém criar um "Salvar" azul, o
 * teste reprova e explica o porquê. Não é preciosismo de cor — é o que faz
 * alguém em treinamento não clicar em "cancelar venda" achando que está
 * confirmando. Quem trabalha rápido lê a cor antes de ler a palavra.
 */

const RAIZ = join(process.cwd(), 'src');

function telas(dir: string, achados: string[] = []): string[] {
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) {
      // `ui/` é a biblioteca de componentes: é lá que as cores são DEFINIDAS,
      // não usadas. Cobrar a regra ali reprovaria a própria definição.
      if (nome !== 'ui' && nome !== 'test') telas(caminho, achados);
    } else if (nome.endsWith('.tsx') && !nome.includes('.test.')) {
      achados.push(caminho);
    }
  }
  return achados;
}

/** Todos os `<Button ...>texto</Button>` do sistema, com arquivo e linha. */
function botoes() {
  const lista: { arquivo: string; linha: number; atributos: string; texto: string }[] = [];
  for (const caminho of telas(RAIZ)) {
    const fonte = readFileSync(caminho, 'utf-8');
    const re = /<Button\b([^>]*?)>([\s\S]*?)<\/Button>/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(fonte)) !== null) {
      const texto = m[2]
        .replace(/<[^>]+>/g, ' ')
        .replace(/\{[^{}]*\}/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      lista.push({
        arquivo: caminho.replace(process.cwd(), '').replace(/\\/g, '/'),
        linha: fonte.slice(0, m.index).split('\n').length,
        atributos: m[1],
        // O `>` da seta `=>` corta o regex de atributos, então parte do
        // onClick vaza para o texto. Guardamos os dois juntos para as buscas.
        texto: texto + ' ' + m[1],
      });
    }
  }
  return lista;
}

const TODOS = botoes();

function variante(atributos: string): string {
  const m = atributos.match(/variant="([a-z]+)"/);
  return m ? m[1] : 'default';
}

/** Só o texto visível, sem o onClick que vazou. */
function rotulo(b: { texto: string }): string {
  return b.texto.replace(/\{[\s\S]*/, '').replace(/=>.*/, '').trim();
}

describe('A cor do botão ensina o que ele faz', () => {
  it('existem botões para conferir (o teste não passa por lista vazia)', () => {
    expect(TODOS.length).toBeGreaterThan(100);
  });

  it('nenhum "Salvar" é azul — salvar é confirmar, e confirmar é verde', () => {
    const errados = TODOS.filter(
      (b) => /^salvar\b/i.test(rotulo(b)) && variante(b.atributos) === 'default',
    ).map((b) => `${b.arquivo}:${b.linha} — "${rotulo(b)}"`);

    expect(errados, `Use variant="sucesso":\n${errados.join('\n')}`).toEqual([]);
  });

  it('nenhum "Cancelar" é azul — cancelar é vermelho', () => {
    const errados = TODOS.filter(
      (b) => /^cancelar$/i.test(rotulo(b)) && variante(b.atributos) === 'default',
    ).map((b) => `${b.arquivo}:${b.linha}`);

    expect(errados, `Use variant="cancelar":\n${errados.join('\n')}`).toEqual([]);
  });

  it('todo "Cancelar" usa vermelho, contornado ou sólido', () => {
    const errados = TODOS.filter((b) => {
      if (!/^cancelar$/i.test(rotulo(b))) return false;
      return !['cancelar', 'destructive'].includes(variante(b.atributos));
    }).map((b) => `${b.arquivo}:${b.linha} — hoje é "${variante(b.atributos)}"`);

    expect(errados, `Cancelar tem que ser vermelho:\n${errados.join('\n')}`).toEqual([]);
  });

  it('o verde não vira decoração: menos de um quarto dos botões', () => {
    // A regra que mais economiza discussão, do próprio acoes.ts: se tudo
    // virar colorido, a cor deixa de avisar. Verde demais é o mesmo que
    // verde nenhum.
    const verdes = TODOS.filter((b) => variante(b.atributos) === 'sucesso').length;
    expect(verdes / TODOS.length).toBeLessThan(0.25);
  });

  it('a regra saiu do papel: o verde é usado de verdade', () => {
    // Em 23/08, antes desta rodada, havia UM único botão verde no sistema
    // inteiro. A regra existia e ninguém aplicava.
    const verdes = TODOS.filter((b) => variante(b.atributos) === 'sucesso').length;
    expect(verdes).toBeGreaterThan(5);
  });
});

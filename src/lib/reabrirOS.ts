import { moeda } from '@/lib/format';

/**
 * Confirmação antes de tirar uma OS de "Entregue".
 *
 * Achado na revisão de 18/08: os dois caminhos que mudam etapa (o seletor da
 * ficha e o arrastar/selecionar do Kanban) ofereciam voltar uma OS já
 * entregue pro meio do fluxo sem aviso nenhum.
 *
 * Por que não basta proibir: reabrir é legítimo com frequência — cliente
 * volta com o mesmo defeito, ou alguém marcou "entregue" por engano.
 *
 * Por que não pode passar calado: entregar já gerou o título no financeiro.
 * Reabrir NÃO desfaz esse título (e entregar de novo também não duplica a
 * cobrança — o gatilho cuida disso). O risco está no valor: com a OS
 * reaberta o orçamento volta a ficar editável, e se alguém mexer, a ficha
 * passa a mostrar um número e o título lançado outro, sem nada na tela
 * denunciando a diferença.
 *
 * Fica num arquivo só porque são dois caminhos com o mesmo risco — texto
 * duplicado envelhece diferente em cada tela.
 *
 * @returns `true` se pode seguir com a mudança de etapa.
 */
export function confirmarReaberturaDeOSEntregue(params: {
  numeroOs: string;
  /** Rótulo da etapa de destino, como aparece pro usuário. */
  destino: string;
  tipo: 'paga' | 'garantia' | 'cortesia';
  totalOrcamento: number;
}): boolean {
  const { numeroOs, destino, tipo, totalOrcamento } = params;
  const temCobranca = tipo === 'paga' && totalOrcamento > 0;

  const linhas = [
    `A OS ${numeroOs} já foi entregue ao cliente.`,
    '',
    temCobranca
      ? `A cobrança de ${moeda(totalOrcamento)} já está lançada no financeiro e CONTINUA lá — reabrir não desfaz o título.`
      : 'Esta OS não gerou cobrança (garantia, cortesia ou orçamento zerado).',
    '',
    `Ao voltar para "${destino}", o valor do orçamento volta a ficar editável.`,
  ];

  if (temCobranca) {
    linhas.push('Se ele for alterado, a ficha e o financeiro vão mostrar valores diferentes.');
  }

  linhas.push('', 'Reabrir mesmo assim?');

  return confirm(linhas.join('\n'));
}

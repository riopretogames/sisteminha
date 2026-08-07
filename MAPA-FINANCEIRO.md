# Mapa do Financeiro — antes de mexer

**Data:** 07/08/2026
**Por que este documento existe:** o `PLANO-DE-REFINAMENTO.md` tinha 6 itens
para o Financeiro. Mapeando a área antes de mexer, apareceram **26 problemas**
— quase todos ligados ao mesmo buraco. Este documento é o levantamento; o
plano continua sendo o lugar de decidir o que fazer e em que ordem.

---

## O buraco central: o Caixa é uma caderneta isolada

O Caixa existe para uma coisa só: **conferência cega**. Alguém conta a gaveta
sem ver o número do sistema, digita, e o sistema diz se bateu. É o único
controle da loja contra dinheiro sumindo.

Hoje a conta do "valor esperado" é, literalmente, uma linha:

```
valor de abertura (troco)  +  soma do que alguém digitou à mão nesta tela
```

`FinanceiroCaixa.tsx:103-107`

**Não entra nessa conta:** venda do PDV, OS entregue e paga, baixa de conta a
pagar ou receber, devolução de dinheiro. Nenhum desses caminhos escreve uma
linha em `caixa_movimentos` — a busca no projeto inteiro mostra que **só a
própria tela de Caixa escreve lá** (`FinanceiroCaixa.tsx:125,148,171`).

### Por que isso é pior do que "o número fica errado"

O fechamento vai acusar **sobra** todo santo dia, no valor de quase todas as
vendas em dinheiro. E uma sobra que aparece todo dia é uma sobra que ninguém
investiga.

O efeito perverso: se um funcionário tirar R$ 100 da gaveta, a sobra apenas
fica R$ 100 menor. **O furto se esconde dentro do erro.** O controle não só
falha — ele dá cobertura para exatamente aquilo que deveria pegar.

---

## O que já existe pronto e está parado

A estrutura para ligar caixa ao resto foi construída e nunca foi usada:

| O que existe | Onde | Situação |
|---|---|---|
| `caixa_movimentos.venda_id` | `20260801000005:133-135` | sempre vazia |
| `caixa_movimentos.titulo_id` | idem | sempre vazia |
| `caixa_movimentos.forma_pagamento_id` | idem | sempre vazia |
| `titulos_financeiros.venda_id` | `20260801000005:52` | sempre vazia |
| `titulos_financeiros.forma_pagamento_id` | `20260801000005:63` | sempre vazia |
| tipo de movimento `venda` no enum | `20260801000005:95` | nenhuma tela gera |
| flag `formas_pagamento.entra_no_caixa` | `20260801000003:261` | **ninguém lê** |

Boa notícia: o conserto é menos trabalhoso do que parece — o lugar já está
reservado. Má notícia: a tela de Formas de Pagamento **diz** que a flag
"alimenta o fechamento de caixa". Não alimenta. É configuração que dá a
impressão de controlar dinheiro e não controla nada.

**Atenção antes de usar a flag:** hoje ela está LIGADA em PIX, Cartão Débito,
Cartão Crédito, Link de Pagamento e Shopee. Usar como está faria o caixa
esperar na gaveta um dinheiro que foi para a maquininha.

---

## Restrição técnica que decide o desenho

Inserir em `caixa_movimentos` exige a permissão `finance.cashier.close`
(`20260801000005:330-338`), que o papel **vendedor não tem**
(`20260801000002:157-168`).

Consequência: se a ligação venda→caixa for feita pelo lado da tela (o PDV
inserindo o movimento), **o banco vai recusar toda venda feita por vendedor** e
as vendas passam a falhar no balcão.

A ligação precisa ser feita por **gatilho no banco**, com privilégio elevado —
o mesmo padrão que o título da OS já usa.

---

## Problemas por tema

### Dinheiro que entra ou sai e o Caixa não sabe

1. **Venda do PDV não gera movimento de caixa.** `PDV.tsx:412-461`
2. **OS entregue gera título já "pago"**, sem forma de pagamento e sem
   movimento de caixa. `20260805150000:47-62` — e como o título não guarda a
   forma, nem depois dá para reconstruir quanto da assistência veio em
   dinheiro.
3. **Devolução de dinheiro não sai de lugar nenhum.** `TrocaDevolucao.tsx:351-364`
   Tira R$ 300 da gaveta e, para o sistema, o dinheiro nunca saiu. Vira falta
   inexplicável no fechamento e o resultado do mês fica R$ 300 melhor do que foi.
4. **Baixa de título não gera movimento de caixa.** `useTitulos.ts:145-156`
   Para o número bater, alguém tem que lançar a mesma coisa duas vezes — e vai
   esquecer.

### O troco não é gravado

5. **O PDV grava o valor cheio que o cliente entregou, não o que ficou na
   gaveta.** `PDV.tsx:328-329` calcula o troco e `PDV.tsx:449-455` grava
   `p.valor` cheio. Cliente compra R$ 80 e paga com R$ 100: fica registrado
   R$ 100 em dinheiro, mas a gaveta ficou com R$ 80. Todo troco vira falsa
   falta e infla o total de "Dinheiro" no relatório de Pagamentos. Vinte vendas
   em dinheiro por dia = dezenas de reais de ruído.

### Faturamento contado a mais (contamina premiação)

6. **A troca conta o produto duas vezes.** `TrocaDevolucao.tsx:288-327` — a
   venda nova grava o preço cheio, mas só a diferença é cobrada; a venda
   original nunca é mexida. Contamina 8 telas que somam dinheiro, **incluindo o
   Dashboard de Metas**. Ou seja: a loja pode bater meta e pagar premiação em
   cima de dinheiro que nunca entrou.
7. **O rodapé "Total" dos relatórios soma linhas canceladas**, brigando com o
   indicador do topo da mesma tela, que exclui canceladas.

### Datas erradas

8. **Fluxo de Caixa recorta o período pelo VENCIMENTO, não pela data real do
   pagamento.** `FluxoCaixa.tsx:49-51,66-67` — `pago_em` só é usado como texto
   na tela, nunca como filtro. Conta que vencia em 30/07 e foi paga em 05/08
   aparece em julho. O "Realizado" nunca bate com o extrato. O comentário no
   topo do próprio arquivo avisa que esse é o erro mais comum em fluxo de caixa
   — e o arquivo reproduz o erro.

### Permissões

9. **Quem opera a gaveta não tem permissão de caixa.** O perfil Vendedor não
   recebe nenhuma permissão de financeiro. Ou o gerente vira gargalo, ou alguém
   empresta login — que é pior. `20260801000002:157-168`
10. **Assimetria que quebra a tela:** entrar exige `finance.cashier.close`, ver
    os movimentos exige `finance.view`. Quem tiver só a primeira entra, não
    enxerga o caixa aberto, vê o botão de abrir, clica e recebe "já existe
    caixa aberto". Tela quebrada sem explicação.
11. **Relatório Financeiro confere a permissão errada.** Liberado por
    `finance.view`, mas a RLS da tabela exige outra. Quem tiver só
    `finance.view` abre o relatório e **vê tudo zerado, sem nenhum aviso**.

### Integridade e rastro

12. **Regra de acesso do caixa é `FOR ALL`:** quem fecha também pode alterar
    sessão já fechada (mudar o valor contado, a diferença) e apagar a sessão
    inteira — e apagar a sessão apaga os movimentos em cascata.
    `20260801000005:310-319` e `:129`
13. **`caixa_movimentos` não tem gatilho de auditoria**, ao contrário de
    vendas, produtos, OS, títulos e sessões. Sangria é justamente por onde
    dinheiro sai da gaveta, e é o único lançamento financeiro sem rastro.
14. **O valor esperado e a diferença são calculados no navegador** e gravados
    como número fixo; o banco não recalcula. Se alguém lançar uma sangria em
    outro computador enquanto a tela de fechamento está aberta, grava-se uma
    diferença errada — para sempre, como se fosse verdade conferida.
15. **Nada exige caixa aberto para vender.** Dá para vender o dia inteiro sem
    abrir o caixa, e essas vendas ficam órfãs — sem sessão a que pertencer.

### Erros de digitação que passam calados

16. **Separador de milhar no valor de abertura vira zero.**
    `FinanceiroCaixa.tsx:128` troca só a PRIMEIRA vírgula por ponto, então
    "1.500,00" vira "1.500.00", que não é número, e o `|| 0` transforma em
    zero **sem avisar**. Abriu com R$ 1.500 de troco? Fica R$ 0,00.

### Buracos de tela

17. **Não existe histórico de caixas fechados.** Fechou, sumiu. Não dá para
    responder "quanto faltou na terça passada?".
18. **Vendas > Pagamentos agrupa pela categoria antiga** (`forma`) e ignora o
    cadastro real. `VendasPagamentos.tsx:104,146-153` — "Link de Pagamento" e
    "Shopee" somem dentro de "Crédito"; quem tenta bater a maquininha por esse
    relatório não consegue.
19. **Formulário de título manual não vincula fornecedor nem cliente**, apesar
    de as colunas existirem.
20. **Baixa de título sempre paga o valor total** — `valor_pago` sugere
    pagamento parcial que a tela não expõe.

---

## O que só o Felipe pode decidir

Registrado em `PLANO-DE-REFINAMENTO.md`. Em resumo: o que conta como "dinheiro
na gaveta", o que fazer quando o caixa está fechado e alguém vende, como a
troca deve aparecer no faturamento, e quem opera o caixa na prática.

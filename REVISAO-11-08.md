# Revisão de 11/08/2026

**Como esta revisão foi feita:** 6 agentes leram o código e o banco de produção em
paralelo, cada um numa frente diferente; cada achado deles passou por um **segundo
agente independente**, que reabriu o mesmo arquivo (ou rodou a mesma consulta) por
conta própria antes de confirmar. Isso existe porque foi exatamente a falta dessa
segunda checagem que estragou uma tentativa de revisão anterior (achado reportado por
suposição, sem abrir o arquivo de verdade). Dos 32 achados que chegaram até aqui,
**nenhum foi descartado na verificação** — todos se sustentaram na segunda leitura.

## O que esta revisão cobriu

Desde a revisão de 09/08 ([`ESCOPO-REVISAO-09-08.md`](ESCOPO-REVISAO-09-08.md)),
entraram 9 commits novos no sisteminha, incluindo uma tela inteira que nunca tinha
existido (a ficha completa do produto, 628 linhas). Esta revisão focou no que ainda
não tinha sido lido por ninguém:

1. **Relatórios e indicadores novos de Vendas** — a tela de conferência de
   pagamentos (Vendas > Pagamentos) e o relatório de faturamento, mais o painel de
   filtros do histórico de vendas.
2. **Telas novas do Estoque** — a ficha completa do produto, o painel de estoque
   crítico, o painel de filtros de produto e os avisos "Aguardando revisão"/"Apto à
   Venda".
3. **Reconferência da segurança do banco, do zero** — não reaproveitei nenhum
   resultado antigo; rodei de novo, contra o banco de produção ligado, as consultas
   que provam se a trava de custo, as views entre lojas e a função de troca no PDV
   continuam corretas.
4. **Vigência dos itens 🔴 Alta já conhecidos** — muita coisa mudou no código desde
   que foram escritos; conferi um por um se ainda são verdade exatamente como
   descritos.
5. **Catálogos órfãos e duplicação de código** — campos cadastrados em Listas do
   Sistema que ainda não têm tela usando, e trechos de tela copiados em vez de
   compartilhados.

## Atualizações de status (o que já está corrigido — não é pendência nova)

**✅ Condição e Memória deixaram de ser catálogos órfãos.** A ficha completa do
produto e o painel de filtros novos já leem esses dois catálogos de verdade —
cadastrar uma condição ou capacidade de memória nova em Listas do Sistema já aparece
sozinho nas duas telas, sem mexer em código.

**✅ Reconfirmado — as colunas de custo continuam travadas no banco.** Rodei eu
mesmo, agora, a consulta que prova isso, direto no banco de produção: nenhuma coluna
de custo (`produtos.custo`, `margem_percent`, `servicos.custo_estimado`,
`service_order_items.custo_unitario`, `movimentos_estoque.custo_unitario`/
`valor_total`) tem permissão de leitura para usuário comum ou visitante. Ninguém
destravou por engano desde a última checagem de 09/08.

**✅ Reconfirmado — as 5 views de leitura continuam sem misturar loja com loja.** As
5 views que precisam rodar com privilégio elevado para esconder custo
(`vw_produtos`, `vw_servicos`, `vw_movimentos_estoque`, `vw_os_itens`,
`vw_os_aguardando_retirada` — essa última é nova, da tela de "OS pronta que o
cliente não busca") foram conferidas direto na definição instalada no banco, não só
no arquivo de migration: todas as 5 filtram pela loja de quem está logado.

**✅ Reconfirmado — a troca de produto no PDV tem as travas certas.** A função que
grava a entrada de um produto usado recebido em troca exige login, exige a
permissão de vender e confere que a venda pertence à loja de quem chamou. Não dá
pra usar essa porta pra criar produto ou pagamento falso.

## Achados novos, por área

### Vendas / PDV

🟠 **O botão "Cancelar" do fechamento de venda não limpa pagamento nem produto de
troca já lançados** — `src/pages/PDV.tsx:838,1102-1105`. Se o vendedor lança um
pagamento (ou cadastra um produto recebido em troca) e cancela o fechamento pra
corrigir algo no carrinho, esses dados continuam guardados na tela. Ao reabrir
"Finalizar Venda" — inclusive pra outro cliente — o pagamento e o produto de troca
da tentativa anterior ainda estão lá. Se ninguém perceber, uma venda pode fechar com
forma de pagamento ou produto de troca que não são daquele cliente.

### Estoque

✅ **CORRIGIDO EM 11/08 — a ficha do produto zerava o custo real ao salvar
qualquer edição** — `src/pages/EstoqueDetalhe.tsx`. Quem editava um produto sem
permissão de ver o preço de custo recebia o campo vazio (assim de propósito), o
formulário transformava esse vazio em "0", e salvar qualquer coisa — mesmo só
marcar "Apto à Venda" — gravava esse "0" de volta no banco. Corrigido: `custo` só
entra no `UPDATE` quando o usuário tem `inventory.cost.view`.

✅ **CORRIGIDO EM 11/08 — a tela de Estoque quebrava (ficava em branco) para
Vendedor e Técnico** — `src/pages/Estoque.tsx`. A trava de custo já fechava o
vazamento (a view devolve o valor vazio pra quem não tem permissão, como
deveria) — o que sobrava era a tela não saber lidar com esse vazio e travar
tentando calcular a porcentagem em cima dele. Corrigido escondendo as colunas
Custo e Margem por completo pra quem não tem a permissão, mesmo padrão já usado
no Relatório de Estoque.

🟠 **"Repor estoque" no Estoque Crítico só é bloqueado pela tela, não pelo banco** —
`src/pages/EstoqueCritico.tsx:114-118`, função `ajustar_estoque_produto`. Este é o
mesmo achado que já está no plano como 🔴 Alta desde a revisão original — reconferido
agora e continua exatamente igual: qualquer usuário logado consegue chamar essa
função direto e mudar a quantidade em estoque, mesmo sem a permissão de ajustar
estoque.

🟠 **O rótulo de custo no Estoque Crítico decide pelo valor calculado, não pela
permissão** — `src/pages/EstoqueCritico.tsx:97` (compara `custoReposicao > 0`)
contra `src/pages/relatorios/RelatorioEstoque.tsx:25` (compara a permissão
diretamente, do jeito certo). Quem tem permissão de ver custo mas ainda não
cadastrou o preço de compra de um produto em alerta vê o rótulo errado ("Valor em
venda" em vez de "Custo para repor tudo") — não vaza informação sigilosa, é a
etiqueta errada pra pessoa certa.

🔵 **Localização do produto continua sem vir de Listas do Sistema** —
`src/components/produtos/FiltrosProdutos.tsx`, `EstoqueDetalhe.tsx`. Seguem usando a
lista fixa (Vitrine/Depósito/Bancada/Sucata) em vez do catálogo "localizacao" já
cadastrado. A correção completa precisa trocar o tipo da coluna no banco (hoje é um
enum fixo do Postgres), não só mexer na tela.

🔵 **"Aguardando revisão" pode voltar a confundir produto excluído de propósito com
produto de troca sem preço** — `src/pages/Estoque.tsx:258` vs
`src/pages/EstoqueDetalhe.tsx:266-274`. O aviso usa "inativo + preço zero" pra
separar os dois casos, mas a lixeira da ficha completa do produto (nova) não
confere o preço antes de excluir.

### Ordens de Serviço / Assistência Técnica

*(sem achado novo desta vez — os dois itens relacionados a OS estão listados abaixo,
em Cadastros de Apoio e nas confirmações de vigência)*

🟠 **Aprovar/recusar orçamento de OS continua usando a permissão errada** —
`src/pages/OSOrcamentos.tsx:53,179-191`. Reconferido: continua exatamente como já
estava descrito no plano (que já classifica este item como 🔴 Alta, com segunda
verificação feita antes) — Técnico tem a permissão de editar OS mas não a de
aprovar orçamento, e a tela confere a errada.

### Financeiro / Relatórios

🔴 **"Total recebido" em Vendas > Pagamentos soma dinheiro que ainda não entrou** —
`src/pages/VendasPagamentos.tsx:170-176,204-232`. O número que aparece em verde nos
indicadores "Total recebido", "Ticket médio" e "Média por dia" inclui boleto,
crediário e vale-troca — formas que o próprio código já reconhece, em comentário,
como "não caem na gaveta hoje". Quem fecha o caixa olhando esse número acha que é
dinheiro disponível, mas está inflado com venda que ainda não virou dinheiro.

🔴 **O relatório de faturamento conta a venda por troca duas vezes** —
`src/pages/relatorios/RelatorioVendas.tsx:85,101`, mesma causa já registrada no
plano para outras telas (`src/pages/TrocaDevolucao.tsx:288-303`: a venda nova da
troca é lançada pelo preço cheio e a venda original nunca é corrigida). Este
relatório precisa entrar na lista de telas afetadas por esse problema já conhecido.

*(O buraco maior do Financeiro — o Caixa não se alimentar sozinho de venda do PDV,
OS paga ou baixa de título — continua exatamente como descrito no plano. A tela
nova de Vendas > Pagamentos ajuda a conferir quanto entrou por forma de pagamento,
mas é um relatório à parte: não lança nada em `caixa_movimentos`.)*

### Cadastros de Apoio

🔴 **Cliente bloqueado consegue abrir Ordem de Serviço** —
`src/pages/NovaOS.tsx:177-184`. Este item já estava no plano como 🟠 Média; **subo
para 🔴** nesta revisão porque desde 09/08 o vendedor passou a operar a OS inteira,
inclusive a entrega — e entregar uma OS gera automaticamente um título já pago. Ou
seja, um cliente bloqueado por golpe ou cheque sem fundo hoje consegue não só deixar
o aparelho na bancada, como percorrer o fluxo inteiro até um título "pago" ser
gerado em nome dele, sem passar pela trava que existe pra venda.

### Segurança e RLS transversal

🔴 **Administrador consegue trocar o próprio perfil ou desativar a própria conta na
hora, sem confirmação** — `src/hooks/useUsuarios.ts:71-98`,
`src/pages/cadastros/Usuarios.tsx:49,233-250`. Reconferido: continua exatamente como
já estava descrito no plano (🔴 Alta). O caminho exato: o Select de Perfil e o
Switch de Ativo disparam a troca assim que o valor muda, sem diálogo de
confirmação, e a lista de usuários não esconde nem avisa quando a linha é o próprio
usuário logado. Se for o único administrador, a única saída depois vira mexer
direto no banco pelo painel do Supabase.

🔴 **Não fica registrado quem liberou ou tirou uma permissão extra de um
funcionário, nem por quê** — `src/hooks/useUsuarios.ts:139-166`. Reconferido:
continua exatamente como já estava descrito no plano (🔴 Alta). Os campos "motivo" e
"definida_por" existem na tabela desde a criação, mas a gravação nunca preenche
nenhum dos dois.

### Arquitetura transversal

🟠 **A "ponte temporária" sem checagem de tipo (`untyped.ts`) cresceu em vez de
diminuir** — de 6 para 9 arquivos usando desde a última contagem, mesmo as 8 tabelas
que ela cobre já sendo reconhecidas pelo gerador de tipos oficial. Em
`useAuth.tsx` o import nem é mais usado (import morto).

🟠 **PDV e ficha do produto não avisam quando uma busca ao banco falha** —
`src/pages/PDV.tsx` (8 consultas diretas) e `src/pages/EstoqueDetalhe.tsx` (mais 4).
Nenhuma captura o erro da consulta — se o banco engasgar por um instante, a lista
fica vazia em silêncio, sem diferenciar "não tem cadastro" de "não consegui
buscar".

### Backlog de simplificação

🔵 **Os três painéis de filtro (Venda, OS, Produto) repetem a mesma estrutura em vez
de compartilhar componente** — mesma moldura, mesma função de limpar filtro, mesmo
cabeçalho, e o bloco "campo + lista suspensa" copiado 9 vezes ao todo entre os três
arquivos.

🔵 **O cálculo de "quantos dias tem o período" está copiado em dois relatórios de
vendas** — `src/pages/VendasPagamentos.tsx:184-189`,
`src/pages/relatorios/RelatorioVendas.tsx:93-97`. Baixo risco, mas mostra que faltou
esse pedaço entrar no mesmo lugar onde o indicador e a formatação de dinheiro já
foram compartilhados corretamente.

*(O tamanho do pacote principal do sistema — 613 KB — e a duplicação da regra de
"estoque baixo" em 5 telas já estavam registrados no plano; ambos foram reconferidos
e continuam exatamente como estavam.)*

## Próxima ordem sugerida

1. ✅ **Feito em 11/08** — Estoque que travava ou apagava informação (tela em
   branco pra Vendedor/Técnico, e o custo que zerava ao salvar a ficha do produto).
2. **Números que a loja usaria pra decidir dinheiro** — "Total recebido" contaminado
   por boleto/troca, e o faturamento duplicado por troca. Os dois alimentam decisão
   financeira com número maior do que o real.
3. **Cliente bloqueado abrindo OS** — ficou mais grave desde que o vendedor passou a
   operar a OS inteira; faz sentido resolver junto da trava de venda que já existe.
4. **Travas de segurança que dependem só da tela, não do banco** — reposição de
   estoque sem checagem no banco, e a falta de proteção pro administrador não se
   autodesativar sem querer.
5. **Financeiro: o Caixa não se alimenta sozinho** — item grande, já sinalizado
   desde 09/08, que depende de decisão do Felipe sobre como cada forma de
   recebimento deveria cair no caixa.
6. **Catálogos órfãos e duplicação de código** — sem pressa, numa leva de faxina
   depois do que está acima.

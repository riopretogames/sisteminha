# Plano de construção — Sisteminha (RP System.IO)

**Data:** 04/08/2026
**Escopo:** só o projeto `sisteminha/` (React + Vite + Supabase). Nada de
outras pastas da empresa.
**Como usar este documento:** passo a passo, na ordem. Cada passo parte do
código real que já existe hoje — não é lista genérica.

---

## Onde estamos hoje (achados reais, lendo o código)

- App real, no ar: `sisteminha.lovable.app`, React + Vite + shadcn/ui +
  Supabase (Postgres com RLS).
- Banco já modelado: `tenants`, `produtos`, `movimentos_estoque`, `vendas`,
  `itens_venda`, `pagamentos_venda`, `service_orders`, `service_order_items`,
  `clientes`, RBAC completo (admin/atendente/técnico/vendedor).
- Telas que **já existem e são reais** (não são stub): Dashboard, PDV,
  Estoque (com CRUD completo de produto), Ordens de Serviço (Kanban), Nova
  OS, Clientes, Caixa, Contas a Pagar/Receber, Fluxo de Caixa, Relatórios de
  Vendas/OS/Financeiro/Estoque, Usuários, Config (Perfis/Preferências/Logs).
- O arquivo `src/routes/registry.tsx` já documenta, ele mesmo, a lista do
  que **ainda não foi construído** — não é chute meu, é comentário no
  próprio código-fonte.

---

## Passo 1 — Corrigir a baixa de estoque na venda (começando agora)

**O que existe hoje:** ao finalizar uma venda no PDV (`PDV.tsx`), depois de
gravar a venda e os itens, o código roda um laço no navegador chamando
`produtos.update({ estoque_atual: ... })` produto por produto.

**Dois problemas reais nisso:**
1. **Provavelmente não funciona pra vendedor comum.** A política de
   segurança do banco (RLS) da tabela `produtos` só permite `UPDATE` pra
   quem tem papel **admin** (`"Admins can manage products"`). Um usuário
   com papel "vendedor" fechando uma venda tem essa atualização
   silenciosamente ignorada pelo banco — a venda é registrada, mas o
   estoque nunca desconta de verdade, a não ser que quem estiver logado
   seja admin.
2. **Não fica nenhum rastro.** Mesmo quando funciona, nada é gravado em
   `movimentos_estoque` — não existe hoje nenhum registro de auditoria de
   "saiu 1 unidade do produto X por causa da venda Y".

**Por que não é só "religar o gatilho antigo":** a migration de 01/08 já
removeu um gatilho genérico (`track_stock_movement`) de propósito, porque
ele disparava em qualquer mudança de `estoque_atual` sem saber o motivo —
gravava tudo como "ajuste" genérico. A solução certa é um gatilho
**específico da venda** (dispara só quando um item de venda é criado), que
por saber exatamente o contexto, grava certo: tipo = saída, motivo = venda,
origem = número da venda.

**O que vou fazer:**
- Criar uma função de banco (roda com privilégio de sistema, não depende do
  papel de quem está logado) que dispara sozinha sempre que um item de
  venda é inserido: desconta a quantidade vendida do produto e grava a
  movimentação com o motivo certo, tudo na mesma transação da venda (ou tudo
  acontece, ou nada acontece — sem meio-termo).
- Remover o laço manual do `PDV.tsx`, que fica redundante.
- Bloquear venda com estoque insuficiente **no banco**, não só na tela (hoje
  a checagem de "estoque insuficiente" só existe no navegador — dois
  caixas vendendo a última unidade ao mesmo tempo poderiam deixar o estoque
  negativo).

## Passo 2 — Levar a mesma lógica pras outras entradas/saídas ✅ (05/08)

- **Ajuste manual de estoque:** feito. A tela de Estoque agora chama a
  função `ajustar_estoque_produto` quando a quantidade muda, que grava em
  `movimentos_estoque` com motivo "Ajuste manual", atômico.
- **Entrada inicial:** bônus incluído — cadastrar um produto novo já com
  estoque grava uma movimentação de "entrada" automaticamente (não existia
  rastro nenhum disso antes).
- **Peça usada em Ordem de Serviço:** o gatilho no banco já está pronto
  (`baixar_estoque_ao_usar_em_os`, dispara em `service_order_items`), mas
  **ainda não há nenhuma tela no app que crie esse tipo de registro** — não
  existe "adicionar peça" nem na Nova OS nem no Kanban. Confirmei buscando
  no código inteiro: a tabela só é referenciada nos tipos gerados do
  Supabase, em lugar nenhum da interface. Construir essa tela entra como
  parte do Passo 5 (telas que faltam).

## Passo 3 — Estoque crítico (o alerta que você pediu) ✅ (05/08)

- **Bug corrigido:** o card "Estoque Crítico" do Dashboard comparava a
  quantidade com o texto literal `"estoque_minimo"` em vez do valor de cada
  produto — sempre deu número errado. Agora traz as duas colunas e conta no
  cliente, mesmo padrão do resto do sistema.
- **Tela nova — Estoque Crítico** (`/estoque/critico`): lista só quem está
  no ou abaixo do próprio mínimo, do mais urgente pro menos urgente, com
  indicador de zerados e um botão "Repor" que já chama a função de ajuste
  do Passo 2 (com auditoria automática, motivo "Reposição de estoque").
  Card do Dashboard agora clica e leva direto pra essa tela.
- **Tela nova — Movimentações de Estoque** (`/estoque/movimentacoes`):
  histórico com filtro de período, exportação CSV, mostrando tudo que os
  gatilhos dos Passos 1 e 2 vêm gravando (venda, ajuste manual, cadastro
  inicial). Reaproveitei o `RelatorioShell` que os relatórios já usavam.
- O alerta de reposição já funciona: cada produto tem seu próprio
  `estoque_minimo` (não é um número fixo pra todo mundo — é melhor assim,
  cada item pode ter seu próprio limite).

## Passo 4 — Ligar Ordem de Serviço ↔ Financeiro ✅ (05/08)

- **Confirmado e corrigido:** fechar uma OS não gerava nada em Financeiro.
  Achado extra no caminho: o valor a cobrar da OS (`total_orcamento`) também
  não tinha NENHUMA tela pra ser preenchido depois da abertura — e clicar
  num card de OS (Kanban ou tabela) já tentava navegar pra uma tela de
  detalhe que nunca existiu (caía em "página não encontrada").
- **Tela nova — Detalhe da OS** (`/os/:id`): mostra cliente, aparelho,
  defeito relatado e um campo editável de "Valor do orçamento". É o mínimo
  pra fechar o Passo 4; diagnóstico técnico, peças e demais campos do laudo
  completo ficam pro Passo 5.
- **Regra combinada com o Felipe:** ao mover a OS pra "Entregue" — só se o
  tipo for "Paga" e o orçamento for maior que zero — o sistema cria
  sozinho a conta a receber, já como paga (a loja cobra na retirada, não
  tem essa etapa "aguardando pagamento" separada). Garantia e Cortesia
  nunca geram cobrança. Gatilho é idempotente: se a OS sair de "Entregue"
  e voltar por engano, não duplica a cobrança.

## Passo 5 — Completar o que falta (lista real, tirada do próprio menu do sistema)

Lista original, 15+ telas. Priorizamos "operação do dia a dia" primeiro.

- ✅ **Cadastro de Produtos removido do menu** (05/08) — era redundante com
  a tela de Estoque, que já tem CRUD completo de produto.
- ✅ **Histórico de Vendas** (`/vendas/historico`) — lista as últimas 200
  vendas, com busca e um "ver detalhes" que mostra os produtos e
  pagamentos de cada venda. Diferente do Relatório de Vendas (que é
  fotografia com totais/CSV): aqui é pra achar uma venda específica.
- ✅ **OS Finalizadas** (`/os/finalizadas`) — o "arquivo morto" do Kanban
  (entregues e canceladas), com indicador de receita das entregues.
- ✅ **OS Orçamentos** (`/os/orcamentos`) — fila de quem está esperando o
  cliente aprovar o orçamento, mais antiga primeiro, com botão de
  aprovar/recusar direto na lista (sem precisar entrar no Kanban).
- **Bônus:** clicar num card de OS (Kanban ou tabela) já tentava navegar
  pra uma tela de detalhe que nunca existia — construída no Passo 4,
  ganhou uso extra aqui (as duas telas novas de OS linkam pra ela).
- **Bug corrigido no caminho:** a tela de Detalhe da OS (Passo 4) usava uma
  lista de status "fixa" (`OS_STATUS` em constants.ts) em vez da lista de
  status customizável por loja (`os_status_config`, editável em
  "Gerenciar Status") — se alguém personalizasse um status, o rótulo/cor
  apareceriam errados nessa tela. Criei um hook `useOsStatuses` reutilizável
  e corrigi. O Dashboard também usa a lista fixa nesse mesmo ponto — não
  mexi lá por ora (não foi eu que escrevi, e é só um card de "OS recentes",
  baixo risco), mas fica anotado como pendência menor.

- ✅ **Fornecedores** (`/cadastros/fornecedores`) — cadastro completo (dados
  fiscais, contato, endereço, prazo de entrega), exclusão lógica. Tabela e
  RLS já existiam prontas desde a migration de cadastros (01/08); só
  faltava a tela.
- ✅ **Transportadoras** (`/cadastros/transportadoras`) — cadastro simples
  com link de rastreio clicável. Mesma situação: tabela e RLS já prontas.
- ✅ **Formas de Pagamento** (`/cadastros/formas-pagamento`) — cadastro com
  parcelamento, taxa, juros (simples/composto) e a flag "entra no
  fechamento de caixa". **Bug pego na revisão antes de ir pro ar:** taxa e
  juros são `DECIMAL(5,2)` no banco (máx. 999,99%) e o formulário não
  travava esse limite — digitar um valor maior estouraria o cadastro com o
  mesmo tipo de erro cru corrigido hoje mais cedo em
  `produtos.margem_percent`. Corrigido com um limite no próprio formulário
  antes de qualquer usuário esbarrar nisso. **Limitação assumida:** taxa
  por parcela individual (3x com uma taxa, 12x com outra) ainda não é
  editável — só existe a taxa "flat", igual pra qualquer parcelamento.
- ✅ **Importação de Clientes** (`/cadastros/clientes/importar`) — sobe uma
  planilha CSV (nome, telefone, email, CPF/CNPJ — só nome é obrigatório),
  mostra pré-visualização antes de gravar e importa em lotes. Tem botão de
  baixar um modelo pronto. **Limitação assumida:** não verifica duplicado
  — subir a mesma planilha duas vezes duplica cliente.
- ✅ **Vendas > Pagamentos** (`/vendas/pagamentos`) — conferência de caixa
  por pagamento (não por venda: uma venda paga metade em dinheiro e metade
  no cartão vira duas linhas), com resumo por forma de pagamento pra bater
  com a maquininha e o PIX.
- ✅ **Minha Empresa** (`/empresa`) — editar nome, CNPJ, inscrição
  estadual, contato, endereço, cores e logo da loja. Quem só pode ver
  (`company.view`) enxerga os mesmos dados em modo leitura; quem pode
  editar (`company.edit`) vê os campos e o botão Salvar.
- ✅ **Serviços** (`/cadastros/servicos`) — catálogo de mão de obra da
  assistência técnica: preço de referência, custo estimado (só quem tem
  permissão de ver custo), tempo estimado, garantia (padrão da casa: 3
  meses) e um aviso obrigatório pra reparo de risco (reballing, reflow,
  banho químico, oxidação). O campo Grupo usa o mesmo catálogo de
  "Listas do Sistema" (Console/Jogo/Celular/etc.) em vez de reinventar uma
  lista fixa. **Bug pego na revisão antes de ir pro ar:** a rota já estava
  cadastrada no menu, mas o mapa central de páginas (`registry.tsx`) não
  tinha a entrada — a tela ficaria travada em "Em construção" mesmo
  pronta. Corrigido junto. **Correção proativa:** nome de serviço
  duplicado agora dá uma mensagem amigável em vez do erro cru do banco.

**Cadastros de apoio — Passo 5 concluído.** Tudo que faltava (Fornecedores,
Transportadoras, Formas de Pagamento, Importação de Clientes, Serviços)
está construído. Só ficam de fora Dashboards e Inteligência Empresarial —
ver Passo 6.

## Passo 6 — Dashboard de lucro mensal e por produto ✅ (05/08, parte 1)

- **Nova tela — IE Comercial** (`/dashboards/ie/comercial`): cruza as vendas
  do período com o custo de cada produto e responde exatamente o pedido
  original — "quanto é o lucro, quanto vem do produto tal". Mostra por
  produto: quantidade vendida, receita, lucro e margem %, com totais do
  período e exportação CSV. Quem não tem permissão de ver custo
  (`inventory.cost.view`) só enxerga receita e quantidade — não o lucro.
- **Limitação assumida, documentada no código:** o lucro usa o custo ATUAL
  do produto, não o custo de quando a venda aconteceu (a tabela
  `itens_venda` não guarda isso). Se o preço de custo mudar com o tempo,
  vendas antigas recalculam com o custo de hoje. Se isso incomodar, a
  solução é gravar `custo_unitario` em `itens_venda` no momento da venda —
  fica como possível ajuste futuro.
- ✅ **Dashboard de Vendas** (`/dashboards/venda`) — "olha só como tá indo
  agora": vendas de hoje (com trend vs. ontem), vendas da semana, ticket
  médio, melhor dia da semana e top 5 produtos mais vendidos na semana.
  Sem filtro de período/CSV de propósito — isso já existe no Relatório de
  Vendas; aqui é sempre "agora".
- ✅ **Dashboard de Estoque** (`/dashboards/estoque`) — produtos ativos,
  valor total em estoque (só quem vê custo), estoque crítico e
  movimentações de hoje, cada um linkando pra tela cheia correspondente
  em vez de duplicar lista. Top 5 por valor parado (ou por menor estoque,
  pra quem não vê custo).
- ✅ **IE - Estoque** (`/dashboards/ie/estoque`) — giro de produto: cruza
  vendas do período com o estoque atual pra achar o que vende rápido e o
  que fica parado (dinheiro empatado). Cruza TODOS os produtos ativos,
  não só quem vendeu no período — senão um produto parado (zero venda)
  nunca apareceria.
- ✅ **Dashboard de Metas** (`/dashboards/metas`) — progresso do
  faturamento do mês contra as 4 faixas de premiação (Bronze/Prata/Ouro/
  Diamante) que a loja já usa de verdade (não inventei um sistema novo).
  Valores reais do ano inteiro de 2026 vieram da pasta `premiacoes/` da
  empresa (migration `20260806100000_metas_faturamento.sql`) — combinado
  com o Felipe usar os números que já existiam. **Fronteira importante,
  garantida com revisão dedicada:** a tela só mostra progresso de
  faturamento — nunca calcula comissão, prêmio ou pontuação de Trello,
  isso continua sendo do processo de premiação (fora do Sisteminha). A
  quebra "por vendedor" é uma estimativa client-side, claramente rotulada
  como tal.
- ✅ **Itens da OS** (dentro de `/os/:id`, seção "Peças e serviços") — o
  gatilho de baixa de estoque por peça usada em OS já existia no banco
  desde o Passo 2, mas nenhuma tela criava esse tipo de registro. Agora
  dá pra lançar "Peça do estoque" (desconta automático, com rastro em
  Movimentações) ou "Serviço avulso" (só lançamento, sem mexer em
  estoque, com atalho pra puxar preço/custo do catálogo de Serviços).
  Item de peça não pode ser excluído pela tela (reverteria a baixa sem
  rastro) — só serviço avulso. Botão "Usar soma dos itens" preenche o
  campo de orçamento já existente (não substitui o fluxo do Passo 4).
  **Corrigido na revisão:** faltava checar se a quantidade lançada cabia
  no estoque disponível antes de mandar pro banco.
- **Ainda falta:** IE - Serviço (lucro de OS/assistência) — agora que os
  itens da OS existem, dá pra construir de verdade cruzando
  `service_order_items` (preço cobrado × custo unitário) por período/
  técnico, em vez da versão "só receita" que tinha sido cogitada antes.

## Bug corrigido ao vivo — overflow na margem do produto (05/08)

- **Achado testando o app no ar:** cadastrar um produto com custo muito
  baixo perto do preço (ex.: custo R$0,01, preço R$50) fazia o cálculo
  automático de margem passar de 999,99% — o limite que a coluna
  `margem_percent` aguentava (`DECIMAL(5,2)`) — e o cadastro inteiro falhava
  com um erro técnico ("numeric field overflow"), sem nenhuma mensagem
  amigável pro usuário.
- **Correção:** a margem agora é limitada (entre -9999,99% e 9999,99%) em
  vez de deixar o banco travar o cadastro. Qualquer custo/preço digitado
  salva sem erro; casos extremos só mostram a margem "no teto", que já é
  aviso suficiente de que o custo ou o preço foi digitado errado.
- **Testado ao vivo** reproduzindo exatamente o cenário que tinha dado
  erro (custo R$0,01, preço R$50): cadastro funcionou, margem apareceu
  travada em 10000,0% (arredondamento de 9999,99%). Produto de teste
  removido depois do teste.

## Passo 7 — Revisão de permissões

- Cada tela nova entra já checando permissão (o sistema já tem esse
  mecanismo pronto, `RequirePermission` + `config/permissions.ts` — é só
  seguir o padrão que já existe).

## Passo 8 — Conectar ao site (último passo)

- Trocar o `href="#"` do botão "Login" nas 7 páginas do site
  (`marketing/site/*.html`) pelo link real do Sisteminha, já que a
  hospedagem você falou que já está resolvida.

---

**Começando pelo Passo 1 agora.**

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

**Ainda faltam, em ordem de prioridade decrescente (não construídas ainda):**
- **Cadastros de apoio:** Fornecedores, Transportadoras, Serviços, Formas
  de Pagamento, Importação de Clientes em massa.
- **Vendas > Pagamentos:** tela dedicada de conciliação de pagamentos
  (a informação já existe em `pagamentos_venda`, só falta a tela).
- **Minha Empresa:** editar dados da loja (nome, CNPJ, logo, cores).
- **Dashboards e Inteligência Empresarial:** ver Passo 6 — são
  essencialmente a mesma coisa (dashboard de lucro/vendas/estoque), faz
  mais sentido tratar junto.

## Passo 6 — Dashboard de lucro mensal e por produto

- Com o Passo 1 corrigindo a baixa de estoque e o `custo`/`preco` que já
  existem em `produtos`, dá pra calcular lucro real por produto (hoje o
  sistema já tem o campo `margem_percent` calculado automaticamente, só
  falta a tela que soma isso por mês/produto).
- Isso alimenta os Dashboards e IE do Passo 5.

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

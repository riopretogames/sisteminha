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

## Passo 2 — Levar a mesma lógica pras outras entradas/saídas

- **Ajuste manual de estoque** (quando alguém edita a quantidade direto na
  tela de Estoque): hoje isso muda `estoque_atual` sem passar por
  `movimentos_estoque`. Precisa gravar também, com motivo = "ajuste manual".
- **Peça usada em Ordem de Serviço:** confirmei que hoje **não existe
  nenhuma ligação** entre `service_order_items` (peças usadas num reparo) e
  o estoque — usar uma peça no laudo não desconta nada. Mesmo princípio do
  Passo 1, mas motivo = "OS" + número da ordem.

## Passo 3 — Estoque crítico (o alerta que você pediu)

- **Achado concreto:** o card "Estoque Crítico" que já aparece no Dashboard
  hoje **tem um bug** — a consulta compara a quantidade atual com o texto
  literal `"estoque_minimo"` em vez do valor de cada produto
  (`src/pages/Dashboard.tsx:105`). Ou seja, esse número no Dashboard hoje
  está sempre errado. É rápido de corrigir.
- Depois de corrigir, construir as duas telas que o próprio menu do sistema
  já prevê mas ainda não existem: **Estoque Crítico** (lista de produtos no
  ou abaixo do mínimo) e **Movimentações de Estoque** (histórico do que o
  Passo 1/2 vai começar a gerar).
- Aí sim dá pra ligar o "me avisa quando chegar a X" — hoje cada produto já
  tem um campo `estoque_minimo` configurável por item (não é fixo em 100
  pra todo mundo, é por produto — o que é melhor: cada produto pode ter seu
  próprio limite de reposição).

## Passo 4 — Ligar Ordem de Serviço ↔ Financeiro

- Confirmar (com você, olhando a tela) se fechar uma OS hoje gera algo em
  Contas a Receber, ou se fica solto. Pelo que vi no banco, não há ligação
  automática ainda.

## Passo 5 — Completar o que falta (lista real, tirada do próprio menu do sistema)

O arquivo de menu já lista essas telas, mas nenhuma delas está construída
ainda (cai na tela "Em construção" honesta, não em erro):

- **Dashboards:** Venda, Estoque, Metas
- **Inteligência Empresarial:** Estoque, Comercial, Serviço
- **Vendas:** Histórico, Pagamentos
- **OS:** Finalizadas, Orçamentos
- **Cadastros:** Importação de Clientes, Fornecedores, Transportadoras,
  Serviços, Formas de Pagamento
- **Minha Empresa**
- ⚠️ **Cadastro de Produtos** já está listado no menu como "não construído",
  mas a tela de **Estoque já tem CRUD completo de produto** — bem provável
  que esse item do menu seja redundante e possa ser removido em vez de
  construído de novo. Confirmo com você quando chegar nesse passo.

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

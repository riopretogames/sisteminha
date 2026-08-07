# Plano de Refinamento — Sisteminha (RP System.IO)

**Data:** 07/08/2026
**Como este documento se encaixa:**
- [`PLANO-DE-CONSTRUCAO.md`](PLANO-DE-CONSTRUCAO.md) é o histórico — Passos 1
  a 6, tudo que foi construído do zero até aqui. Continua valendo como
  registro, não foi apagado nem reescrito.
- [`REVISAO-TECNICA.md`](REVISAO-TECNICA.md) é a auditoria bruta — ~90
  achados, lidos por agentes especializados em 3 camadas-base (Banco de
  Dados, Acesso a Dados, Permissões/Rotas) e 8 áreas funcionais, com
  citação exata de arquivo/linha. Cada achado lá diz se foi "✅ confirmado
  (2ª leitura adversarial)" ou "— não verificado" — vale a pena abrir esse
  documento quando um item deste plano precisar de mais detalhe técnico.
- **Este documento é o plano de ataque** — a mesma auditoria, reorganizada
  página por página, com prioridade, pronta pra virar trabalho.

Agora que o Passo 6 fechou o "construir do zero", a fase muda de figura:
não é mais adicionar tela nova, é **lapidar o que já existe** — achar o que
está pela metade, inconsistente ou arriscado, e corrigir/completar uma área
de cada vez.

---

## Já corrigido antes de começar o plano (06-07/08)

A revisão técnica destacou 2 achados como graves o bastante pra testar antes
de decidir prioridade. Testei os dois direto no código e no banco — **os
dois eram reais**, e já corrigi:

### 1. Consulta de perfil sem filtrar pelo usuário logado (5 arquivos) ✅

A revisão encontrou isso só no PDV. Procurando o mesmo padrão no projeto
inteiro, achei em mais 4 lugares: **PDV.tsx, NovaOS.tsx, Clientes.tsx,
Estoque.tsx e StatusManagerDialog.tsx** faziam
`supabase.from('profiles').select(...).single()` sem filtrar por usuário —
trazia *qualquer* perfil do tenant, e `.single()` falha se vier mais de uma
linha. Assim que a loja tivesse **2 ou mais contas de usuário** (vendedor,
técnico, gerente — o uso real do dia a dia), isso quebrava com "Tenant não
encontrado" (mensagem enganosa) em: fechar venda no PDV, abrir OS nova,
cadastrar cliente, cadastrar produto e editar status customizado.

**Corrigido**: os 5 arquivos agora usam `useAuth()` (o perfil do próprio
usuário logado, já carregado no login) em vez de refazer a consulta —
mesmo padrão que Fornecedores/Transportadoras/Serviços/MinhaEmpresa já
usavam. Testado com `tsc`/`eslint`/build limpos. Commit `a6704a6`.

### 2. Histórico de status de OS podia quebrar com status customizado ✅

`service_orders.status` virou TEXT há tempos (pra suportar status
customizável por loja), mas `service_order_history.status_anterior`/
`status_novo` continuavam como o ENUM antigo. **Correção de gravidade em
relação ao que a revisão apontou**: não é "toda troca de status falha" —
funciona normalmente com os 8 status originais (recebido, diagnóstico,
aguardando peça, aguardando aprovação, em reparo, pronto, entregue,
cancelado). Quebra especificamente quando alguém cria um status
**customizado** em "Gerenciar Status" (a tela permite isso livremente) e
move uma OS pra ele ou dele — nesse momento o gatilho de histórico tenta
gravar um texto que não existe no ENUM antigo, e a troca inteira falha com
erro cru de Postgres.

**Corrigido**: as duas colunas agora são TEXT, igual `service_orders.status`.
Migration `20260807020000`, aplicada em produção. Commit `a6704a6`.

---

## Decisão que só você pode tomar

> ### ✅ DECIDIDO EM 07/08 — Opção B (fechar de verdade)
>
> **Escolha do Felipe.** Motivo, nas palavras dele: a loja já roda hoje num
> sistema antigo e defasado; o Sisteminha está sendo construído com calma
> pra substituir aquele. Não é um remendo com prazo apertado — dá pra
> fazer certo desde o começo, em vez de deixar dívida pra depois.
>
> **O que isso passa a valer como regra do projeto:** permissão que existe
> no catálogo tem que valer no banco também, não só na tela. Onde a trava
> real não for possível, isso vira item registrado — não silêncio.
>
> Implicação prática: as 4 áreas travadas por essa pergunta (Estoque,
> Cadastros, OS, Relatórios) estão liberadas, e cada uma delas passa a ler
> custo pela via restrita. Ver **Plano da Opção B** logo abaixo.

**Achado mais corroborado desta revisão** (6 agentes diferentes, sem saber
um do outro, chegaram à mesma conclusão): `inventory.cost.view` existe como
permissão no catálogo e é atribuída a papéis, mas **nenhuma política de
segurança do banco a usa** — RLS é por linha, não por coluna, então
`produtos.custo`, `produtos.margem_percent`, `servicos.custo_estimado` e
`service_order_items.custo_unitario` ficam visíveis pra **qualquer
autenticado do tenant** que consulte a API direto (ex.: pelo console do
navegador), não só quem tem a permissão. A interface esconde certinho —
o vazamento é só via API direta, contornando a tela.

Isso é arquitetura deliberada e consistente em todo o sistema (é assim
também em `produtos`/`servicos` desde muito antes desta sessão) — não é um
bug isolado que "escapou". A pergunta é de produto/segurança, não de código:

- **Opção A — aceitar o risco por agora.** Hoje é 1 tenant só, família de
  confiança. Baixo risco real. Documentar e seguir.
- **Opção B — fechar de verdade.** Dá pra fazer sem quebrar nada que já
  existe: criar uma *view* de `produtos`/`servicos`/etc. sem a coluna de
  custo, e trocar as consultas que **não** deveriam ver custo pra ler da
  view em vez da tabela. Custo real vira uma segunda consulta, só pra quem
  tem a permissão.

### Plano da Opção B

O projeto já tem a peça central pronta: a função
`public.has_permission(_user_id, _permission)` (migration
`20260802000001`, SECURITY DEFINER e STABLE), que é o que as políticas de
RLS já usam hoje. Dá pra apoiar a solução nela em vez de inventar
mecanismo novo.

**Abordagem escolhida — uma view por tabela, com o custo condicional.**
Em vez de duas vias ("com custo" e "sem custo") e duas consultas
espalhadas pelo código, cada tabela ganha uma view em que a coluna de
custo é `CASE WHEN has_permission(auth.uid(), 'inventory.cost.view')
THEN custo END`. Quem tem a permissão recebe o valor; quem não tem
recebe nulo, direto do banco. A view usa `security_invoker` pra que a
RLS de tenant continue valendo igual.

Vantagem sobre a ideia original de "view sem a coluna": o front-end não
precisa escolher entre duas consultas conforme a permissão — só troca a
origem da leitura de tabela pra view, e o banco decide o resto. Menos
lugar pra errar.

**Correção descoberta ao escrever a migration — a view sozinha não fecha
nada.** A ideia original ("criar view sem a coluna de custo e apontar as
consultas pra ela") deixa a tabela original acessível do mesmo jeito: quem
consulta a API direto continua pedindo `produtos` em vez de `vw_produtos` e
recebe o custo igual. **A tranca de verdade é tirar o SELECT da coluna do
papel `authenticated`** (`REVOKE SELECT ON produtos` + `GRANT SELECT` só nas
colunas liberadas). Só que, no instante em que isso entra, qualquer
`SELECT *` nessas tabelas passa a dar erro de permissão — então essa parte
só pode ser aplicada **depois** que todas as telas estiverem lendo pelas
views. Por isso a fundação virou 2 partes.

Consequência técnica: as views **não** usam `security_invoker`. Se usassem,
leriam a tabela com os privilégios de quem chamou e perderiam o acesso ao
custo junto com todo mundo na Parte 2. Rodando com o privilégio do dono,
elas precisam repetir o filtro de tenant no `WHERE` — o isolamento entre
lojas passa a ser responsabilidade da view, não da RLS. Está explícito e
comentado nas 3.

- [x] **Parte 1 da fundação — as views.** Migration
  `20260808110000_custo_protegido_views.sql`: `vw_produtos`, `vw_servicos`
  e `vw_os_itens`, com custo condicional via `has_permission`,
  `security_barrier` e filtro de tenant explícito. **Não quebra nada** —
  as tabelas continuam acessíveis. Escrita, ainda não aplicada.
- [x] **Trava de desconto.** Migration
  `20260808120000_trava_desconto_venda.sql`: gatilho
  `validar_desconto_venda` em `vendas`, que recusa gravar
  `descontos != 0` sem `sales.discount`. Só dispara quando o valor do
  desconto muda; zerar desconto é sempre permitido. Escrita, ainda não
  aplicada.
- [ ] **Ligar as telas de leitura nas views** — por área, junto da
  lapidação de cada uma: Estoque, Cadastros, OS, Relatórios,
  Dashboards/IE. Escrita/edição continua indo direto na tabela.
  Levantamento inicial: só 2 telas usam `select('*')` nessas tabelas
  (`Estoque.tsx:103` e `CadastroServicos.tsx:136`) — o resto já lista
  coluna por coluna, o que reduz bem o trabalho.
- [ ] **Regerar `types.ts`** depois de aplicar a Parte 1, pra que as views
  fiquem tipadas e não precisem passar pelo cliente `db` não tipado (que
  o backlog quer apagar).
- [ ] **Parte 2 da fundação — a tranca.** Migration com o
  `REVOKE`/`GRANT` por coluna. **Só depois** dos dois itens acima.
- [ ] **Conferir com uma conta de teste** sem `inventory.cost.view`,
  consultando a API direto (não pela tela) — é o único jeito de provar
  que fechou de verdade.

**O que muda pro usuário na tela: nada.** Quem já via custo continua
vendo; quem não via continua não vendo. A diferença é que agora a trava
é real, não cosmética.

---

## Como vamos trabalhar: lapidar página por página

Cada área abaixo tem prioridade:

- 🔴 **Alta** — quebra fluxo real ou vaza dado sensível.
- 🟠 **Média** — inconsistência ou funcionalidade prometida que não
  funciona de verdade (cadastro "pronto" que nada consome, por exemplo).
- 🔵 **Simplificação** — não quebra nada, mas limpa duplicação enquanto a
  mão já está na área.

Item marcado **✅ confirmado** passou por uma segunda leitura adversarial
(alguém tentou ativamente refutar e não conseguiu). Sem a marca, é leitura
única — provavelmente certo (tem citação de arquivo/linha), mas vale abrir
o arquivo antes de assumir.

---

## Vendas / PDV

**🔴 Alta**
- [x] ✅ **07/08** Cancelamento automático de venda não revertia a baixa de
  estoque. Corrigido com gatilho `estornar_estoque_venda_cancelada`
  (migration `20260807040000`) — dispara em qualquer transição pra
  `cancelado`, devolve estoque de cada item e grava auditoria em
  `movimentos_estoque` (motivo "Estorno de venda cancelada"). Commit
  `26fc3c0`.
- [x] **Reclassificado** — "SELECT em vendas não valida `sales.view`" não é
  um bug isolado: é a mesma arquitetura de todo o projeto (RLS trava por
  tenant, permissão trava só a tela — igual `produtos`/`servicos`/etc.).
  Faz parte da [decisão pendente](#decisão-que-só-você-pode-tomar), não
  precisa de tratamento separado.

**🔵 Simplificação — feito em 07/08**
- [x] `formatCurrency` local duplicava `lib/format.ts::moeda()` — trocado.
- [x] `NAV_ITEMS`/`SHORTCUTS` (código morto) removidos de `constants.ts`.
- [ ] `PDV.tsx` sem react-query/hook — **adiado de propósito**: é a tela
  mais crítica do sistema (fecha venda de verdade), migrar o
  gerenciamento de estado inteiro merece uma sessão própria, com atenção
  total, não uma passada rápida de limpeza.

**🟠 Média — feito em 07/08 (escolhido pelo Felipe)**
- [x] ✅ **07/08** Formas de Pagamento (cadastro do Passo 5) agora é
  consultado de verdade pelo PDV — Select busca de `formas_pagamento`
  (com parcelamento/taxa reais), não mais da lista fixa. Migration
  `20260807060000` liga `pagamentos_venda.forma_pagamento_id` ao
  cadastro, mantendo `forma` (enum) preenchido automaticamente pra não
  quebrar relatório nenhum. Commit `23292e8`.
- [x] ✅ **07/08** `sales.discount` ganhou UI de verdade — campo de
  desconto em R$ no carrinho, gated pela permissão, grava
  `vendas.descontos`/`subtotal`/`total` corretamente. Commit `23292e8`.
- [x] **Nova decisão pendente, mesma família da anterior**: o desconto é
  travado só no client + RLS por operação (`sales.create`) — não tem
  trigger no banco impedindo `descontos != 0` vindo direto da API sem
  `sales.discount`. Mesma escolha arquitetural do resto do sistema (RLS
  por linha/operação, não por valor de coluna); fechar isso de verdade
  exigiria um trigger `BEFORE INSERT/UPDATE` em `vendas` validando a
  permissão contra o valor. Fica registrado junto da
  [decisão de custo/margem](#decisão-que-só-você-pode-tomar) pra decidir
  junto.

**⚪ Não se aplica — decisão de negócio (08/08)**
- [x] `clientes.liberado_venda`/`limite_credito` — **a loja não trabalha
  com crediário/fiado**, então o controle de limite de crédito não tem
  cenário real pra existir. Não é feature adiada, é feature que não
  cabe no jeito que a Rio Preto Games vende. Os campos ficam no schema
  (não fazem mal parados), mas não vale construir UI pra eles.

**🟠 Média — ainda pendente de decisão**
- [ ] Catálogo "Origens da Venda" (Listas do Sistema) existe, mas `vendas`
  não tem coluna pra guardar isso — órfão. (Não escolhido na rodada de
  07/08.)
- [ ] Orçamento de venda antes de fechar (feature nova, sem desenho ainda
  — venda fiada saiu de vez da lista, loja não trabalha com crediário).

**✅ Feature nova — Troca/Devolução de produto (08/08)**
- [x] Construída: `/vendas/troca-devolucao`. Devolução sempre em dinheiro
  de verdade (loja não trabalha com crédito de loja/crediário), cobre
  devolução pura e troca na mesma tela. Migration
  `20260808100000_troca_devolucao.sql` (tabelas `devolucoes`/
  `devolucao_itens`, gatilho de estorno de estoque, RLS gateada por
  `sales.cancel` — permissão que já existia cadastrada mas era
  decorativa, agora tem uso de verdade). Commit `ff10209`.
- [x] **Bug pego na revisão adversarial, corrigido antes de subir**: se a
  troca criasse a venda nova com sucesso mas o registro da devolução
  falhasse depois, a venda nova ficava órfã (paga, estoque baixado, sem
  devolução atrelada). Corrigido cancelando a venda nova nesse cenário.
- [ ] **2 pendências novas, documentadas no código e ligadas ao
  Financeiro:**
  1. Dinheiro devolvido ainda não entra na conferência de Caixa (mesma
     família do achado já existente de Caixa não refletir venda/OS).
  2. Faturamento reportado (`VendasHistorico`, `DashboardVenda`) conta o
     valor do produto trocado **duas vezes** (venda original + venda
     nova da troca) — a venda nova grava o preço cheio do produto (pra
     não perder a contagem de vendas por produto), mas só a diferença é
     cobrada de verdade. Resolver exige decidir como relatório de
     faturamento deve tratar troca — via nesta rodada, corrigir junto do
     Financeiro.
- [ ] Sem trava no banco (só client-side) contra devolver mais unidades
  do que foi vendido em devoluções parciais simultâneas — risco baixo
  com terminal único, lacuna real se um dia tiver mais de um PDV.

---

## Estoque

**🔴 Alta**
- [ ] `Estoque.tsx` mostra custo/margem pra qualquer usuário com
  `inventory.view`, ignorando `inventory.cost.view` — é a única tela
  irmã que vaza (EstoqueMovimentacoes/OSDetalhe já fazem certo). Parte
  da [decisão pendente](#decisão-que-só-você-pode-tomar) acima.
- [ ] Botão "Repor" em EstoqueCritico chama `ajustar_estoque_produto`
  (RPC) que não checa permissão nem tenant no banco — proteção é só
  cosmética na tela.

**🟠 Média**
- [ ] `Estoque.tsx` não esconde os botões de Novo/Editar/Excluir por
  permissão — usuário sem acesso recebe erro cru de RLS em vez de não
  ver o botão (inconsistente com Fornecedores/Transportadoras/Serviços).
- [ ] `estoque_atual <= estoque_minimo` reimplementado em 6+ lugares
  (Estoque, EstoqueCritico, Dashboard, DashboardEstoque,
  RelatorioEstoque ×2) — vira um helper `isEstoqueCritico(produto)`.
- [ ] `inventory.delete` é permissão morta — "Excluir" já é soft-delete
  via UPDATE, na prática usa `inventory.edit`.

**🔵 Simplificação**
- [ ] Preview de margem no dialog de cadastro não aplica o mesmo clamp
  ±9999,99% da coluna gerada no banco.
- [ ] `Estoque.tsx` sem hook compartilhado (`useProdutos()` não existe).

---

## Ordens de Serviço / Assistência Técnica

**🔴 Alta**
- [ ] Aprovar/recusar orçamento usa `orders.edit`, não a permissão
  dedicada `orders.approve` (cadastrada, atribuída a papéis, checada em
  **nenhum lugar**) — técnico aprova orçamento apesar do RBAC dizer que
  não deveria. ✅ *confirmado.*

**🟠 Média**
- [ ] Laudo técnico ainda não bate com o padrão da empresa (ver
  CLAUDE.md raiz, seção "Padrão de atendimento"): faltam campos de
  Diagnóstico, Prazo prometido, Garantia da OS e Técnico Responsável na
  tela — 7 colunas do banco sem UI nenhuma.
- [ ] "Técnico Responsável" no card do Kanban é campo morto: nunca é
  atribuído a nenhuma OS.
- [ ] "Status customizável por loja" depende de 6 chaves fixas
  espalhadas pelo código (NovaOS, OrdensServico, OSFinalizadas,
  OSOrcamentos, o gatilho de título) — excluir a chave errada em
  "Gerenciar Status" quebra um fluxo inteiro silenciosamente (ex.: fila
  de orçamentos suja pra sempre).
- [ ] Mudança de status no Kanban/tabela não checa permissão no front
  (RLS ainda bloqueia no banco, mas a UX é "arrasta, falha, erro cru").
- [ ] Regra "peça não pode ser excluída" (Passo 6) só existe na UI — a
  policy do banco permite DELETE de qualquer item via `orders.edit`,
  sem distinguir peça de serviço avulso.

**🔵 Simplificação**
- [ ] OS com status órfão pode sumir do Kanban sem aviso (continua na
  Tabela).
- [ ] É possível lançar peça (com baixa real de estoque) numa OS já
  cancelada — só "entregue" bloqueia hoje.
- [ ] `total_pecas`/`total_mao_obra` e `service_order_history` (timeline)
  nunca são lidos por nenhuma tela — dado gravado, nunca mostrado.
- [ ] 3 cópias do fallback de status e 2 de formatação de moeda/data
  entre telas antigas (Kanban/Tabela) e novas (Detalhe/Finalizadas/
  Orçamentos).

---

## Financeiro

**🔴 Alta**
- [ ] Caixa (abertura/fechamento) nunca reflete vendas do PDV nem
  títulos de OS pagos — a "conferência cega" que a tela existe pra
  fazer compara a gaveta contra um número que ignora quase todo o
  dinheiro do dia. ✅ *confirmado com verificação de 7 pontos* (o achado
  mais completo desta revisão).

**🟠 Média**
- [ ] Fluxo de Caixa classifica "Realizado" pelo **vencimento**, não pela
  data real de pagamento (`pago_em`) — o próprio comentário do arquivo
  avisa que esse é o erro mais comum em relatório de fluxo de caixa, e
  reproduz ele mesmo. Afeta título manual pago fora do mês do
  vencimento.
- [ ] Formulário de título manual não vincula fornecedor/cliente, apesar
  das colunas e cadastros já existirem — não dá pra consultar "quanto o
  cliente X me deve" pelo Financeiro.
- [ ] Assimetria: abrir/lançar no Caixa exige `finance.cashier.close`,
  ler os movimentos exige só `finance.view` — quebra pra qualquer
  exceção individual que receba só a primeira.

**🔵 Simplificação**
- [ ] `FinanceiroCaixa.tsx` sem hook dedicado.
- [ ] Baixa de título sempre paga o valor total — `valor_pago` sugere
  pagamento parcial que a UI não expõe.

---

## Cadastros de Apoio

**🔴 Alta**
- [ ] Cadastro "pronto mas isolado" — nada do resto do sistema consome.
  **3 "Passos" marcados como ✅ no PLANO-DE-CONSTRUCAO.md são, na prática,
  vitrine de CRUD sem ligação com o resto do sistema.** Estado por
  cadastro:
  - **Formas de Pagamento** — *parcialmente resolvido em 07/08*: o PDV já
    consulta o cadastro de verdade (migration `20260807060000`, commit
    `23292e8` — ver [Vendas/PDV](#vendas--pdv)). **Falta ainda**
    Vendas>Pagamentos e Caixa, que continuam no enum fixo antigo.
  - **Fornecedores** — não alimenta compra/entrada de estoque.
  - **Origem/Motivo de Compra do Cliente** — `Clientes.tsx` nunca usa,
    grava só o enum legado.

**🟠 Média**
- [ ] `tempo_estimado_horas` em Cadastro de Serviços tem o mesmo risco de
  overflow já corrigido 2x no projeto (margem, taxa/juros) — sem clamp.
- [ ] "Ver detalhes" em Clientes.tsx navega pra `/clientes/:id`, rota
  que não existe — 404 (mesmo bug que o Passo 4 já corrigiu pros cards
  de OS, aqui nunca foi).
- [ ] `custo_estimado` de Serviços lido pela API por qualquer usuário do
  tenant — mesma família da [decisão pendente](#decisão-que-só-você-pode-tomar).

**🔵 Simplificação**
- [ ] `Clientes.tsx` é a tela mais antiga da área — não usa `useAuth()`
  direto (usava re-fetch, já corrigido acima), não reaproveita
  `PageHeader`/`Vazio`, ainda no enum `origem` fixo em vez do catálogo
  dinâmico. Candidata natural a virar o próximo "Fornecedores.tsx".
- [ ] Boilerplate de CRUD quase idêntico em 4 telas (Fornecedores,
  Transportadoras, Serviços, Formas de Pagamento) — vira um hook
  `useCrudSimples`.
- [ ] `useCatalogos.ts` ainda usa o cliente não tipado `db` (ver
  [Apagar untyped.ts](#backlog-de-simplificação-transversal) abaixo).

---

## Dashboards e Inteligência Empresarial

**🟠 Média**
- [ ] Dashboard (Home) usa a lista fixa `OS_STATUS` em vez de
  `useOsStatuses()` — o plano já sabia do problema de rótulo/cor, mas
  **também erra a contagem dos KPIs** se a loja renomear/remover um
  status. ✅ *confirmado.*
- [ ] Custo do produto é buscado do banco mesmo pra quem não tem
  `inventory.cost.view` (só a exibição é escondida) — hoje é "falha
  latente" (nenhum papel atual combina acesso ao dashboard sem a
  permissão de custo), mas vira real no dia em que um papel novo for
  criado.
- [ ] IE Comercial/IE Estoque usam custo ATUAL do produto, não o custo
  no momento da venda — já virou padrão em 2+ telas, vale resolver de
  vez gravando `custo_unitario` em `itens_venda` no momento da venda.

**🔵 Simplificação**
- [ ] Redundância real entre o card "Vendas Hoje" do Dashboard Home e o
  DashboardVenda novo — avaliar consolidar.
- [ ] Agregação "vendas do período por produto" reimplementada quase
  igual em 3 telas (DashboardVenda, IeComercial, IeEstoque).
- [ ] Dashboard Home não checa erro de nenhuma das 6-7 chamadas Supabase
  — falha silenciosa mostra "0" em vez de indicar problema.
- [ ] Filtro de período em IE Comercial/IE Estoque compara string de
  data pura contra timestamp sem ajuste de fuso — pode deslocar até 3h
  o corte do dia (herdado do `RelatorioShell`, não é regressão nova).

---

## Relatórios

**🟠 Média**
- [ ] `RelatorioEstoque` busca `custo` do banco mesmo sem
  `inventory.cost.view` — mesma família da decisão pendente.
- [ ] Relatório Financeiro é liberado por `finance.view`, mas a RLS da
  tabela que ele lê exige outra permissão — não quebra com os papéis
  padrão, mas o gate confere a permissão errada pros dados reais.
- [ ] `RelatorioOS` mostra a chave crua do status (`em_reparo` → "em
  reparo") em vez do rótulo/cor customizável — nem usa `useOsStatuses`
  nem o fallback fixo, é `.replace()` puro.

**🔵 Simplificação**
- [ ] Escape de CSV não neutraliza `=`/`+`/`-`/`@` — risco de CSV/Formula
  Injection no Excel se nome de cliente ou descrição de título vier com
  esses caracteres.
- [ ] Nome do arquivo CSV de RelatorioEstoque sugere recorte de datas
  que não existe (a tela não filtra por período).
- [ ] Formatação de moeda pra CSV e filtro de período duplicados nos 4
  relatórios.

---

## Configurações, Permissões e Minha Empresa

**🔴 Alta**
- [ ] Sem proteção contra o único administrador se autodemover ou se
  desativar — sem caminho de volta dentro do app, trava o sistema pra
  todo mundo.
- [ ] Exceções de permissão por usuário não geram auditoria nem
  preenchem `motivo`/`definida_por` — a funcionalidade mais sensível da
  tela de Usuários é a única sem rastro. ✅ *confirmado.*

**🟠 Média**
- [ ] Página gated por `users.manage`, mas escrever papel/exceção exige
  `roles.manage` — sem checagem granular na UI. ✅ *confirmado.*
- [ ] `useUsuarios.definirPapel` troca de papel em 2 chamadas separadas
  (DELETE + INSERT), sem transação — falha no meio deixa usuário sem
  nenhum papel, silenciosamente. ✅ *confirmado.*
- [ ] `MinhaEmpresa` edita cor/logo, mas nada no app consome esses
  campos ainda (nem branding, nem um laudo em PDF, que não existe).
  ✅ *confirmado.*

**🔵 Simplificação**
- [ ] Cliente não tipado (`db`) ainda em `ConfigLogs`/`ConfigPerfis`/
  `ConfigPreferencias`/`RelatorioFinanceiro` — ver backlog abaixo.
- [ ] Badge de notificação no `AppHeader` é decorativo (sempre "3", sem
  query nenhuma por trás).
- [ ] Fetch de `permissions`/`role_permissions` duplicado entre
  ConfigPerfis e Usuarios, com 2 clientes Supabase diferentes pra mesma
  query.

---

## Arquitetura de rotas, menu e permissões (transversal)

**🟠 Média**
- [ ] `OSDetalhe.tsx` é a única página fora do `registry.tsx` central,
  montada direto em `App.tsx` — funciona, mas são 2 mecanismos de rota
  em paralelo. Se aparecer uma segunda rota parametrizada, vale decidir
  um padrão único.
- [ ] Lógica de "permissão decide visibilidade" reimplementada em 3
  lugares (`Sidebar.tsx`, `AppHeader.tsx`, `RequirePermission.tsx`) em
  vez de uma função central.
- [ ] Tipo `Role` do front (5 valores) menor que o enum `app_role` do
  banco (7 valores, 2 órfãos de propósito). Risco real é baixo (RLS já
  falha fechado pra papel desconhecido), mas rótulo em branco aparece
  em pelo menos 2 lugares (inclusive `Sidebar.tsx:273`) — corrigir com
  `ROLE_LABELS[role] ?? 'Desconhecido'`, é trivial.

**🔵 Simplificação**
- [ ] PLANO-DE-CONSTRUCAO.md descreve RBAC como "admin/atendente/
  técnico/vendedor" (4 papéis antigos) — o código já usa 5 papéis
  renomeados. Só o texto do plano antigo ficou desatualizado (não vale
  reescrever histórico, mas bom saber ao ler).
- [ ] Cabeçalho das migrations chama o sistema de "RPG System.IO",
  divergindo de "Sisteminha (RP System.IO)" usado no resto da
  documentação.

---

## Segurança e RLS (transversal — banco de dados)

**🔴 Alta**
- [ ] `ajustar_estoque_produto` (RPC, SECURITY DEFINER) não checa
  permissão nem tenant — chamável direto via API, ignorando a tela.
  ✅ *confirmado.*
- [ ] `proximo_numero_documento` (RPC) não valida que `_tenant` pertence
  a quem chama. ✅ *confirmado.*

**🟠 Média**
- [ ] `taxa_percent`/`juros_percent` de Formas de Pagamento têm o mesmo
  risco de overflow já corrigido em `margem_percent` — mitigado só no
  front, sem CHECK/alargamento no banco.
- [ ] `vendas.comissao_calculada` e `service_orders.total_pecas`/
  `total_mao_obra` parecem colunas sem gravador (órfãs) — confirmar e,
  se confirmado, considerar remover ou documentar por que ficam.

**🔵 Simplificação / dívida técnica**
- [ ] Integridade cross-tenant depende só da aplicação, não de FK/CHECK
  (risco zero hoje com 1 tenant, mas vale marcar pra quando virar
  multi-tenant de verdade).
- [ ] Policies redundantes/sobrepostas em `profiles` e
  `titulos_financeiros` (não é bug — Postgres faz OR — só dificulta
  leitura).
- [ ] `has_role()` e os valores legados do enum `app_role` ficam como
  código morto, sem `COMMENT ON` avisando que é intencional.

---

## Modelo de dados (transversal)

**🟠 Média**
- [ ] `produtos.categoria` (enum fixo) e `catalogos` tipo
  `grupo_produto` (catálogo flexível) são dois sistemas paralelos de
  categorização — decidir migrar um pro outro ou documentar por que
  coexistem.

**🔵 Simplificação**
- [ ] `untyped.ts` descreve um estado do banco que não existe mais — o
  comentário diz que `catalogos`/`role_permissions`/`formas_pagamento`
  "ainda não existem" em `types.ts`, mas já estão lá. Falta só trocar
  `db` por `supabase` em `useCatalogos.ts`, `useTitulos.ts`,
  `ConfigLogs.tsx`, `ConfigPerfis.tsx`, `ConfigPreferencias.tsx` e
  `RelatorioFinanceiro.tsx`, e apagar o arquivo. Zero risco.

---

## Backlog de simplificação transversal

Não quebram nada hoje — limpar enquanto a mão está na área correspondente:

- [ ] Apagar `untyped.ts` (ver acima).
- [ ] Util central pra traduzir erro de RLS (reimplementado em 13+
  arquivos com nomes diferentes).
- [ ] Helper `isEstoqueCritico(produto)` (reimplementado em 6 lugares).
- [ ] Hook `useCrudSimples` pro esqueleto repetido de cadastro simples.
- [ ] Hook `useLocalStorageState<T>` pra unificar `useCardConfig` e
  `useViewMode`.
- [ ] Hooks faltando pras entidades centrais: não existe `useProdutos`,
  `useVendas` nem `useServiceOrders` — 34 arquivos acessam o Supabase
  direto, sem hook nenhum.
- [ ] Migrar `PDV.tsx` pro padrão react-query do resto do projeto.
- [ ] Consolidar as 3 cópias do fallback de status de OS.
- [ ] Bundle principal (`index-*.js`) em ~600kB, acima do limite
  recomendado do Vite — avaliar code-splitting mais agressivo (a loja
  pode ter internet ruim).

---

## O que esta revisão não cobriu

Herdado da nota de honestidade do `REVISAO-TECNICA.md` — vale lembrar antes
de assumir que "não foi achado" significa "não existe":

- Nenhum teste foi feito no app rodando além dos 2 que eu confirmei
  manualmente (profile query e status TEXT/ENUM) — o resto é leitura
  estática de código.
- Componentes `src/components/ui/*` (shadcn) ficaram de fora de
  propósito — código gerado, não lógica de negócio.
- Não existem Edge Functions no projeto — não há essa camada extra.
- Sem varredura de segurança automatizada (SAST/dependência) — achados
  vieram de leitura manual.
- Acessibilidade, performance de bundle e testes automatizados não
  foram avaliados a fundo (o projeto tem hoje só 1 teste de exemplo).
- O site de marketing (Passo 8) não foi tocado nesta revisão.
- A verificação adversarial de 2ª leitura não rodou completa em
  Estoque, OS, Cadastros, Dashboards, Relatórios e Configurações — só
  Banco de Dados, Acesso a Dados e Permissões tiveram a maior parte
  desafiada antes do limite de sessão da rodada de auditoria.

---

## Ordem sugerida pra começar a lapidar

1. **Decidir a pergunta de segurança pendente** (custo/margem vazando
   via API) — muda a forma de corrigir Estoque, Cadastros, OS e
   Relatórios ao mesmo tempo, então melhor decidir antes de entrar
   nessas áreas.
2. **Vendas/PDV** — é a operação mais crítica do dia a dia; o
   cancelamento sem reversão de estoque é o próximo item que mais
   parece com os 2 já corrigidos (dinheiro/estoque saindo de forma
   errada, silenciosamente).
3. **Financeiro** — o Caixa não bater com a venda/OS real é o achado
   mais completo desta revisão (7 pontos verificados) e some direto
   com a confiança no fechamento diário.
4. **Ordens de Serviço** — orçamento aprovado com permissão errada,
   mais o laudo técnico incompleto (é o núcleo da assistência técnica).
5. **Cadastros de Apoio** — ligar de vez Formas de Pagamento/
   Fornecedores/Origem-Motivo ao resto do sistema, resolvendo em uma
   tacada as 3 telas "prontas mas isoladas".
6. **Estoque, Dashboards/IE, Relatórios, Configurações** — na ordem que
   fizer mais sentido pro seu dia a dia; a maioria dos achados aqui é
   inconsistência/dívida técnica, não quebra ativa.
7. **Backlog de simplificação** — ao longo do caminho, não como etapa
   separada; aproveitar quando a mão já estiver na área.

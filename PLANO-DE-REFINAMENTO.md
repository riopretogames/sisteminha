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

- [x] ✅ **Parte 1 da fundação — as views.** Migration
  `20260808110000_custo_protegido_views.sql`: `vw_produtos`, `vw_servicos`
  e `vw_os_itens`, com custo condicional via `has_permission`,
  `security_barrier` e filtro de tenant explícito. **Não quebra nada** —
  as tabelas continuam acessíveis. **Aplicada em produção em 07/08**, via
  SQL Editor, conferida pelas 4 linhas de verificação.
- [x] ✅ **Trava de desconto.** Migration
  `20260808120000_trava_desconto_venda.sql`: gatilho
  `validar_desconto_venda` em `vendas`, que recusa gravar
  `descontos != 0` sem `sales.discount`. Só dispara quando o valor do
  desconto muda; zerar desconto é sempre permitido. **Aplicada em
  produção em 07/08.**
- [ ] **Reconciliar o histórico de migrations.** As duas acima entraram
  pelo SQL Editor, então a tabela de controle da Supabase não sabe delas.
  Antes do próximo `db push`, rodar `supabase migration repair --status
  applied` nas duas versões — senão o CLI tenta reaplicar. As duas foram
  deixadas idempotentes de qualquer forma (`CREATE OR REPLACE` nas views,
  `DROP TRIGGER IF EXISTS` no gatilho), então reaplicar não quebraria.
- [x] ✅ **Ligar as telas de leitura nas views (07/08).** 14 arquivos.
  Regra aplicada sem exceção: **toda leitura** dessas 3 tabelas passa por
  view, mesmo a que não pede custo — assim ninguém precisa lembrar da
  regra depois, e adicionar `custo` a um `select` existente continua
  funcionando (vem nulo) em vez de virar erro. Escrita (`insert`,
  `update`, soft-delete) continua indo direto na tabela, com as policies
  de RLS que já existiam.
  - Leitura direta → view: Dashboard, DashboardEstoque, Estoque (só a
    linha 102 — as outras 3 são escrita), EstoqueCritico, IeEstoque, PDV,
    RelatorioEstoque, TrocaDevolucao, OSDetalhe (produtos, serviços e
    itens da OS), CadastroServicos.
  - Consulta aninhada (`venda → itens → produto`): usa apelido
    `produtos:vw_produtos(...)`, então o JSON continua com a chave
    `produtos` e nenhum código de tela precisou mudar. Vale pra
    IeComercial, IeEstoque, DashboardVenda, EstoqueMovimentacoes,
    OSDetalhe, TrocaDevolucao, VendasHistorico.
  - Verificado antes de editar, com chamada real à API REST: as 3 views
    respondem, o apelido funciona, `select('*')` na view funciona, e os
    filtros/ordenação usados hoje continuam válidos. Depois: `tsc` limpo,
    build ok, `eslint` sem nenhum problema novo (os 37 erros que ele
    aponta são todos anteriores — mesma contagem antes e depois).
  - ✅ **Validado no app rodando (07/08), pelo Felipe** — primeira vez
    nesta rodada que uma mudança foi testada de verdade no navegador, e
    não só por leitura de código. Passou por Estoque, Estoque Crítico,
    Movimentações, PDV, OS, Cadastro de Serviços, os 3 Dashboards, IE
    Comercial, IE Estoque, Relatório de Estoque e Histórico de Vendas.
    Nenhuma tela quebrou, nenhum custo veio vazio, nenhuma lista veio
    vazia. **A Parte 2 está liberada.**
- [ ] **Regerar `types.ts`.** As 3 views foram **escritas à mão** na
  seção `Views` (o gerador precisa de `supabase login`, que é passo do
  Felipe). O conteúdo reproduz o que o gerador produziria; regerar
  substitui por igual. Enquanto não rodar, vale lembrar que aquele
  trecho não é gerado.
- [x] ✅ **Quarto vazamento, que esta revisão NÃO tinha achado (07/08).**
  `movimentos_estoque` guarda `custo_unitario` **e** `valor_total`. É o
  mesmo vazamento dos outros três e, nesse caso, mais fácil de explorar:
  o histórico tem uma linha por produto que já entrou ou saiu, com o
  custo daquele momento — dava pra reconstruir a tabela de custo inteira
  da loja sem nunca tocar em `produtos`. A tela já escondia a coluna de
  quem não tem a permissão; faltava a trava real. Achado ao preparar a
  Parte 2. Migration `20260808130000` cria `vw_movimentos_estoque`;
  `EstoqueMovimentacoes` e `DashboardEstoque` já leem dela.
  **Lição pro resto do plano:** a auditoria procurou onde o custo é
  *mostrado*, não onde é *guardado*. Vale a mesma varredura antes de
  confiar em qualquer outro achado de "onde tal dado aparece".
- [x] **Parte 2 escrita — a tranca.** Migration
  `20260808140000_tranca_colunas_de_custo.sql`: `REVOKE SELECT` na tabela
  + `GRANT SELECT` coluna a coluna sem as protegidas, nas 4 tabelas, pra
  `authenticated` e `anon`. A lista de colunas é **descoberta** de
  `information_schema`, não digitada — lista fixa envelheceria, e uma
  coluna nova nasceria invisível pro sistema inteiro. Tem checagem que
  aborta se um nome de coluna protegida não existir. **Ainda não
  aplicada** — ver ordem abaixo.
- [x] ✅ **APLICADA EM PRODUÇÃO EM 07/08.** Sequência executada: view de
  movimentos → merge na `main` e push (commit `2b5b3ab`, o Lovable
  reconstruiu) → tranca. As 3 conferências voltaram limpas: as 6 colunas
  de custo **trancadas**, as 6 colunas comuns de controle **ainda
  abertas** (não trancou demais), as 4 views **existindo**.
  **A Opção B está fechada. O vazamento de custo acabou.**
- [ ] **Conferir com conta de teste** sem `inventory.cost.view`,
  consultando a API direto — a prova final, do lado de quem tentaria
  burlar. Vale fazer quando existir um segundo usuário de verdade (hoje
  todas as contas são administrador).
- [ ] **Risco a vigiar depois de trancar:** um
  `GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated` — coisa que
  ferramenta de plataforma às vezes gera sozinha — desfaz a tranca em
  silêncio, sem erro nenhum. Vale reconferir os privilégios depois de
  qualquer migration gerada fora daqui.

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
- [x] `clientes.limite_credito` — **a loja não trabalha com
  crediário/fiado**, então o controle de limite de crédito não tem
  cenário real pra existir. Não é feature adiada, é feature que não
  cabe no jeito que a Rio Preto Games vende. A coluna fica no schema
  (não faz mal parada), mas não vale construir UI pra ela.
- [x] ✅ **Revisto em 08/08 — `liberado_venda` SAIU desta lista.** Na
  revisão do cadastro de cliente, o Felipe decidiu que o liga/desliga
  "pode comprar na loja" tem uso real e nenhuma relação com fiado:
  serve pra golpe, cheque sem fundo e cliente que a loja não quer mais
  atender. Agora tem UI na ficha **e** trava no banco (gatilho
  `trg_venda_cliente_bloqueado`, migration `20260808160000`) — o PDV
  recusa selecionar e o banco recusa gravar, inclusive pela venda nova
  que a Troca gera. Era uma coluna que existia desde 01/08 sem ninguém
  ler, exatamente o problema que a flag `entra_no_caixa` ainda tem no
  Financeiro.

**🟠 Média — ainda pendente de decisão**
- [x] ✅ **07/08 — Cadastro rápido de cliente no PDV.** Achado pelo
  Felipe testando o app: havia "selecionar cliente" mas não "cadastrar
  cliente", então cliente novo no balcão obrigava a abandonar a venda e
  perder o carrinho. Nenhum dos ~90 achados da revisão pegou isso —
  leitura de código não sente fila de loja.
  Construído em `PDV.tsx`: botão ao lado do seletor abre um dialog com
  nome (obrigatório) e telefone; ao salvar, o cliente já fica vinculado
  à venda em andamento e entra na lista em memória na ordem certa, sem
  refetch. Carrinho, desconto e pagamentos não são tocados. Gateado por
  `registry.customers.manage` — **conferido que é exatamente a chave que
  a policy de INSERT em `clientes` exige** (e que as policies antigas
  permissivas foram removidas na `20260801000002`, então o gate do front
  e o do banco coincidem de verdade). `tenant_id` vem de `useAuth()`,
  não de re-consulta a `profiles`.
  Efeito colateral bom: `clienteSearch` agora é limpo ao selecionar
  cliente, ao escolher "sem cliente" e ao fechar a venda — antes sobrava
  filtro velho entre vendas.
- [x] ✅ **08/08 — Duplicidade de cliente, resolvida nas duas pontas.**
  Decisão do Felipe: **não vai ser permitido dois cadastros**; se o
  cliente já tem cadastro, a equipe seleciona o que existe e continua a
  venda. Migration `20260808150000`: índice único de CPF/CNPJ por loja e
  gatilho de telefone repetido, comparando **só os dígitos** (senão
  bastava digitar sem pontuação pra furar). Antes de gravar, tela e PDV
  chamam `buscar_clientes_semelhantes` e oferecem o cadastro encontrado
  — a recusa nunca chega como erro cru pra quem está atendendo.
  Nome igual é só aviso, nunca recusa: dois "João Silva" podem ser duas
  pessoas de verdade.
  Efeito colateral tratado: **Importação de Clientes gravava em lote, e
  lote é tudo-ou-nada** — um repetido derrubaria os outros 49 da
  planilha. Agora, quando o lote falha, ele é refeito linha a linha:
  quem pode entrar entra, e os repetidos aparecem listados pelo nome,
  separados dos erros de verdade.
- [x] ✅ **08/08 — `Clientes.tsx` agora checa permissão na interface.**
  Era a única tela de cadastro sem checagem: mostrava os botões pra todo
  mundo e deixava a RLS recusar com erro cru. Usa
  `registry.customers.manage`, a mesma chave que a policy do banco
  exige.
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
  - **Tags de Cliente** — ✅ *resolvido em 08/08, achado pelo Felipe*: o
    catálogo `tag_cliente` tinha 4 marcações editáveis (VIP, Fiel,
    Atacado, Atenção) e a ficha do cliente oferecia **3 fixas no
    código**, porque `clientes.tags` era um ENUM no banco. Criar
    "Atacado" em Listas do Sistema não fazia efeito nenhum. Agora existe
    `cliente_tags` (migration `20260808170000`), ligada ao catálogo com
    chave estrangeira de verdade — marcação nova aparece sozinha. As
    marcações antigas foram migradas ('problema' virou 'Atenção', que é
    o nome que dá pra dizer na frente do cliente). A coluna `tags` ficou
    marcada como legada, **não foi apagada** — apagar coluna com dado
    real depende de autorização sua.
  - **Origem/Motivo de Compra do Cliente** — ✅ *resolvido em 08/08*: o
    cadastro de cliente passou a ler os dois catálogos de verdade (8
    origens e 9 motivos, que já estavam semeados e nunca apareceram em
    tela nenhuma). O enum `origem` antigo continua sendo preenchido
    sozinho a partir da descrição escolhida, pra não quebrar relatório —
    mesmo tratamento que a `20260807060000` deu às formas de pagamento.

**🟠 Média**
- [ ] `tempo_estimado_horas` em Cadastro de Serviços tem o mesmo risco de
  overflow já corrigido 2x no projeto (margem, taxa/juros) — sem clamp.
- [x] ✅ **08/08 — "Ver detalhes" não dá mais tela branca.** A rota
  passou a existir (`/cadastros/clientes/:id`, montada em `App.tsx` do
  mesmo jeito que o drill-down de OS) e virou a **ficha do cliente**:
  dados cadastrais, o que ele já comprou, as OS dele, quanto já gastou,
  última compra e aviso de aniversário próximo. Total gasto ignora venda
  cancelada de propósito, senão devolução viraria faturamento na ficha.
  As abas de compra e de OS respeitam `sales.view` e `orders.view` — a
  ficha não conta dinheiro pra quem o RBAC diz que não vê venda.
- [ ] `custo_estimado` de Serviços lido pela API por qualquer usuário do
  tenant — mesma família da [decisão pendente](#decisão-que-só-você-pode-tomar).
- [ ] **Foto do cliente e Galeria de Arquivos — adiado de propósito
  (08/08).** As colunas `foto_url` existem, mas o projeto **não tem
  nenhum armazenamento de arquivo configurado** (nenhum bucket, nenhuma
  policy de storage). Não é ligar o que existe, é construir uma camada
  nova, com regra de quem pode ver e apagar. Decisão do Felipe: fica
  para uma etapa própria, junto das fotos de antes/depois da OS, que
  usam o mesmo mecanismo e valem mais para a assistência.
- [ ] **Cliente bloqueado ainda abre OS.** A trava de 08/08 vale para
  venda (`vendas`), não para `service_orders` — aparelho que já está na
  bancada precisa ser devolvido de algum jeito. Falta pelo menos um
  aviso visível em Nova OS, senão o bloqueio parece valer para tudo e
  não vale.
- [ ] **O cadastro rápido do PDV não pede CPF**, só nome e telefone. Quem
  cadastrar sem telefone escapa da trava de duplicidade — é o furo
  conhecido e aceito da porta rápida. Avaliar depois se vale exigir
  telefone no balcão.
- [ ] **Listas do Sistema não deixa escolher a cor do item**, apesar de a
  coluna `catalogos.cor` existir e de o próprio texto de ajuda prometer
  "etiqueta colorida". Marcação criada pela loja hoje chega sem cor, e
  `corDaEtiqueta` sorteia uma da paleta pelo nome (sempre a mesma pro
  mesmo nome) só pra não sair cinza no meio das coloridas. O seletor de
  cor de verdade — igual ao que "Gerenciar Status" já tem pras OS —
  continua faltando.
- [ ] **Varredura pendente: procurar o mesmo padrão nas outras telas.**
  A revisão inteira não tinha achado o furo das marcações; quem achou
  foi o Felipe, perguntando. São 16 tipos de catálogo cadastrados e
  vale conferir um por um quem está de fato ligado na tela que deveria
  usar — em especial `condicao`, `memoria`, `grade`, `tipo_peca` e
  `localizacao` no Estoque, e `checklist_defeito`, `acessorio_entrada` e
  `condicao_entrada` na OS. `origem_venda` já se sabe que é órfão
  (`vendas` não tem coluna pra guardar).

**🔵 Simplificação**
- [x] ✅ **08/08 — `Clientes.tsx` deixou de ser a tela mais antiga da
  área.** Reescrita no padrão do projeto: `PageHeader`/`Vazio`,
  react-query pelo novo `useClientes`, catálogo dinâmico no lugar do
  enum fixo e checagem de permissão. O formulário saiu de 5 campos para
  a ficha inteira que o banco já guardava desde 01/08 (tipo de pessoa,
  RG/Inscrição Estadual, nascimento, gênero, dois telefones, Instagram,
  site, endereço completo com busca por CEP, marcações, origem, motivo
  da compra e observações — que existia no formulário e **nunca era
  gravada**). Mora em `components/clientes/ClienteFormDialog.tsx`,
  porque a ficha do cliente reaproveita o mesmo formulário.
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
- [ ] Hooks faltando pras entidades centrais: continua sem `useProdutos`,
  `useVendas` e `useServiceOrders` — a maioria dos arquivos ainda acessa
  o Supabase direto. **`useClientes` já existe** (08/08), e serve de
  molde: nasceu menos por arrumação e mais por necessidade — a regra de
  "cliente repetido" precisa ser idêntica no cadastro completo e no
  cadastro rápido do PDV, e duas cópias garantiriam que uma das portas
  deixasse passar.
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

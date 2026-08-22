# Plano de Ação — Sisteminha (RPG System.IO)

**Começou em:** 07/08/2026 · **Atualizado em:** 22/08/2026

> **Este é o único documento de planejamento do sisteminha.**
> Se você quer saber o que falta fazer, o que já foi feito e por quê, é
> aqui. Não existe outro.

**Por que "o único":** até 18/08 o planejamento estava espalhado em cinco
documentos, e ninguém sabia mais qual valia. Decisão do Felipe naquele dia:
*"apaga os antigos e deixa somente o mais atualizado"*. Os quatro que
sobravam foram apagados depois de conferir, um por um, que tudo que ainda
era vivo neles já estava aqui dentro:

| Documento apagado | O que era | Por que podia sair |
|---|---|---|
| `PLANO-DE-CONSTRUCAO.md` | Passos 1 a 6, a construção do zero (04/08) | Histórico puro, parado desde 06/08 — o sistema já saiu dessa fase |
| `REVISAO-TECNICA.md` | Auditoria bruta, ~90 achados com arquivo e linha | Todos os achados foram reorganizados neste plano, por área |
| `MAPA-FINANCEIRO.md` | Como o dinheiro circulava, e as 4 decisões pendentes | As 4 decisões foram **respondidas pelo Felipe em 18/08** e estão registradas na seção Financeiro |
| `ESCOPO-REVISAO-09-08.md` | Escopo da revisão de 09/08, 6 achados | 5 resolvidos naquele dia, o 6º (título nascendo pago) resolvido em 18/08 |

**Nada foi perdido.** Os quatro continuam inteiros no histórico do Git, com
todo o texto original. Para ler qualquer um deles como estava:

```bash
git show 4fc4b3c:MAPA-FINANCEIRO.md
```

(troque o nome do arquivo; `4fc4b3c` é o último commit em que os quatro
ainda existiam).

Agora que o Passo 6 fechou o "construir do zero", a fase muda de figura:
não é mais adicionar tela nova, é **lapidar o que já existe** — achar o que
está pela metade, inconsistente ou arriscado, e corrigir/completar uma área
de cada vez.

**Verificação geral em 17/08:** com tanta coisa corrigida entre 07/08 e
10/08 sem que este documento fosse sempre atualizado no mesmo instante, rodei
uma checagem item a item de tudo que ainda estava marcado como aberto,
contra o código de verdade (não contra a memória de quando cada achado foi
escrito). Todo item que mudou de status ganhou uma nota datada "17/08" logo
onde ele está, com o motivo. Os itens sem nota nova foram conferidos e
continuam válidos exatamente como estavam descritos.

**Revisão completa em 18/08:** com o "Passo 6" bem distante e a maior parte
das áreas já lapidadas pelo menos uma vez, rodei uma auditoria nova do
projeto inteiro — 11 agentes, um por área (as mesmas seções deste
documento), cada um lendo o código de verdade sem confiar só no que já
estava escrito aqui, e verificação adversarial ativa em todo achado novo
marcado crítico (alguém tentando refutar, não só confirmar). Achados novos
ganharam a marca 🆕 **18/08**; achados que continuavam válidos ganharam
"Conferido/Reconfirmado em 18/08"; achados que mudaram de gravidade ou de
alcance ganharam ⚠️ com a explicação. **7 achados críticos novos foram
confirmados por dupla checagem nesta rodada** — nenhum tinha sido pego
pelas revisões anteriores. **Todos os 7 foram corrigidos no mesmo dia**
(Financeiro teve 2 dos 7; PDV, Estoque, Configurações, Dashboards e OS um
cada), cada correção com sua migration própria quando mexeu em banco,
verificação de tsc/eslint/build, e uma segunda revisão adversarial
independente antes do commit — ver os itens marcados ✅ **Resolvido em
18/08** em cada seção, e o resumo em [Ordem sugerida pra
continuar](#ordem-sugerida-pra-continuar-atualizada-em-1808).

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
- [x] ✅ **08/08 — Histórico de migrations reconciliado.** O Felipe fez o
  `supabase login`, o projeto está vinculado e as 26 migrations locais
  batem com o banco. Acabou a colagem manual no SQL Editor: agora é
  `npx supabase db push`.
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
- [x] ✅ **08/08 — `types.ts` regerado de verdade**, direto do banco, agora
  que o login existe. Nada mais ali é escrito à mão. Foi essa regeração
  que denunciou o problema do item abaixo.
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
- [x] ⚠️ **CORREÇÃO EM 08/08 — a linha acima estava errada num ponto.**
  A conferência de 07/08 dizia "as 4 views existindo". **A quarta não
  existia.** A migration `20260808130000` (`vw_movimentos_estoque`) nunca
  chegou ao banco, apesar de anotada como aplicada aqui.
  Consequência real, que ficou no ar por um dia: `EstoqueMovimentacoes` e
  `DashboardEstoque` liam uma view inexistente — as duas telas
  respondiam erro. Como ninguém usa o sistema, ninguém sentiu.
  **Como apareceu:** ao regerar `types.ts` com o login novo, o gerador
  trouxe 3 views em vez de 4. Confirmado por chamada direta à API (404 na
  quarta, 200 nas outras três). Aplicada de fato com `db push` e
  reconferida — as 4 respondem 200 agora.
  **Erro meu no caminho:** antes de descobrir isso, eu rodei
  `migration repair --status applied` nas 7 migrations pendentes de uma
  vez, incluindo essa — ou seja, marquei como aplicada uma que não
  estava. Desfeito com `--status reverted` e aplicado de verdade.
  **Lição, que virou regra no CLAUDE.md:** nunca marcar migration como
  aplicada sem perguntar ao banco se ela está lá. O registro do plano é
  memória de quem escreveu, não prova.
- [ ] **Conferir com conta de teste** sem `inventory.cost.view`,
  consultando a API direto — a prova final, do lado de quem tentaria
  burlar. Vale fazer quando existir um segundo usuário de verdade (hoje
  todas as contas são administrador).
- [x] ⚠️ **CONFIRMADO E CORRIGIDO EM 09/08 — o risco abaixo não era mais
  hipotético, já tinha acontecido.** Retomando a revisão numa sessão que
  precisou sincronizar um worktree defasado, conferi
  `information_schema.column_privileges` direto em produção (não confiei no
  registro deste plano) e achei `authenticated` **e** `anon` de volta com
  `SELECT` nas 6 colunas de custo. Causa mais provável: o Lovable só foi
  desconectado do projeto em 08/08 22:37 (commit `804a761`) — mais de um dia
  **depois** da tranca original (07/08 10:39, commit `babd1bd`); algum
  rebuild automático da plataforma nesse intervalo deve ter restaurado os
  GRANTs padrão dela. Reaplicado com a migration
  `20260809210000_retrava_colunas_de_custo.sql` (mesma lógica da
  `20260808140000`) e **reconferido no banco depois de aplicar**: nenhuma
  coluna de custo tem mais `SELECT` para `authenticated`/`anon`. **Lição:**
  todo "✅ aplicado em produção" deste documento é a memória de quem
  escreveu, não prova — reconferir contra o banco de tempos em tempos,
  principalmente depois de qualquer ferramenta externa (Lovable, dashboard)
  ter tocado no projeto.
- [ ] **Risco a vigiar depois de trancar (ainda vale, já se provou real
  uma vez):** um `GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated`
  — coisa que ferramenta de plataforma às vezes gera sozinha — desfaz a
  tranca em silêncio, sem erro nenhum. Vale reconferir os privilégios depois
  de qualquer migration gerada fora daqui. Como o Lovable já foi removido do
  projeto (08/08), o vetor mais provável fechou — mas o item continua de
  vigilância, não de confiança.

**O que muda pro usuário na tela: nada.** Quem já via custo continua
vendo; quem não via continua não vendo. A diferença é que agora a trava
é real, não cosmética.

---

---

## 🔴 O banco não tem backup nenhum (achado em 08/08)

> **ATUALIZAÇÃO 21/08 — está a um clique de resolver.** Conferido na máquina:
> o **Docker já está instalado** (`DockerDesktop/resources/bin/docker`), só não
> está *rodando* — era isso que bloqueava o `supabase db dump` esse tempo todo.
> Confirmado também, pelo próprio painel do Supabase via CLI, que **não existe
> backup nenhum**: `"backups": []` e `"pitr_enabled": false` (recuperação a
> ponto no tempo é do plano pago).
>
> Ficou pronto o arquivo **`backup-do-banco.cmd`** na raiz do projeto. O
> caminho inteiro agora é:
>
> 1. Abrir o Docker Desktop e esperar aparecer "Engine running".
> 2. Dar dois cliques em `backup-do-banco.cmd`.
> 3. Copiar a pasta `backups` para fora do computador.
>
> O passo 3 não é detalhe: backup que mora no mesmo computador que o original
> não protege contra a máquina queimar ou ser roubada. A pasta `backups/` já
> está no `.gitignore` — ela contém nome, CPF e telefone de cliente, e
> repositório não é lugar de dado pessoal.

O painel da Supabase mostra, com todas as letras: **LAST BACKUP — No
backups**. O projeto está no plano Free, que **não faz backup automático**.

Hoje os dados da loja — clientes, produtos, ordens de serviço, movimentações —
existem em **um único lugar no mundo**. O código está protegido (fica no seu
computador e no GitHub); os dados, não. Um `DELETE` errado, uma migration mal
escrita ou um problema no serviço e não há de onde voltar.

Isso é maior que qualquer item de lapidação abaixo, e continua aberto.

**Por que não foi resolvido em 08/08:** o comando de backup da Supabase roda
dentro do Docker, e a máquina não tem Docker, nem `pg_dump`, nem `psql`. Sem
uma dessas ferramentas, não há como puxar o banco para um arquivo local.

Caminhos, em ordem de preferência:

- [ ] **Instalar o Docker Desktop** (gratuito). Depois disso, gerar backup é
  um comando, a qualquer momento, sem depender de plano pago.
- [ ] **Plano Pro da Supabase** (~US$ 25/mês), que faz backup diário sozinho.
  Não se justifica enquanto ninguém usa o sistema — **mas se justifica no dia
  em que a loja migrar**, e essa decisão não pode chegar depois da migração.
- [ ] Exportar tabela a tabela em CSV pelo painel. Funciona sem instalar nada,
  mas é manual e é o tipo de tarefa que ninguém repete.

**Antes de qualquer migration destrutiva** (apagar coluna, apagar tabela),
resolver isto primeiro. Hoje não existe rede de segurança.

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
- [x] ✅ **Resolvido em 18/08 — 🆕 achado do dia, corrigido no mesmo dia.**
  Os botões de pagamento rápido do PDV apagavam pagamento já lançado na
  mesma venda. Em `PDV.tsx`, `addPagamento` (o formulário manual
  "Adicionar Pagamento") ACRESCENTA ao carrinho de pagamentos — certo.
  Mas os atalhos "PIX Total"/"Dinheiro"/"Cartão" (`pagarComForma`)
  SUBSTITUÍAM o array inteiro por uma única linha com o valor CHEIO da
  venda, sem checar se já existia pagamento lançado — clicar no atalho
  depois de já ter lançado parte manualmente apagava esse pagamento sem
  aviso. Corrigido: `pagarComForma` agora calcula o que falta (total
  menos o que já foi pago, incluindo produto de entrada em troca) e
  ACRESCENTA um pagamento só desse valor restante, igual o formulário
  manual já fazia — clicar duas vezes não duplica nada, porque na
  segunda vez já não sobra valor pra cobrir.

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
- [x] ✅ **08/08 — O cadastro rápido virou o cadastro completo.** O Felipe
  testou no app e reprovou o corte de escopo: *"não adianta ter uma
  informação de um lado e não ter do outro"*. Tinha razão — cadastro pela
  metade é cadastro que ninguém volta pra completar, e a ficha do cliente
  nasceria capenga justamente pelo caminho mais usado (o balcão).
  Em vez de copiar os campos pro dialog do PDV, o PDV passou a abrir **o
  mesmo componente** de Cadastros > Clientes. Impossível divergirem: é um
  arquivo só. Como apenas o nome é obrigatório, quem está com fila salva
  em dois segundos do mesmo jeito.
  Efeito colateral: `PDV.tsx` perdeu 190 linhas (o formulário duplicado, a
  busca de duplicados repetida e a tradução de erro própria).
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
- [x] ✅ **Ligado.** Catálogo "Origem da Venda" (Balcão/Site/WhatsApp/
  Instagram/Shopee) — existia desde 01/08, órfão porque `vendas` nunca
  teve coluna pra guardar. Migration nova adiciona
  `vendas.origem_venda_id` (mesmo padrão de `clientes.origem_id`), PDV
  usa `CampoCatalogo` (mesmo componente da Entrada de Produto por Troca)
  pré-selecionado em "Balcão". **Bug pego na revisão adversarial**: o
  efeito de pré-seleção brigava com "Limpar seleção" do próprio
  `CampoCatalogo` — corrigido com uma `ref` que só pré-seleciona uma
  vez. **Pendência anotada pelo revisor**: relatórios de venda
  (RelatorioVendas, VendasHistorico) ainda não mostram a origem — fica
  pro backlog se quiser ver isso lá.
- [x] ✅ **17/08 — Orçamento de venda: construído como simulação, igual
  decidido em 10/08.** Rota `/vendas/orcamento`
  (`src/pages/OrcamentoVenda.tsx`), permissão `sales.create` (mesma
  família do PDV). Carrinho igual ao PDV (mesma fonte de preço,
  `vw_produtos`), desconto gateado por `sales.discount`, botão Imprimir
  — mas **nenhum insert/update no banco**, confirmado na revisão
  adversarial. Sem seleção de cliente vinculado (só um campo de texto
  solto pro papel, não referencia `clientes` de verdade) — fechar de
  verdade continua exclusivamente no PDV.
- [x] ✅ **17/08 — PDV ganhou filtros de busca de produto.** Achado pelo
  Felipe testando o app: achar produto só pelo nome não bastava com a
  vitrine maior. Painel sempre visível (não escondido atrás de botão)
  com Categoria (catálogo `grupo_produto` — Console/Jogo/Controle/
  Celular/..., não o enum genérico), Marca, Cor, Condição, Memória e
  faixa de preço — todos os catálogos que a loja já cadastra em Listas
  do Sistema, sem lista fixa duplicada. Busca por texto passou a também
  casar por IMEI/série e código de barras, não só nome. Botão "Limpar
  filtros" fixo, desabilitado quando nenhum filtro está ativo. Mudança
  100% aditiva — carrinho, checkout, pagamento, cliente e troca ficaram
  intocados, conferido por diff na revisão adversarial. Testado e
  aprovado pelo Felipe no app rodando localmente.
- [x] ✅ **10/08 — Comprovante de venda: folha/PDF e térmica 80mm,
  Imprimir e envio por WhatsApp.** Pedido em 10/08 com exemplos reais
  (print da tela antiga de Gestão de Vendas + PDF "Nota de Venda
  Nº 5579"). Rota `/vendas/:id/comprovante`
  (`src/pages/ComprovanteVenda.tsx`).
  - Via de folha reproduz campo a campo o PDF de exemplo: cabeçalho da
    loja, dados da venda/cliente/vendedor, tabela de produtos (IMEI,
    descrição via catálogo — marca/cor/condição, coluna Defeito?,
    valores), tabela de pagamentos com taxa calculada por forma, linha
    de totais e os 8 parágrafos de garantia verbatim.
  - Via térmica 80mm é desenho próprio (sem exemplo dado, pedido
    explícito do Felipe pra eu desenhar um padrão): mesma informação
    essencial, condensada, sem os parágrafos de garantia por extenso.
  - **Dado novo que não existia**: "Defeito?" por item — em vez de
    fingir "Não" pra todo mundo (afirmação falsa de disclosure que a
    loja nunca fez), criei `itens_venda.defeito_declarado` (boolean,
    default false) com um switch no carrinho do PDV, desligado por
    padrão.
  - Histórico de Vendas ganhou botão Imprimir de verdade por linha (o
    ícone antigo era só decorativo).
  - Vendas canceladas mostram aviso em tela e marca "VENDA CANCELADA"
    nas duas vias, pra ninguém imprimir/mandar como se fosse válida.
  - **Simplificação assumida**: taxa por forma de pagamento é flat
    (`taxa_percent`), sem olhar taxa por parcela individual — mesma
    simplificação já assumida em `FormasPagamento.tsx`, não é gap novo.
  - Revisado por agente adversarial contra `types.ts`/RLS/padrões já em
    produção — nenhum bug encontrado.
  - **⏸️ Adiado de propósito (decisão do Felipe em 10/08): envio por
    WhatsApp fica para uma etapa futura, não é pendência urgente.** A
    tela já monta o texto e formata o telefone do cliente, mas o envio
    de verdade depende de um workflow n8n que recebe o POST e manda
    pelo WuzAPI (mesmo mecanismo do fluxo de Laudos — `WUZAPI_URL`/
    credencial Header Auth já existem, reaproveitáveis). Tentei criar
    esse workflow nesta rodada, mas a ferramenta de referência do SDK
    do n8n (`get_sdk_reference`) estava fora do ar — combinado que
    isso fica para quando o Felipe quiser retomar, seja eu tentando de
    novo, seja alguém montando direto no n8n copiando o padrão do node
    "Enviar WhatsApp (WuzAPI)" do workflow de Laudos. Botão fica
    visível mas desabilitado com aviso claro até isso ser ligado
    (constante `N8N_WEBHOOK_COMPROVANTE` vazia no topo do arquivo).

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
- [x] ✅ **17/08 — as 2 pendências acima, corrigidas.**
  1. Dinheiro devolvido agora lança saída automática no Caixa —
     gatilho `registrar_devolucao_no_caixa` (migration
     `20260817120000`), tipo novo `devolucao` em `tipo_mov_caixa`. Sem
     caixa aberto no momento, não lança nada (mesma limitação que
     venda/OS ainda têm hoje — cliente pagando a mais numa troca
     continua fora do escopo, vira pagamento de venda normal, e
     pagamento de venda ainda não entra no Caixa pra nenhuma venda —
     achado maior, separado, ligado ao Financeiro).
  2. Faturamento reportado não conta mais o produto trocado duas
     vezes — `vendas.valor_faturamento_real` (migration
     `20260817100000`, NULL em toda venda comum) guarda quanto entrou
     de dinheiro novo de verdade na venda nova de uma troca.
     `VendasHistorico`, `RelatorioVendas`, `Dashboard` (Home) e
     `DashboardVenda` agora somam `COALESCE(valor_faturamento_real,
     total)` nos indicadores agregados — as colunas linha-a-linha das
     tabelas continuam mostrando `total` puro, de propósito.
  - **Bug pego na revisão adversarial, corrigido com migration nova
    antes de subir**: `devolucoes` nunca teve policy de DELETE — o
    rollback que a tela tenta fazer quando o registro falha no meio
    não fazia nada de verdade, podia deixar uma saída de Caixa órfã
    (ou lançar o mesmo estorno duas vezes numa nova tentativa).
    Corrigido com a policy que faltava + `ON DELETE CASCADE` de
    `caixa_movimentos.devolucao_id` (migration `20260817130000`).
- [x] ✅ **Resolvido em 21/08.** Não havia trava no banco contra devolver
  mais unidades do que a venda teve — só o limite do campo na tela, que
  resolve o erro de digitação e mais nada. Passavam por baixo: duas
  devoluções da mesma venda em terminais diferentes (as duas leem "restam
  2", as duas devolvem 2), chamada direta à API, e a automação do n8n
  quando existir. Caro porque devolução mexe em dinheiro E estoque ao mesmo
  tempo: paga ao cliente valor que ele nunca gastou e faz entrar unidade
  que nunca saiu — diferença que só aparece no inventário, meses depois,
  sem rastro. Gatilho `trg_quantidade_devolvida` (migration
  `20260821130000`) confere contra a venda original, e o `SELECT ... FOR
  UPDATE` é o que faz valer no caso concorrente: a segunda transação espera
  a primeira e reconta. Testado no banco, 5 de 5 — inclusive um caso que
  nem estava no achado: devolver produto que não estava naquela venda.

**🆕 Achados da revisão geral de 20/08 (pós-fusão de duas frentes)**
- [x] ✅ **Resolvido em 20/08 — ordem de gravação no checkout do PDV
  quebrava o cálculo de troco do Caixa numa venda com troca.** O gatilho
  `lancar_pagamentos_venda_no_caixa` (Financeiro, migration `20260818100000`)
  calcula o troco somando todos os `pagamentos_venda` já gravados pra
  aquela venda no momento em que cada `INSERT` roda — mas o `handleCheckout`
  gravava primeiro o lote de pagamentos manuais (dinheiro/cartão/PIX) e só
  depois, em chamadas RPC separadas, a entrada de cada produto recebido em
  troca. Resultado: o gatilho via só a parte manual, calculava troco de
  menos e lançava dinheiro A MAIS no Caixa do que realmente ficou na
  gaveta (ex.: venda de R$100, troca de R$50, R$70 em dinheiro — o Caixa
  registrava R$70 em vez dos R$50 líquidos). Corrigido gravando a entrada
  de troca ANTES do lote de pagamentos manuais — e, na mesma leva, o
  gatilho do Caixa também passou a recalcular a partir de tudo que existe
  agora em vez de travar no primeiro cálculo (ver detalhe no item
  "Reabrir OS duplica lançamento" na seção Ordens de Serviço, migration
  `20260820100000`), o que cobre inclusive 2+ produtos de troca na mesma
  venda. Testado com transação revertida no banco.
- [ ] 🟠 **Falha parcial no recebimento de produto por troca (dentro do
  próprio PDV) deixa produto e pagamento `vale_troca` órfãos numa venda
  cancelada.** No checkout do PDV, cada produto recebido em troca chama
  a RPC `registrar_entrada_produto_troca` numa chamada separada (já
  efetiva sozinha: cria o produto, o pagamento e o rastro). Se o
  carrinho tiver 2+ produtos de troca e o segundo falhar depois do
  primeiro já ter sido gravado, a venda inteira é cancelada — mas o
  gatilho de estorno só devolve o estoque dos itens normais, não desfaz
  o que a RPC já tinha efetivado. É o mesmo tipo de "venda órfã" que
  `TrocaDevolucao.tsx` já corrige, mas esse caminho paralelo dentro do
  PDV não tem a mesma proteção.
- [x] ✅ **Resolvido em 21/08.** O Histórico de Vendas trazia sempre as
  últimas 500 vendas e aplicava o filtro de data sobre essas 500, já em
  memória — passando de 500 no intervalo, as mais antigas sumiam sem
  aviso. O sintoma que importa: "quanto o vendedor X vendeu esse mês"
  respondia diferente aqui e no Relatório de Vendas, e número que muda
  conforme a tela destrói a confiança nos dois. O período passou a ir
  para o banco, com a mesma régua do Relatório. Os outros filtros seguem
  em memória de propósito — refinam DENTRO do período. O limite de 500
  continua, mas agora vale dentro do período pedido, e quando bate no
  teto **a tela avisa** e aponta o Relatório de Vendas para o número
  fechado: total que parece completo e não está é pior do que total
  assumidamente parcial.

- [ ] 🔵 **Coluna "Desconto" por item no comprovante de venda sempre
  mostra R$0,00.** O desconto do PDV é gravado só a nível da venda
  inteira (`vendas.descontos`), nunca por item (`itens_venda.desconto`
  nunca é preenchido) — mas o comprovante (folha e térmica) tem uma
  coluna "Desconto" por produto que sempre aparece zerada, mesmo numa
  venda com desconto real. O total geral do comprovante continua certo.

- [x] ✅ **Feito em 22/08 — número da venda muda pra OV0001, OV0002... e a
  venda ganha linha do tempo.** Pedido do Felipe, vendo o CSV do
  Relatório de Vendas: o número `VD-202608-0015` (reinicia todo mês)
  virou `OV0001` numa sequência única por loja que nunca reinicia — nem
  no fim do mês, nem no fim do ano. Só vendas **novas** usam o formato
  novo; as que já existem mantêm o `VD-AAAAMM-NNNN` que já tinham
  (decisão do Felipe — não reescreve histórico). Numeração de OS
  (`OS-AAAAMM-NNNN`) não muda.

  Junto, veio o pedido de documentar hora de criação, hora de cada
  mudança de etapa e quem fez. A hora/quem de criação já existia
  (`vendas.created_at`/`vendedor_id`); o que faltava era o histórico de
  mudança de status **depois** de criada. Nova tabela
  `venda_status_historico`, gravada por gatilho só quando o status muda
  de verdade — espelha `service_order_history`/`track_os_status_change`
  de Ordens de Serviço, que já era exatamente esse mecanismo, testado e
  em produção. Diferença deliberada: sem policy de INSERT (só o gatilho,
  SECURITY DEFINER, escreve) — mesmo raciocínio do comentário em
  `auditoria`, "log que pode ser editado não é log"; a versão de OS tinha
  uma policy de INSERT direto que nunca foi necessária, não repetida
  aqui.

  Não criei uma coluna separada de "hora de finalização": hoje o PDV
  cria a venda já com status `pago` numa única gravação (não existe fase
  de rascunho persistida), então "criada" e "finalizada" são o mesmo
  instante — uma coluna própria só repetiria `created_at`. Se o fluxo
  ganhar uma etapa de rascunho de verdade no futuro, o gatilho já
  registra essa transição automaticamente, sem precisar de nada novo.

  Na tela, **Histórico de Vendas > abrir uma venda** ganhou a seção
  "Linha do tempo", juntando três fontes em ordem de hora: criação
  (vendedor), mudança de status (`venda_status_historico`) e devolução
  (`devolucoes`, que já existia com quem/quando/motivo). Resolve o nome
  de quem fez contra TODOS os perfis (não só ativo) — mesmo cuidado que
  `OSDetalhe.tsx` já tinha, pra um evento antigo continuar mostrando o
  nome de alguém que já saiu da loja.

  Migration `20260822130000`. `npm run check` limpo.

---

## Estoque

**🔴 Alta**
- [x] ✅ **Resolvido em 18/08.** Botão "Repor" em EstoqueCritico chamava
  `ajustar_estoque_produto` (RPC) sem checar permissão nem tenant no
  banco — proteção era só cosmética na tela, e o mesmo buraco alcançava
  também a ficha do produto (`EstoqueDetalhe.tsx`). O alcance era maior
  do que "falta permissão": a função nem conferia se o produto pertence
  à mesma loja de quem chama — qualquer autenticado, de qualquer loja
  cadastrada no sistema, podia mudar o estoque de um produto de OUTRA
  loja passando o ID direto pela API. Corrigido: a função agora exige
  `tenant_id` igual e `inventory.adjust` antes de qualquer efeito.
  Testado com uma transação real no banco (revertida sem deixar
  rastro): bloqueia produto de outra loja, bloqueia por permissão, e
  libera normalmente pra quem tem acesso na própria loja. Revisão
  adversarial achou e fechou um efeito colateral real: `EstoqueDetalhe.tsx`
  sempre liberava o campo "Estoque Atual" com `inventory.edit`, uma
  permissão diferente da que o banco passou a exigir — quem tivesse
  editar produto sem ajustar estoque (combinação possível via exceção
  de usuário) veria o campo liberado e a gravação falharia só nesse
  pedaço, depois do resto da ficha já ter salvo. Corrigido pra exigir
  as duas permissões, com aviso visível de qual falta.
- [x] ✅ **Resolvido em 18/08 — 🆕 achado do dia, corrigido no mesmo dia.**
  Salvar a ficha do produto zerava o custo real de quem não tem
  permissão de ver custo. Quem tem `inventory.edit` mas não
  `inventory.cost.view` recebia `custo = null` da view protegida
  (exibição correta, o campo nem aparece na tela) — mas o formulário
  guardava isso como texto "0", e o botão Salvar mandava esse "0" de
  volta pro banco incondicionalmente, mesmo que a pessoa só quisesse
  mudar o estoque mínimo ou a localização. Corrigido em
  `EstoqueDetalhe.tsx`: o campo `custo` só entra no payload do UPDATE
  quando a pessoa tem `inventory.cost.view` — quem não tem, ao salvar
  qualquer outra coisa, simplesmente não manda essa chave, e o banco
  mantém o valor que já estava lá (a escrita de custo continua livre no
  banco de propósito, pra não travar quem cadastra produto novo sem ver
  custo alheio — por isso a trava tinha que ser na tela, não no banco).

**🟠 Média**
- [x] ✅ **Resolvido em 18/08 (terceira leva) — eram duas telas e dois
  bugs, não um.** Saída de estoque (venda ou peça usada em OS) aparecia
  em verde com "+", igual a uma entrada de mercadoria. Os gatilhos de
  venda/OS gravam a quantidade como número POSITIVO — quem diferencia é
  o campo `tipo = 'saida'`; só o ajuste manual usa negativo. As telas
  decidiam cor e sinal só pelo número, então o caso mais comum do dia
  aparecia com a cor de entrada, justamente na tela que existe pra ser a
  auditoria do estoque.

  **Descoberto ao corrigir:** (a) o mesmo código estava em DUAS telas —
  `EstoqueMovimentacoes.tsx` e a aba de movimentações da ficha do
  produto (`EstoqueDetalhe.tsx`); (b) o contador de "entradas" filtrava
  por `quantidade > 0`, o que somava as SAÍDAS de venda junto (elas vêm
  positivas) — o mesmo movimento entrava nos dois contadores e o total
  de entradas ficava inflado. Esse segundo nunca tinha sido anotado.

  A régua agora mora em `src/lib/movimentoEstoque.ts`: o `tipo` manda, e
  o sinal só decide onde o tipo não diz (ajuste e inventário, que vão
  pros dois lados). 10 testes cobrem os casos, inclusive o de não virar
  menos duplo quando o número já vem negativo. O CSV exportado leva o
  mesmo sinal da tela.
- [x] ✅ **Resolvido em 20/08 (resgate do 11/08) — achado que tinha sido
  rebaixado por engano em 17/08, sem a informação de uma branch perdida.**
  O achado original ("`Estoque.tsx` mostra custo/margem pra qualquer
  usuário, ignorando `inventory.cost.view`") é de antes da Opção B
  fechar. Em 17/08 foi rebaixado com a nota de que a tela só mostrava
  "R$0,00" enganoso pra quem não vê custo — só que o conserto de verdade
  já existia desde 11/08 numa branch que nunca chegou na main
  (`claude/project-complete-review-347203`), e sem essa informação a
  reavaliação de 17/08 aconteceu no escuro. Resgatado em 20/08: a coluna
  Custo/Margem inteira agora só aparece com `veCusto` (`{veCusto &&
  (...)}`), e a célula também confere `produto.custo != null` antes de
  formatar (mostra "—" no raro caso de faltar mesmo com permissão) — o
  mesmo padrão que `CadastroServicos`/`RelatorioEstoque` já usavam.
  Confirmado no código atual pela revisão geral de 20/08, linha por
  linha, não só pelo texto do commit.
- [x] ✅ **Resolvido em 20/08 (resgate do 11/08) — achado novo, nunca
  tinha entrado nesta seção do plano.** Em `EstoqueCritico.tsx`, o
  rótulo do indicador ("Custo para repor tudo" vs. "Valor em venda")
  decidia pelo VALOR calculado (`custoReposicao > 0`) em vez de
  perguntar a permissão direto — funcionava por acidente na maioria dos
  casos (quem não tem `inventory.cost.view` recebe custo nulo da view,
  a soma dá 0 e o rótulo troca sozinho), mas errava no caso legítimo de
  quem TEM a permissão e ainda não cadastrou custo de compra nos
  produtos em alerta (via de repor, "Valor em venda" no lugar errado).
  Corrigido pra perguntar `can(PERMISSIONS.INVENTORY_COST_VIEW)`
  diretamente, igual `RelatorioEstoque` já fazia.
- [x] ✅ **Resolvido em 21/08.** `Estoque.tsx` era a única tela de cadastro
  que não escondia os botões por permissão — quem não tinha acesso clicava
  e recebia erro cru da RLS, sem ter como saber que o problema era de
  acesso. Botão que aparece e não funciona é pior do que botão escondido.
- [x] ✅ **Resolvido em 21/08 — eram 7 cópias, não 6.** Virou
  `src/lib/estoque.ts` com 9 testes, cobrindo também o que a comparação
  solta errava: produto sem mínimo cadastrado e valor nulo. Ao substituir,
  apareceu um efeito colateral real — no `Dashboard` a variável local se
  chamava `estoqueCritico` e passou a sombrear a função importada; a
  contagem virou `qtdEstoqueCritico`.
- [x] ✅ **Resolvido na prática em 21/08.** `inventory.delete` continua no
  catálogo, mas o botão Excluir do Estoque passou a perguntar
  `inventory.edit` — que é o que o banco realmente exige, já que "excluir"
  ali é soft-delete (um UPDATE em `ativo`). Usar `inventory.delete`
  esconderia o botão de quem o banco deixaria passar. Se um dia a permissão
  for aposentada de vez, nenhuma tela depende dela.

**🔵 Simplificação**
- [ ] Preview de margem no dialog de cadastro não aplica o mesmo clamp
  ±9999,99% da coluna gerada no banco.
- [ ] `Estoque.tsx` sem hook compartilhado (`useProdutos()` não existe).

---

## Ordens de Serviço / Assistência Técnica

**🔴 Alta**
- [x] ✅ **Resolvido em 20/08 — a trava de "Aprovar orçamento" (17/08) tinha
  um QUARTO caminho, mais simples que os três já fechados, e ainda aberto:
  dava pra pular direto pra "Aprovado" vindo de QUALQUER outra etapa, não só
  saindo de "Aguardando aprovação".** Achado na revisão adversarial de 20/08
  ao reler `TrocarEtapaOS.tsx`, `OrdensServico.tsx` e `OSTableView.tsx` por
  completo: as três telas só escondiam "Aprovado" do seletor quando a OS JÁ
  estava em "Aguardando aprovação" (`decisaoDeOrcamentoBloqueada`) — mas o
  seletor da ficha, o seletor da grade e o Kanban sempre ofereceram TODAS as
  etapas como destino possível (de propósito, pra "voltar uma etapa" ou
  "pular pra etapa extra da loja"). Isso significa que uma OS recém-aberta,
  ainda em "Aguardando análise", podia ser arrastada (Kanban) ou selecionada
  (grade/ficha) direto pra "Aprovado" num passo só — sem nunca passar por
  "Aguardando aprovação". O gatilho do banco
  (`validar_aprovacao_orcamento_os`, migration 20260817140000) só confere
  `OLD.status = 'aguardando_aprovacao'`, então esse pulo passava batido
  também no banco: um técnico com `orders.edit` (e sem `orders.approve`)
  aprovava orçamento de qualquer OS, a qualquer momento, com um clique —
  driblando a permissão inteira, não só "em dois passos com uma etapa
  reordenada" como o item de observação abaixo já cogitava.
  - Corrigido nas 3 telas: `TrocarEtapaOS.tsx`, `OrdensServico.tsx`
    (`handleStatusChange`, cobre Kanban arrastado e seletor da grade
    juntos) e `OSTableView.tsx` — "Aprovado" agora exige `orders.approve`
    **sempre**, não só saindo de "Aguardando aprovação". "Cancelar OS"
    continua com a regra estreita de antes (só bloqueado saindo de
    "Aguardando aprovação"), porque é a única saída de cancelamento que o
    banco de fato trava — cancelar de outra etapa não é "recusar
    orçamento" e sempre foi permitido.
  - **✅ Migration aplicada em 20/08** (`20260820100000_fecha_bypass_aprovacao_e_duplicidade_caixa.sql`):
    `validar_aprovacao_orcamento_os` agora exige `orders.approve` pra
    QUALQUER transição que resulte em "aprovado", não só saindo de
    "aguardando_aprovacao" — fecha a trava de verdade no banco, não só na
    tela. "Recusar" (`aguardando_aprovacao` → `cancelado`) continua exigindo
    `orders.approve`; cancelar de outra etapa continua livre com
    `orders.edit`, como sempre foi. Testado com transação revertida:
    técnico sem `orders.approve` bloqueado ao pular direto pra "aprovado"
    vindo de "recebido"; o mesmo técnico ainda consegue cancelar de
    "recebido" normalmente (regra estreita preservada).
- [x] ✅ **Resolvido em 20/08 — achado do mesmo dia, migration aplicada no
  mesmo dia.** Reabrir uma OS entregue (paga) e entregar de novo duplicava
  o lançamento em Caixa, mesmo sem nenhum pagamento novo. A reabertura
  (`reabrirOS.ts`, seção 🟠 abaixo) deixa uma OS voltar de "Entregue" pra
  qualquer etapa anterior e ser entregue de novo — de propósito. O
  problema estava no gatilho `registrar_pagamento_os_no_caixa` (criado em
  18/08 por outra frente): ele recalculava a soma de TUDO em
  `os_pagamentos` toda vez que o status virava "entregue", sem nenhuma
  trava de "já lancei isso antes" (diferente do gatilho irmão de venda,
  que já tinha essa trava). Corrigido na mesma migration acima: os dois
  gatilhos (venda e OS) passaram de "calcula uma vez e trava" pra
  "recalcula sempre a partir de tudo que existe agora, e AJUSTA o
  lançamento existente em vez de duplicar" — com uma regra a mais: sessão
  de caixa **fechada** nunca é alterada (mesma trava de 17/08 pra
  `caixa_sessoes`); só dinheiro genuinamente NOVO vira lançamento novo na
  sessão aberta atual. Isso também fechou, de brinde, o mesmo tipo de
  problema no PDV: venda com 2+ produtos recebidos em troca grava
  pagamento em mais de uma instrução SQL separada, e o gatilho de venda
  (que roda por instrução) só via o primeiro item antes da correção.
  Testado com transação revertida: venda com 2 itens de troca em
  instruções separadas + lote manual soma certo num lançamento só; OS
  reaberta e reentregue sem pagamento novo não duplica; OS reaberta e
  reentregue COM pagamento novo lança só a diferença, na sessão atual,
  sem tocar no lançamento já fechado.
- [x] ✅ **17/08 — Aprovar/recusar orçamento agora exige `orders.approve`
  de verdade, nos 3 lugares que conseguiam fazer essa transição.**
  `orders.approve` existia cadastrada desde 01/08 (administrador/
  gerente/gerente_tecnico/vendedor têm, técnico não tem), mas nenhuma
  tela nem policy conferia — técnico aprovava/recusava do mesmo jeito
  que vendedor, contra a regra que o próprio Felipe ditou (quem fala
  com o cliente decide orçamento, técnico não tem esse contato).
  - Migration `20260817140000`: gatilho `validar_aprovacao_orcamento_os`
    (BEFORE UPDATE em `service_orders`) bloqueia a transição
    `aguardando_aprovacao` → `aprovado`/`cancelado` pra quem não tem
    `orders.approve`, mesmo via API direta. Só essa transição
    específica — `orders.edit` continua bastando pra qualquer outra
    edição de OS.
  - `OSOrcamentos.tsx`: botões Aprovar/Recusar gateados por
    `orders.approve`.
  - `TrocarEtapaOS.tsx` (ficha da OS): some o atalho de avançar e as
    opções Aprovado/Cancelar OS do seletor quando a etapa atual é
    aguardando aprovação e falta `orders.approve`.
  - **Terceiro caminho achado na revisão adversarial**:
    `OrdensServico.tsx` (Kanban e grade) tinha sua própria função de
    trocar status — arrastar o cartão ou usar o seletor da grade
    também conseguia a mesma transição sem a mesma trava de tela (só o
    gatilho do banco barrava, com erro cru do Postgres). Corrigido
    igual às outras duas telas.
  - **Observação registrada, não corrigida (decisão de produto)**: se
    uma etapa extra for reordenada pra ficar *entre*
    "Aguardando aprovação" e "Aprovado" em "Gerenciar Status", um
    técnico poderia chegar no mesmo resultado em 2 passos (a trava
    compara só a etapa *imediatamente* anterior). Não acontece hoje
    com a ordem padrão — fica pra decidir depois se vale fechar essa
    brecha e como.
- [x] ✅ **Resolvido em 18/08 — 🆕 achado do dia, corrigido no mesmo dia.**
  O relógio de "Aguardando Retirada" resetava a zero com qualquer
  edição cosmética na OS, escondendo aparelho realmente abandonado. A
  view que alimenta essa tela media há quantos dias a OS está parada
  usando `updated_at` (porque a data real de "ficou pronto" nunca é
  preenchida — só a de "foi entregue"), e `updated_at` muda com
  QUALQUER edição, mesmo sem trocar de etapa. Corrigido: a view
  `vw_os_aguardando_retirada` agora busca em `service_order_history` a
  última vez que a OS ENTROU em "finalizado" (o mesmo dado que já
  alimenta o card "Histórico da OS" na ficha), com fallback pro
  comportamento antigo só no caso raro de não haver nenhum registro de
  histórico.

**🟠 Média**
- [x] ✅ **Resolvido em 18/08 (terceira leva) — e eram DOIS caminhos, não
  um.** Reabrir uma OS já entregue passava calado. O item original citava
  só o seletor da ficha; conferindo o código, o Kanban (card arrastado e
  seletor da grade, `OrdensServico.tsx`) tinha exatamente o mesmo buraco.
  Não dava pra simplesmente proibir — reabrir é legítimo com frequência
  (cliente volta com o mesmo defeito, entrega marcada por engano) — mas
  também não podia passar sem aviso: entregar já gerou o título no
  financeiro, reabrir não desfaz esse título, e com a OS reaberta o
  orçamento volta a ficar editável. Se alguém mexer no valor, a ficha
  mostra um número e o título lançado outro, sem nada denunciando. Agora
  os dois caminhos confirmam antes, dizendo o valor que continua lançado.
  O texto e o motivo ficam em `src/lib/reabrirOS.ts` — um lugar só, porque
  texto duplicado em duas telas envelhece diferente em cada uma.
  **Falta testar na tela** (precisa de sessão logada e uma OS entregue).
- [x] ✅ **Resolvido em 18/08 (terceira leva).** "Valor do orçamento"
  ficava editável em OS cancelada: o campo olhava só `jaFoiEntregue`,
  enquanto a seção de peças logo abaixo já travava para entregue E
  cancelada (`osEncerrada`) — mesma ficha, duas regras, e o próprio
  comentário do código registrava a assimetria sem corrigir. Agora as duas
  partes seguem a mesma régua, com aviso próprio para a cancelada.
- [x] ✅ **17/08 — Laudo completo, os 3 níveis de certeza na ficha.**
  `OSDetalhe.tsx` ganhou o card "Diagnóstico técnico": Técnico
  responsável (Select, salva na hora — antes só era atribuível na
  abertura da OS, não aparecia nem podia ser trocado na ficha), Suspeita
  técnica e Constatação técnica (rascunho local até "Salvar
  diagnóstico", mesmo padrão do campo de orçamento que já existia),
  Reparo inviável (switch) e Risco informado ao cliente (botão de ação
  direta, grava o horário). Fecha o padrão de atendimento do CLAUDE.md
  raiz (3 níveis de certeza no laudo, nunca misturados) sem precisar de
  migration nova — as colunas já existiam desde 01/08, só faltava tela.
- [x] ✅ **09/08 — "Técnico Responsável" deixou de ser campo morto**
  (commit `85e6b54`, migration `20260809140000`). NovaOS.tsx ganhou um
  campo de atribuição na abertura da OS, e a FK que antes apontava pro
  lugar errado (por isso o nome nunca aparecia) foi corrigida — hoje
  aparece no card do Kanban quando essa opção está ligada na
  configuração do cartão.
- [x] ✅ **09/08 — Status customizável parou de depender de chaves
  soltas.** `src/config/osStatus.ts` centralizou o que antes eram 6
  cópias espalhadas em 7 telas, e a migration `20260809130000` passou a
  **proibir no banco** excluir ou renomear a *chave* de um status
  marcado como "de sistema" (só rótulo/cor podem mudar) — "Gerenciar
  Status" já respeita isso na tela também.
- [x] ✅ **09/08 — Kanban/tabela checam permissão antes de mexer, não
  depois** (commit `85e6b54`). Arrastar e o controle de troca de etapa
  na ficha da OS agora conferem `orders.edit` antes de qualquer chamada
  ao banco.
- [x] ✅ **17/08 — Regra "peça não pode ser excluída" fechada de
  verdade no banco.** Migration `20260817150000`: a policy única "FOR
  ALL" de `service_order_items` (SELECT/INSERT/UPDATE/DELETE todas com
  `orders.edit`) virou 4 policies separadas — as 3 primeiras idênticas
  à antiga, a de DELETE ganhou `produto_id IS NULL` a mais. Quem tem
  `orders.edit` não consegue mais excluir peça via API direta, só
  serviço avulso.
  - **🔵 Observação registrada, não corrigida**: a mesma trava não
    cobre excluir um item de **serviço** (sem peça) de uma OS já
    encerrada — isso continua permitido via API direta, só a tela
    esconde o botão. Mesma família do item logo abaixo.
  - **🔵 Achado na revisão, pré-existente, não é regressão desta
    rodada**: uma policy SELECT antiga e mais permissiva em
    `service_order_items` (da migration inicial, nunca removida) já
    deixava qualquer autenticado do tenant ler itens de OS mesmo sem
    `orders.edit` — a leitura efetiva sempre foi mais ampla do que a
    policy nova sozinha sugere.

**🔵 Simplificação**
- [x] ✅ **09/08 — OS com status órfão não some mais do Kanban**
  (commit `85e6b54`). Ganhou uma coluna própria "Sem etapa válida" (cor
  vermelha) em vez de desaparecer silenciosamente.
- [x] ✅ **17/08 — Não é mais possível lançar item numa OS encerrada.**
  Migration `20260817150000`: gatilho `impedir_item_em_os_encerrada`
  (BEFORE INSERT em `service_order_items`, dispara antes do gatilho de
  baixa de estoque) recusa lançar qualquer item — peça ou serviço —
  numa OS já `entregue` ou `cancelado`. Achado mais amplo que o
  esperado ao investigar: nem "entregue" travava de verdade no banco
  antes, só a tela escondia o botão (`jaFoiEntregue`) — os dois casos
  ficaram cobertos juntos (`osEncerrada` em `OSDetalhe.tsx`).
- [x] ✅ **17/08 — Histórico da OS e breakdown de peças/mão de obra, os
  dois na ficha agora.** Card "Histórico da OS" mostra a timeline de
  `service_order_history` (gravada sozinha pelo gatilho
  `track_os_status_change` desde a criação do schema — data/hora,
  status anterior → novo, quem fez a mudança). O nome de quem mudou é
  resolvido à parte (`usuario_id` referencia `auth.users`, não
  `profiles`, sem FK entre as duas — busca contra a lista de todos os
  perfis, ativos ou não, pra não "esquecer" quem fez o quê depois de
  desativado).
  **`total_pecas`/`total_mao_obra` acabaram não sendo "dado gravado,
  nunca mostrado"** — conferido que nenhuma migration ou gatilho nunca
  escreveu nessas duas colunas (diferente de `service_order_history`,
  que é dado real). Decisão: em vez de ressuscitar com um gatilho novo
  de sincronia, o breakdown "Peças" / "Mão de obra" no card "Peças e
  serviços" é computado ao vivo a partir de `service_order_items` — a
  fonte real. As duas colunas continuam no schema, intencionalmente
  não usadas.
  - **✅ Corrigido em 20/08**: o card ficou sem atualizar sozinho depois de
    mudar a etapa pela ficha — `TrocarEtapaOS.tsx` já existia com seu
    `onMudou` de antes do card existir, e ninguém tinha voltado pra somar
    a invalidação de `['os-historico', id]` junto com `os-detalhe`/
    `os-itens`. Sem isso, a mudança já estava gravada pelo gatilho, mas a
    timeline só aparecia depois de recarregar a página ou trocar de aba e
    voltar (foco da janela). Ajustado em `OSDetalhe.tsx`.
- [ ] 3 cópias do fallback de status e 2 de formatação de moeda/data
  entre telas antigas (Kanban/Tabela) e novas (Detalhe/Finalizadas/
  Orçamentos).

---

## Financeiro

**🔴 Alta**
- [x] ✅ **Resolvido em 18/08 — o achado mais antigo e mais completo desta
  revisão inteira, confirmado com verificação de 7 pontos.** Caixa
  (abertura/fechamento) nunca refletia vendas do PDV nem títulos de OS
  pagos — a "conferência cega" que a tela existe pra fazer comparava a
  gaveta contra um número que ignorava quase todo o dinheiro do dia; só
  a devolução (17/08) entrava. Correção em duas decisões do Felipe,
  depois de eu perguntar diretamente (18/08): **(1)** "Só dinheiro
  físico é o Caixa" — a conferência cega continua sendo só sobre
  dinheiro físico; PIX, cartão e demais formas eletrônicas passam a
  aparecer à parte, num resumo informativo do dia (nova seção "Resumo
  do dia por forma de pagamento" em `FinanceiroCaixa.tsx`, lendo da view
  nova `vw_caixa_resumo_formas`), sem entrar na conta que se compara com
  a gaveta contada à mão. **(2)** "Na entrega da OS, tem que ter todas
  as opções de pagamento, todo detalhamento completo — isso entra pra
  contabilidade, tudo certinho" — a entrega de OS ganhou uma tela de
  captura de pagamento tão completa quanto o PDV (`EntregarOSDialog.tsx`,
  nova tabela `os_pagamentos`, suporta pagamento dividido em mais de uma
  forma), ligada nos dois lugares que entregam OS (ficha e quadro
  Kanban) — o banco agora BLOQUEIA marcar uma OS paga como entregue sem
  pagamento suficiente já registrado. **Achado no meio do caminho**: o
  PDV já deixava pagar em dinheiro com valor maior que a venda,
  esperando troco — mas o troco nunca tinha sido descontado de lugar
  nenhum; os gatilhos novos (venda e OS) descontam o troco do total em
  dinheiro antes de lançar no Caixa, senão o valor calculado ficaria
  inflado toda vez que o cliente pagasse com nota maior que a compra.
  Testado com uma transação real no banco (revertida sem deixar
  rastro) antes de entrar no ar: troco descontado corretamente,
  pagamento dividido lança só a parte em dinheiro, trava de entrega sem
  pagamento funciona, agregação por forma bate. Revisão adversarial
  encontrou e fechou mais um risco real: se a entrega falhasse bem entre
  gravar o pagamento e mudar o status (erro de rede, por exemplo), o
  pagamento já gravado não desaparecia (não tem como apagar por
  desenho), e tentar de novo lançaria um segundo pagamento em cima do
  primeiro — corrigido fazendo o diálogo sempre conferir no banco quanto
  já foi registrado antes de pedir mais.
- [x] ✅ **Resolvido em 18/08 — 🆕 achado do dia, corrigido no mesmo dia.**
  Digitar valor com separador de milhar (ex.: "1.500,00") quebrava
  silenciosamente em 4 pontos do Financeiro. A conversão de texto pra
  número trocava só a PRIMEIRA vírgula por ponto — "1.500,00" virava
  "1.500.00" (dois pontos), que não é um número válido. **Abrir o
  caixa**: o valor inválido era engolido e o caixa abria com R$0,00 de
  troco, sem nenhum aviso. **Lançar novo título financeiro**: o botão
  Salvar simplesmente não fazia nada, sem nenhuma mensagem — pro tipo de
  conta (aluguel, folha) que costuma passar de R$1.000. Corrigido com
  uma função central nova, `paraNumero()` em `lib/format.ts` (remove
  ponto de milhar antes de trocar vírgula por ponto), usada nos 4
  pontos (`FinanceiroCaixa.tsx` × 3, `TitulosPage.tsx` × 1), cada um
  agora com uma mensagem de erro explícita quando o valor não faz
  sentido — em vez do silêncio de antes. Revisão adversarial encontrou e
  fechou mais uma brecha da mesma família: valor NEGATIVO também não era
  barrado em abrir/fechar caixa (ex.: "-150,00" digitado por engano) —
  adicionada a checagem `valor < 0` nos dois pontos.
- [x] ✅ **Resolvido em 18/08 — 🆕 achado do dia, corrigido no mesmo dia.**
  Sessão de caixa já fechada podia ser alterada ou apagada depois, sem
  nenhum rastro, e qualquer devolução antiga podia ser apagada levando
  junto o lançamento de caixa que ela gerou. Três correções via migration
  (`20260817160000`, `20260817190000`): (1) a policy única de
  `caixa_sessoes` virou duas — abrir (livre) e fechar (só permite mudar
  uma sessão que ESTÁ aberta no momento, o que trava qualquer edição
  depois de fechada) — e sem policy de DELETE nenhuma, apagar sessão de
  caixa passou a ser impossível pela API; (2) `caixa_movimentos` (a
  única tabela financeira sem gatilho de auditoria) ganhou o gatilho que
  faltava; (3) a policy de apagar devolução foi restrita a devolução
  ÓRFÃ (sem nenhum item associado) — é o único caso real de rollback
  (`TrocaDevolucao.tsx`); uma devolução completa sempre tem pelo menos 1
  item, então não pode mais ser apagada por engano ou de propósito.

**🟠 Média**
- [x] ✅ **Resolvido em 21/08.** O Fluxo de Caixa classificava "Realizado"
  pelo VENCIMENTO — o arquivo avisava que esse é o erro mais comum em
  relatório de fluxo de caixa e cometia ele. Uma conta que venceu em janeiro
  e foi paga em março contava como realizada de janeiro, mês em que nenhum
  dinheiro se moveu, e sumia de março, onde o dinheiro saiu. Agora são duas
  consultas com recortes de data diferentes de propósito: Previsto filtra
  por `vencimento`, Realizado por `pago_em`. Os títulos das seções e o texto
  de apoio explicam a diferença com exemplo — senão os dois blocos parecem
  discordar um do outro.
- [x] ✅ **Resolvido em 21/08.** O formulário de título manual não
  vinculava fornecedor nem cliente, apesar das colunas existirem desde a
  criação da tabela. O campo entrou, com a lista trocando conforme a tela
  (fornecedores em Contas a Pagar, clientes em Contas a Receber), e o nome
  aparece na própria linha — sem isso o vínculo ficaria só no banco e a tela
  não responderia a pergunta que motivou o campo.
- [x] ✅ **Resolvido em 21/08 — e o problema era pior que "assimetria".**
  Quem recebesse só `finance.cashier.close` caía numa tela inutilizável:
  abria o caixa, lançava sangria, e não via uma linha do que ele mesmo
  lançou — a lista voltava vazia pela RLS, sem erro, como se o caixa não
  tivesse nada. Modo de falha silencioso, o pior tipo: a pessoa acha que não
  salvou e lança de novo. A leitura passou a aceitar qualquer uma das duas
  permissões; a recíproca continua não valendo (`finance.view` sozinha só
  lê), que é o ponto do controle. Junto, a descrição da permissão foi
  corrigida: chamava-se "Fechar o caixa" mas governa abrir, lançar E fechar
  — quem montava um perfil lendo a lista concedia achando que liberava bem
  menos. Só o texto mudou; a chave continua a mesma, porque renomeá-la
  quebraria as concessões já feitas.
- [x] ✅ **Resolvido em 18/08 (terceira leva).** Título já pago podia
  virar "cancelado" via API sem trava nenhuma, apagando o rastro do
  pagamento. A tela escondia certinho os botões errados (Cancelar só
  aparece pra título "aberto"), mas nada no banco impedia uma chamada
  direta mudar um título "pago" direto pra "cancelado" — ele sumiria do
  total "Já pago/recebido" e do Fluxo de Caixa, sem indício de que o
  dinheiro já tinha entrado. Corrigido na migration `20260818120000`,
  em duas partes. (1) Gatilho `trg_status_titulo` valida a mudança de
  status: policy de RLS não serve aqui porque USING enxerga a linha
  antiga e WITH CHECK a nova, avaliadas em separado — não dá pra
  escrever "se ANTES era pago, DEPOIS não pode ser cancelado"; gatilho
  tem OLD e NEW juntos. Permitidas exatamente as três transições que a
  tela oferece (aberto→pago, aberto→cancelado, pago→aberto); bloqueadas
  pago→cancelado e qualquer saída de "cancelado". (2) Descoberto no
  caminho: o mesmo buraco alcançava DELETE, e pior — apaga a linha
  inteira. O próprio `useTitulos.ts` já declarava a intenção contrária
  ("Cancela em vez de excluir") e nenhuma tela apaga título. As duas
  policies FOR ALL viraram INSERT + UPDATE explícitos; sem policy de
  DELETE, a RLS nega por padrão. Conferido antes de aplicar: nenhum
  gatilho do banco faz UPDATE em `titulos_financeiros`, e os dois que
  criam título (ao entregar OS e o do caixa) só fazem INSERT e rodam
  como dono — a trava não atrapalha automação interna.
  **Falta testar na tela** com um título pago de verdade: a recusa e a
  mensagem em português só aparecem com sessão logada, que a revisão
  por código não alcança.

**🔵 Simplificação**
- [ ] `FinanceiroCaixa.tsx` sem hook dedicado.
- [ ] Baixa de título sempre paga o valor total — `valor_pago` sugere
  pagamento parcial que a UI não expõe. **Conferido em 18/08, ainda
  vale.**

---

## Cadastros de Apoio

**🔴 Alta**
- [ ] Cadastro "pronto mas isolado" — nada do resto do sistema consome.
  **3 "Passos" marcados como ✅ no antigo plano de construção são, na
  prática, vitrine de CRUD sem ligação com o resto do sistema.** Estado
  por cadastro:
  - [x] ✅ **Formas de Pagamento — resolvido de vez em 18/08.** O PDV já
    consultava o cadastro de verdade desde 07/08 (migration
    `20260807060000`, commit `23292e8`). Faltavam Vendas>Pagamentos e
    Caixa, que continuavam no enum fixo antigo — os dois corrigidos em
    18/08: o Caixa agora lança venda/OS respeitando `entra_no_caixa` de
    cada forma cadastrada (ver seção Financeiro), e "Vendas > Pagamentos"
    ganhou uma seção "Detalhe por forma" que agrupa pela forma cadastrada
    específica (Cartão Crédito, Cartão Crédito - Taxa, Link de Pagamento,
    Shopee etc.), não mais só pela categoria ampla do enum que misturava
    as quatro numa linha só.
  - [ ] **Fornecedores** — não alimenta compra/entrada de estoque.
    **Conferido em 18/08, ainda vale** — não existe hoje nenhuma tela de
    compra/recebimento de mercadoria no sistema. **Nota**: diferente dos
    outros achados desta rodada, este não é um ajuste pontual — é uma
    funcionalidade inteira que nunca foi construída (fluxo de "chegou
    mercadoria do fornecedor X, dá entrada no estoque"). Fica registrado
    como pendente de escopo, não como algo pra corrigir sem conversar
    antes sobre como esse fluxo deveria funcionar na prática da loja.
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
  **Conferido em 17/08, ainda vale.**
- [x] ✅ **08/08 — "Ver detalhes" não dá mais tela branca.** A rota
  passou a existir (`/cadastros/clientes/:id`, montada em `App.tsx` do
  mesmo jeito que o drill-down de OS) e virou a **ficha do cliente**:
  dados cadastrais, o que ele já comprou, as OS dele, quanto já gastou,
  última compra e aviso de aniversário próximo. Total gasto ignora venda
  cancelada de propósito, senão devolução viraria faturamento na ficha.
  As abas de compra e de OS respeitam `sales.view` e `orders.view` — a
  ficha não conta dinheiro pra quem o RBAC diz que não vê venda.
- [x] ✅ **Rebaixado/resolvido em 17/08 — fechado pela Opção B, igual
  produtos.** `custo_estimado` de Serviços já lê de `vw_servicos`
  (custo condicional a `inventory.cost.view`, vira `null` pra quem não
  tem) e a tabela `servicos` já está com a mesma tranca de
  `REVOKE SELECT` coluna a coluna que `produtos` recebeu — mesmo quem
  chamar a API direto pedindo a tabela crua não consegue mais ler o
  custo. Vazamento fechado tanto na tela quanto no banco.
- [ ] **Foto do cliente e Galeria de Arquivos — adiado de propósito
  (08/08).** As colunas `foto_url` existem, mas o projeto **não tem
  nenhum armazenamento de arquivo configurado** (nenhum bucket, nenhuma
  policy de storage). Não é ligar o que existe, é construir uma camada
  nova, com regra de quem pode ver e apagar. Decisão do Felipe: fica
  para uma etapa própria, junto das fotos de antes/depois da OS, que
  usam o mesmo mecanismo e valem mais para a assistência.
- [x] ✅ **Resolvido em 18/08 (quinta leva) — com aviso, não com trava.**
  Cliente bloqueado continua podendo abrir OS, e isso é de propósito:
  aparelho que já está na bancada precisa ser devolvido de algum jeito, e
  recusar a abertura deixaria o aparelho sem registro nenhum. O problema
  era o silêncio — o balcão abria a OS achando que estava tudo certo e só
  descobria o bloqueio lá na frente, na hora de cobrar, com o conserto já
  feito. Agora o cliente bloqueado aparece **marcado na própria lista** de
  seleção, e ao escolhê-lo um aviso explica que a OS pode ser aberta mas a
  cobrança na entrega vai ser recusada enquanto o bloqueio existir — em
  tempo de resolver com o cliente antes de começar o reparo.
- [x] ✅ ⚠️ **Reformulado em 17/08 — a premissa mudou.** Não existe mais
  um "cadastro rápido" separado no PDV: desde 08/08 o botão de novo
  cliente do PDV abre o mesmo cadastro completo de Cadastros > Clientes
  (CPF/CNPJ, RG/IE, dois telefones, endereço — só o nome é obrigatório).
  O que sobra não é mais "furo do PDV": é uma regra de negócio
  deliberada e **igual em qualquer tela** do sistema — a própria
  migration de trava de duplicidade (`20260808150000`) registra por
  escrito que cliente sem CPF **e** sem telefone passa batido de
  propósito, porque exigir documento pra cadastrar empurraria a equipe
  a vender sem cliente nenhum, que é pior.
- [x] ⚠️ **Rebaixado em 17/08 — a etiqueta não sai sem cor, só não é a
  cor escolhida à mão.** Confirmado que "Listas do Sistema" ainda não
  tem seletor de cor (a promessa de customizar continua não cumprida),
  mas existe uma mitigação já em produção: `corDaEtiqueta()` sorteia,
  de forma sempre igual pro mesmo nome, uma cor de uma paleta fixa
  quando o catálogo não tem cor definida — toda etiqueta hoje **aparece
  colorida** de verdade (Clientes.tsx, ClienteFicha.tsx). O gap real é
  mais estreito do que "promessa quebrada": não dá pra *escolher* a cor
  de um item específico (ex.: forçar "VIP" a ser dourado), mas o
  resultado visual já é o prometido.
- [x] ⚠️ **Rebaixado em 17/08 — varredura feita, resultado misto.** Dos
  5 pontos citados como "em especial": **3 já foram ligados**
  (`condicao`/`memoria` no Estoque, via migration `20260809220000`;
  `checklist_defeito`/`acessorio_entrada`/`condicao_entrada` na OS, já
  em `NovaOS.tsx`). **2 continuam órfãos de verdade**: `localizacao` no
  Estoque ainda usa o enum fixo antigo (não o catálogo editável), e os
  catálogos `grade`/`tipo_peca` não aparecem em nenhuma tela do sistema
  — a própria migration que ligou condição/memória registrou por
  escrito que esses dois ficaram de fora "de propósito, por não serem
  necessários agora". O item que sobra é bem mais estreito do que a
  varredura ampla original temia.

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

**🆕 Achados novos da revisão completa de 18/08**
- [ ] 🟠 **"Já gastou" da Ficha do Cliente conta venda de troca em
  dobro — mesmo bug corrigido em 4 telas em 17/08, mas essa ficha
  ficou de fora.** `VendasHistorico`, `RelatorioVendas`, `Dashboard`
  (Home) e `DashboardVenda` já somam `COALESCE(valor_faturamento_real,
  total)`; a Ficha do Cliente continua somando `total` puro. Todo
  cliente que já fez uma troca aparece com "Já gastou" maior do que
  gastou de verdade — e como essa ficha é usada no balcão pra julgar
  "esse aqui é bom cliente?", o número errado tem efeito prático
  direto.
- [ ] 🟠 **Vendedor consegue gerenciar cliente mas não consegue criar
  Origem/Motivo/Tag de Cliente em Listas do Sistema.** A edição de
  QUALQUER catálogo (inclusive os de cliente) é gateada por
  `registry.products.manage`, não `registry.customers.manage` — e o
  papel Vendedor tem a segunda, não a primeira. Não é vazamento (falha
  fechada), mas é uma tela que promete "cadastro novo aparece sozinho"
  e não cumpre pra quem só administra clientes — obrigando a chamar um
  Gerente toda vez que o balcão precisar de uma origem/motivo/tag nova.

---

## Dashboards e Inteligência Empresarial

**🔴 Alta**
- [x] ✅ **Resolvido em 18/08 — 🆕 achado do dia, corrigido no mesmo dia.**
  `DashboardMetas.tsx` (o painel de premiação Bronze/Prata/Ouro/
  Diamante) contava o produto de uma troca pelo preço cheio no
  faturamento do mês. A correção de 17/08 (não contar o produto
  trocado duas vezes) tinha alcançado VendasHistorico, RelatorioVendas,
  Dashboard Home e DashboardVenda — mas não esta tela, que continuava
  somando `vendas.total` puro tanto no "Faturado no Mês" quanto no
  "Faturamento por Vendedor". Corrigido com o mesmo padrão das outras
  telas: `COALESCE(valor_faturamento_real, total)` nos dois cálculos, e
  a busca de vendas passou a trazer `valor_faturamento_real` junto.

**🟠 Média**
- [x] ✅ **Resolvido em 18/08 (terceira leva).** Devolução nunca reduzia
  o faturamento em painel nenhum. A correção de 17/08 fez a saída de
  caixa aparecer no Financeiro, mas nenhuma tela de negócio foi
  ajustada: venda devolvida no mesmo dia contava cheia em "Vendas
  Hoje"/"Caixa Hoje", na meta do mês e na premiação por vendedor, com o
  dinheiro já fora da gaveta. A causa é que o dinheiro devolvido não
  aparece em venda nenhuma — a venda original fica gravada com o valor
  cheio para sempre, e a devolução vive em outra tabela. A fórmula
  agora mora num lugar só (`src/lib/faturamento.ts`): faturamento =
  soma(COALESCE(valor_faturamento_real, total)) − soma(devolvido).
  Conferida nos quatro caminhos que troca/devolução podem tomar, cada
  um virou teste (9 novos, 27 no total): devolução pura de 100 → 0;
  troca com 20 de volta → 80; troca com 50 a mais → 150 sem desconto;
  troca de valor igual → 100. Nenhum conta em dobro. Régua de data
  igual à do Caixa: pesa no dia da devolução, não no da venda original.
  Em `DashboardMetas` o desconto volta pro vendedor da venda ORIGINAL,
  não pra quem atendeu o balcão. Telas ajustadas: `Dashboard`,
  `DashboardVenda`, `DashboardMetas`, `RelatorioVendas`.
- [x] ✅ **Resolvido em 21/08.** `IeComercial` e `IeEstoque` não
  descontavam item devolvido — as duas agregam por PRODUTO (somam
  `itens_venda`), então o desconto por período que consertou os outros
  painéis não alcançava elas. Produto devolvido seguia como vendido no
  ranking, inflando a margem de quem tem muita devolução; e no `IeEstoque`
  um produto vendido 5 e devolvido 5 parecia ter girado cinco quando girou
  zero. Novo helper `devolvidosPorProdutoNoPeriodo()` cruza
  `devolucao_itens` com a data da devolução, usando o preço da venda
  ORIGINAL (que é o que o cliente pagou). No `IeComercial` desconta os três
  de uma vez — quantidade, receita e custo; subtrair só a receita deixaria
  a margem negativa. Era: As duas
  agregam receita e margem **por produto**, somando `itens_venda`, não
  o total da venda — o desconto que resolveu os outros painéis não
  alcança elas. Um produto devolvido segue aparecendo como vendido no
  ranking de mais vendidos e na margem por produto. Descontar exige
  cruzar `devolucao_itens` (item a item, com quantidade), que é
  trabalho diferente do que foi feito agora — por isso ficou separado,
  não esquecido. Enquanto não for feito, o ranking de produto e a
  margem por produto superestimam quem tem muita devolução.
- [x] ✅ **Resolvido em 21/08 — trazendo a devolução presa à linha.** O
  rodapé do Histórico de Vendas não descontava devolução, e o desconto por
  período não servia aqui porque a tela filtra no cliente por critério
  livre. A saída foi vincular a devolução à LINHA da venda: assim ela
  acompanha qualquer filtro, o total fecha com o que está na tela, e a
  linha ganha etiqueta "Devolvida" com o valor abaixo do total — sem a
  marca visível, o rodapé descontado não bateria com a soma que a pessoa
  faz de cabeça olhando a coluna, e pareceria erro de conta. Era: `VendasHistorico` filtra no cliente
  por critérios livres (vendedor, forma de pagamento, período, texto),
  então não dá pra casar uma devolução com um filtro arbitrário — o
  desconto por período usado nos painéis não serve aqui. O caminho
  certo é marcar na própria linha da venda que ela teve devolução (e
  quanto), o que é mudança de tela, não de conta.
- [x] ⚠️ **Atualizado em 17/08 — pior num ponto, melhor em outro.**
  Conferido contra o código atual: `OS_STATUS` (a lista fixa) é uma
  lista de chaves **diferente e desatualizada** da que o sistema usa
  de verdade pra criar OS hoje — na prática, quase toda OS mostrada no
  Dashboard Home cai no rótulo cinza genérico, não só em caso de a
  loja renomear algo (o problema de exibição é mais amplo do que a
  descrição original). Por outro lado, o risco de "também erra a
  contagem dos KPIs" **diminuiu**: uma migration posterior
  (`20260809130000`) passou a proibir excluir/renomear a *chave* de um
  status de sistema no banco, e as contagens de KPI já filtram por essa
  chave protegida, não pelo rótulo — renomear um status hoje não quebra
  mais a contagem.
- [x] ✅ **Rebaixado/resolvido em 17/08 — mesma correção da Opção B.**
  O padrão de código (buscar custo sempre, esconder só na exibição)
  continua existindo nos 3 dashboards, mas deixou de importar: o banco
  já devolve `null` pra quem não tem `inventory.cost.view` (mesma
  tranca que fechou o vazamento em Estoque/Serviços). Não é mais uma
  "falha latente esperando um papel novo" — já está fechada na origem.
- [ ] IE Comercial/IE Estoque usam custo ATUAL do produto, não o custo
  no momento da venda — já virou padrão em 2+ telas, vale resolver de
  vez gravando `custo_unitario` em `itens_venda` no momento da venda.
  **Conferido em 17/08, ainda vale** — e já está documentado no próprio
  código como limitação assumida (não é falha escondida).

**🔵 Simplificação**
- [x] ⚠️ **Atualizado em 17/08 — é decisão, não acidente, mas achei uma
  inconsistência nova.** O comentário em `DashboardVenda.tsx` já
  explica que a tela é complementar de propósito ao Dashboard Home
  (visão "agora, em tempo real" vs. o card resumido) — não é
  sobreposição não percebida. **Achado novo**: as duas telas usam
  filtros ligeiramente diferentes pra "venda válida" (`status='pago'`
  vs. `status!='cancelado'`) — hoje não diverge na prática porque o PDV
  sempre grava direto como `'pago'`, mas é uma inconsistência latente
  se algum fluxo futuro deixar uma venda em rascunho/faturado.
- [ ] Agregação "vendas do período por produto" reimplementada quase
  igual em 3 telas (DashboardVenda, IeComercial, IeEstoque). **Conferido
  em 17/08, ainda vale.**
- [ ] Dashboard Home não checa erro de nenhuma das 6-7 chamadas Supabase
  — falha silenciosa mostra "0" em vez de indicar problema. **Conferido
  em 17/08, ainda vale** — vale notar que `DashboardMetas` e
  `DashboardEstoque` já corrigiram esse mesmo padrão, só o Dashboard
  Home (o alvo original do achado) ficou pra trás.
- [ ] Filtro de período em IE Comercial/IE Estoque compara string de
  data pura contra timestamp sem ajuste de fuso — pode deslocar até 3h
  o corte do dia (herdado do `RelatorioShell`, não é regressão nova).
  **Conferido em 17/08, ainda vale.**

---

## Relatórios

**🟠 Média**
- [x] ✅ **Rebaixado/resolvido em 17/08 — mesma correção da Opção B.**
  `RelatorioEstoque` continua pedindo `custo` no `select`, mas lê de
  `vw_produtos` — quem não tem `inventory.cost.view` recebe `null` de
  verdade do banco, e a tela nem chega a renderizar a coluna pra esse
  caso. Vazamento fechado.
- [x] ✅ **Resolvido em 21/08.** A rota do Relatório Financeiro exigia
  `finance.view`, e a RLS de `titulos_financeiros` aceita outras três
  permissões — `finance.view` não está entre elas. Quem tivesse só ela
  abria o relatório e via uma tela VAZIA, sem erro, porque o banco
  filtrava tudo em silêncio: o mesmo modo de falha do Caixa corrigido
  no mesmo dia, e igualmente enganoso, porque parece "não teve
  lançamento no período". `finance.view` é o crachá de ENTRAR no módulo
  e ver o caixa, e continua correto onde é usado; só não serve para
  título. O relatório passou a pedir `finance.cashflow.view`, a mesma
  do Fluxo de Caixa, que lê exatamente os mesmos dados. Conferido
  depois que as cinco telas financeiras ficaram alinhadas com o que a
  RLS de cada tabela exige.
- [x] ✅ **Resolvido em 18/08 (terceira leva).** `RelatorioOS` mostrava a
  chave crua do status (`em_reparo` → "em reparo") em vez do rótulo e da
  cor que a loja cadastra em Gerenciar Status — era `.replace()` puro,
  sem `useOsStatuses`. Na prática, se a loja renomeasse uma etapa, o
  relatório continuava exibindo o nome técnico do banco. Agora usa o
  mesmo hook do resto do sistema, e o CSV leva o rótulo também — quem
  abre a planilha não precisa traduzir "aguardando_aprovacao" de cabeça.
- [x] ✅ **Resolvido em 18/08 (terceira leva).** O rodapé de total do
  Relatório de Vendas e do Financeiro somava registros CANCELADOS,
  enquanto os indicadores logo acima os excluíam — dois números
  diferentes na mesma tela, sem explicação. Agora cancelado soma zero, e
  o rótulo do rodapé diz o critério ("Total (sem canceladas)" / "Saldo
  (sem cancelados)") em vez de deixar o leitor adivinhar.

  Sobrou uma diferença **legítima** em Vendas, e ela está explicada no
  texto de apoio da tela: o rodapé soma as linhas da tabela, e o
  indicador "Faturamento" vai um passo além, descontando também o
  dinheiro devolvido a cliente no período — que não é linha daquela
  tabela. São duas perguntas diferentes, as duas úteis.
- [x] ✅ **Resolvido em 21/08.** O indicador "Orçamento em aberto"
  dizia "Aprovado, ainda não recebido" mas somava TODA OS não
  entregue — inclusive as que nem tinham laudo e as que estavam com o
  orçamento na mão do cliente sem resposta. Quem usasse o número para
  estimar caixa futuro contava com dinheiro que ainda dependia de o
  cliente dizer sim. Novo helper `osOrcamentoAprovado()` conta só
  `aprovado` e `finalizado`; etapa extra criada pela loja não entra,
  porque só as fixas dizem com certeza que houve aprovação — errar
  para menos aqui é melhor do que prometer caixa que não vem. O
  detalhe do indicador passou a dizer de quantas OS o número veio.

**🔵 Simplificação**
- [x] ✅ **Resolvido em 20/08.** Escape de CSV não neutralizava
  `=`/`+`/`-`/`@` — risco real de CSV/Formula Injection no Excel se nome
  de cliente ou descrição de título viesse com esses caracteres (a
  fórmula roda de verdade se o Excel abrir o arquivo, não é só falta de
  formatação — item já tinha sido reavaliado pra cima em 18/08).
  Corrigido em `RelatorioShell.tsx` (função de escape usada por todos os
  relatórios que exportam CSV, inclusive Vendas e Financeiro): célula que
  começa com um desses quatro caracteres ganha um prefixo de aspas
  simples, mesma mitigação padrão do Google Sheets/Excel — exceto quando
  o conteúdo é só um número negativo formatado pelo próprio relatório
  (regex dedicada), pra não estragar saldo negativo legítimo em telas
  financeiras que usam o mesmo componente. `tsc`/`eslint`/37 testes
  limpos depois da correção.
- [ ] Nome do arquivo CSV de RelatorioEstoque sugere recorte de datas
  que não existe (a tela não filtra por período).
- [ ] Formatação de moeda pra CSV e filtro de período duplicados nos 4
  relatórios.

---

## Configurações, Permissões e Minha Empresa

**🔴 Alta**
- [x] ✅ **Resolvido em 18/08.** Não havia proteção contra o único
  administrador se autodemover ou se desativar — sem caminho de volta
  dentro do app, isso travaria o sistema pra todo mundo da loja.
  Corrigido com dois gatilhos no banco (bloqueiam tirar o papel ou
  desativar a conta do único administrador ATIVO restante da loja —
  vale tanto pra alguém se auto-rebaixar quanto pra mexer no último
  outro administrador). Testado com uma transação real revertida:
  bloqueia as duas operações quando é o último, libera as duas quando
  existe um segundo administrador ativo. Confirmado que editar
  qualquer outro campo do perfil (nome etc.) continua funcionando
  normalmente pro administrador único — só a transição pra inativo é
  travada.
- [x] ✅ **Resolvido em 18/08.** Exceções de permissão por usuário não
  geravam auditoria nem preenchiam `motivo`/`definida_por` — a
  funcionalidade mais sensível da tela de Usuários era a única sem
  rastro. Corrigido: gatilho de auditoria próprio pra `user_permissions`
  (mesmo padrão de `user_roles`/`os_pagamentos`, tenant derivado via
  `user_id` → `profiles`); `definida_por` agora é gravado sozinho a cada
  exceção criada/alterada; e a tela ganhou um campo de motivo opcional
  (balão/popover ao lado da exceção, sem exigir preencher pra não
  travar o clique rápido do checkbox). Revisão adversarial achou e
  corrigiu um bug real: o botão do motivo nunca abria o balão (um
  `preventDefault()` a mais brigava com a biblioteca de UI).
- [x] ✅ **Resolvido em 18/08 — 🆕 achado do dia, corrigido no mesmo dia.**
  Troca de perfil de usuário nunca aparecia em Logs/Auditoria, apesar de
  ser gravada. A tabela de usuários/papéis (`user_roles`) é a única das
  6 tabelas auditadas que não guarda a loja (`tenant_id`) na própria
  linha — o gatilho genérico de auditoria gravava a mudança mesmo
  assim, mas com `tenant_id` vazio, e a regra de leitura da tela de
  Logs exige bater a loja de quem está olhando ("vazio" nunca bate com
  nada). Corrigido com um gatilho de auditoria próprio pra essa tabela
  (`registrar_auditoria_user_roles`), que busca a loja em `profiles`
  (via `user_id`) em vez de tentar ler da própria linha — o sistema já
  é "um login = uma loja só", então o dado existe, só não estava na
  tabela certa. A migration também consertou o histórico já perdido:
  linha antiga com `tenant_id` vazio foi recalculada, não só as trocas
  daqui pra frente.

**🟠 Média**
- [x] ✅ **Resolvido em 21/08.** A página era liberada por
  `users.manage`, mas trocar o perfil exige `roles.manage` — e as duas
  são concedidas separadamente. Quem tivesse só a primeira via o
  seletor de perfil habilitado, escolhia, e a operação era recusada
  pelo banco depois do clique. Agora o seletor fica desabilitado, com
  uma linha dizendo qual permissão falta.

- [x] ✅ **Resolvido em 21/08 — e a nota de 20/08 evitou um estrago.**
  `definirPapel` fazia DELETE e INSERT em duas chamadas soltas, sem
  transação: uma falha no meio deixava a pessoa SEM PAPEL NENHUM, ou
  seja, sem acesso ao sistema, em silêncio — e quem estava trocando via
  a mensagem de erro e supunha que "não mudou nada", quando tinha
  mudado para o pior estado possível.

  A correção óbvia seria um `upsert`. Foi exatamente o que a nota
  deixada na revisão de 20/08 avisou para NÃO fazer: o gatilho que
  impede tirar o papel do último administrador ativo é um `BEFORE
  DELETE` escrito em cima desse passo, e o upsert eliminaria o DELETE
  junto com a proteção — silenciosamente. A função nova
  (`trocar_papel_do_usuario`, migration `20260821170000`) mantém o
  DELETE e só envolve o par numa transação do banco. De quebra confere
  tenant e exige `roles.manage` com mensagem em português.

  **Vale como exemplo de por que anotar o motivo, e não só o achado:**
  sem aquela nota, a correção "certa" teria desligado uma trava de
  segurança sem ninguém perceber.

- [ ] `MinhaEmpresa` edita cor/logo, mas nada no app consome esses
  campos ainda (nem branding, nem um laudo em PDF, que não existe).
  ✅ *confirmado.*
- [x] ✅ **Resolvido em 18/08 (quinta leva).** A tela de Logs/Auditoria
  prometia "Quem mexeu em quê, e quando" e nunca entregava o *quem* —
  `usuario_id` vinha na consulta e simplesmente não era usado. Agora tem
  coluna "Quem", com o nome vindo de `profiles` (busca à parte e junção
  por id no cliente, porque não há FK declarada — mesmo padrão dos
  dashboards). Registro sem usuário aparece como **"Sistema"**, que é o
  caso legítimo de gatilho disparado por rotina do próprio banco, e não
  célula vazia dando impressão de dado faltando; usuário apagado aparece
  como "Usuário removido".
- [x] ✅ **Resolvido em 18/08 (quinta leva).** Trocar a logo exigia
  `settings.edit` enquanto a tela Minha Empresa exige `company.edit` —
  permissões de módulos diferentes. Só o Administrador tem as duas hoje,
  mas dá pra conceder separado por exceção de usuário, e aí o campo de
  logo apareceria habilitado e o envio falharia: botão habilitado que não
  funciona é pior do que botão escondido, porque quem está usando não tem
  como saber que o problema é de acesso. O bucket passou a exigir
  `company.edit` (migration `20260818140000`) — a logo é dado da empresa,
  mora em `tenants.logo_url` ao lado de nome e CNPJ, não é configuração
  de sistema. A leitura continua pública, sem mudança.
- [x] ✅ **🆕 Achado e resolvido em 20/08 (revisão de integração pós-fusão).**
  `ConfigLogs.tsx` não reconhecia as duas tabelas mais novas a ganhar
  gatilho de auditoria no mesmo dia 18/08: `os_pagamentos` (migration
  `20260818100000`) e `user_permissions` (migration `20260818110000`).
  A tela que adicionou a coluna "Quem" (commit `a85ac98`, mais tarde no
  mesmo dia) mexeu em `TABELA_LABEL`/`TABELAS` sem saber dessas duas
  tabelas novas — sintoma de duas frentes trabalhando em partes
  relacionadas (gatilho de auditoria vs. tela de auditoria) sem se verem.
  Na prática: linhas de `os_pagamentos`/`user_permissions` apareciam em
  "Tudo" mas com o nome cru da tabela na coluna Registro, e sem botão de
  filtro próprio. Corrigido adicionando as duas ao mapa (`'Pagamento de
  OS'` e `'Exceção de permissão'`) — os botões de filtro nascem sozinhos
  porque `TABELAS` deriva de `Object.keys(TABELA_LABEL)`. `tsc` e
  `eslint` limpos.

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
- [ ] ⚠️ **Atualizado em 18/08 — cresceu de 1 pra 4.** `OSDetalhe.tsx`
  não é mais a única página fora do `registry.tsx` central — hoje são
  4: `OSDetalhe` (/os/:id), `ClienteFicha` (/cadastros/clientes/:id,
  08/08), `EstoqueDetalhe` (/estoque/:id) e `ComprovanteVenda`
  (/vendas/:id/comprovante, 10/08), todas montadas direto em
  `App.tsx`. Não é regressão nem bug — cada uma tem sua permissão
  certa e não há conflito de rota — mas são 2 mecanismos de rota em
  paralelo em 4 lugares agora, não 1. Vale decidir um padrão único
  antes que apareça uma quinta.
- [ ] ⚠️ **Atualizado em 18/08 — são 5 lugares, não 3.** Lógica de
  "permissão decide visibilidade" reimplementada em `Sidebar.tsx`,
  `AppHeader.tsx` (duas vezes — atalhos e busca global), `AbasDaSecao.tsx`
  (09/08) e `CadastrosHub.tsx` — `RequirePermission.tsx` na real é outra
  coisa (guarda de rota, não filtro de lista), o item original misturava
  os dois. Nenhuma das 5 cópias diverge da regra (conferido uma a uma),
  então não há inconsistência de acesso — só dívida técnica que cresceu
  em vez de ser consolidada.
- [x] ✅ **Resolvido em 21/08.** O enum do banco tem 7 papéis e o front
  conhece 5. Não há caminho pela interface que produza um dos 2 órfãos
  hoje, mas a leitura precisava aguentar um: dado restaurado de backup,
  importação, linha mexida direto no banco. Sem tratamento o rótulo saía
  **em branco** — o que na tela parece "esta pessoa não tem perfil",
  exatamente o oposto de "tem um perfil que eu não reconheço". A
  primeira leitura convida a atribuir um papel; a segunda, a investigar.
  Agora existe `rotuloDoPapel()`, que mostra "Perfil desconhecido
  (valor)" com o valor à vista para quem for apurar.


**🔵 Simplificação**
- [x] ✅ **Resolvido em 18/08 pela faxina de documentos.** O antigo plano
  de construção descrevia o RBAC como "admin/atendente/técnico/vendedor"
  (4 papéis) quando o código já usava 5 papéis renomeados. Como aquele
  documento foi apagado, a descrição desatualizada saiu junto — não
  existe mais texto no projeto afirmando isso.
- [x] ✅ **Resolvido em 18/08 — decidido pelo Felipe: o nome é "RPG
  System.IO".** O achado estava anotado como "cabeçalho das migrations",
  mas na verdade eram duas grafias brigando em todo o projeto: a tela
  dizia "RPG System.IO" (título da aba, tela de login, barra lateral) e a
  documentação inteira dizia "RP System.IO". Perguntado diretamente, o
  Felipe confirmou **RPG System.IO** — as iniciais de **R**io **P**reto
  **G**ames, que ainda caem como trocadilho com RPG de videogame. Ou
  seja: o código estava certo o tempo todo e a documentação é que tinha
  se desencontrado. A documentação foi acertada para bater com a tela.
  Migrations antigas não foram reescritas (é histórico); as novas já
  nascem com o nome certo.

---

## Segurança e RLS (transversal — banco de dados)

**🔴 Alta**
- [x] ✅ **Resolvido em 18/08 — ver detalhe na seção Estoque.**
  `ajustar_estoque_produto` (RPC, SECURITY DEFINER) agora exige tenant
  igual e `inventory.adjust` antes de qualquer efeito.
- [x] ✅ **Resolvido em 18/08.** `proximo_numero_documento` (RPC) agora
  exige que `_tenant` recebido seja o do próprio usuário chamando —
  confirmado que os 3 gatilhos internos que usam essa função (OS,
  venda, devolução) sempre passavam o tenant certo, então a trava não
  quebra nenhum fluxo real.

**🟠 Média**
- [x] ✅ **Resolvido em 21/08 — mas com correção diferente da margem, e
  o motivo importa.** `taxa_percent` e `juros_percent` tinham o mesmo
  risco de overflow que estourou em `margem_percent`: `DECIMAL(5,2)`,
  máximo 999,99, e acima disso um "numeric field overflow" cru. Só que
  margem é CALCULADA (lá o certo foi limitar o resultado) e estes são
  DIGITADOS. Alargar a coluna resolveria o sintoma errado — não existe
  taxa de maquininha de 5.000%, e aceitar esse número calado é pior do
  que recusar: ele entraria no cálculo de toda venda parcelada naquela
  forma de pagamento e comeria a margem sem ninguém entender por quê.
  CHECK de 0 a 100 nas três colunas (migration `20260821160000`), com
  nome descritivo porque é o nome que aparece no erro. Aplicou sem
  falhar, o que confirma que nenhum dado existente violava.
- [x] ✅ **Resolvido em 18/08 (quinta leva) — e virou ferramenta, não
  remendo.** Colunas novas nas 4 tabelas trancadas nasciam sem permissão
  de leitura na tabela crua. A trava de custo funciona revogando o SELECT
  da tabela e reconcedendo coluna a coluna, o que congela a lista de
  colunas no instante em que a migration roda. Conferido na API de
  produção antes de corrigir: **7 colunas de `produtos` estavam nesse
  estado** (`grupo_produto_id`, `marca_id`, `modelo_id`, `cor_id`,
  `condicao_id`, `memoria_id`, `observacoes`).

  Não quebrava nada por sorte de desenho — toda leitura de produto passa
  pela view, que roda com privilégio de dono. Mas era armadilha cara de
  diagnosticar: o erro seria "permission denied" e ninguém associaria à
  trava de custo, porque todo mundo procura RLS primeiro, não GRANT de
  coluna.

  Em vez de mais um bloco de uso único, a lógica virou **função
  reaplicável** (migration `20260818130000`):

  ```sql
  SELECT public.aplicar_trava_de_custo();
  ```

  Ela descobre as colunas do catálogo em vez de usar lista digitada, então
  coluna nova é coberta sozinha — basta chamar a função no fim da migration
  que criou a coluna. A regra entrou no `CLAUDE.md`, junto das outras de
  custo protegido. Testado no banco: as 7 foram liberadas **e** as 6
  colunas de custo continuam trancadas nas 4 tabelas.
- [ ] ⚠️ **Atualizado em 18/08 — confirmado, e os dois casos divergiram.**
  `vendas.comissao_calculada` é confirmada órfã de verdade: nenhuma
  tela lê, nenhum código de venda grava, nenhum gatilho calcula — fica
  parada em 0 pra sempre, **sem nenhuma decisão documentada** em lugar
  nenhum. Se alguém do negócio assumir que o sistema já calcula
  comissão automaticamente por causa do nome da coluna, essa
  expectativa está errada. Já `service_orders.total_pecas`/
  `total_mao_obra` tiveram destino diferente em 17/08: confirmado que
  também nunca foram escritas por nada, mas em vez de resgatar as
  colunas, o breakdown Peças/Mão de obra na ficha da OS passou a
  calcular ao vivo direto de `service_order_items` — decisão registrada
  na seção de Ordens de Serviço.

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
- [ ] ⚠️ **Confirmado com evidência de tela em 18/08.** `produtos.categoria`
  (enum fixo: celular/acessório/peça/serviço) e `catalogos` tipo
  `grupo_produto` (catálogo flexível: Console/Jogo/Controle/Celular/...)
  são dois sistemas paralelos de categorização, gravados em colunas
  diferentes, sem nenhuma trava de consistência entre eles — dá pra um
  produto ter Grupo="Controle" e Categoria="celular" ao mesmo tempo,
  sem erro. Os dois continuam alimentando telas diferentes hoje
  (`categoria`: Estoque, RelatorioEstoque, IE, DashboardEstoque;
  `grupo_produto_id`: Estoque e o filtro novo do PDV, 17/08) — decidir
  migrar um pro outro ou documentar por que coexistem.
- [x] ✅ **Resolvido em 21/08.** O status da OS era texto livre sem
  nenhuma conferência contra a lista de etapas cadastradas. O Kanban
  tinha rede visual, mas dois lugares gravavam o texto cru sem olhar
  para ela: `automacao_eventos` (a fila do n8n — justamente onde
  ninguém daqui vê o erro acontecer) e `service_order_history`.
  Gatilho `trg_status_da_os` (migration `20260821150000`) confere
  contra `os_status_config` do MESMO tenant, e a mensagem lista as
  etapas válidas da loja — erro de digitação em integração é o caso
  mais provável, e quem lê o log quer ver a lista na hora. Testado,
  4 de 4, incluindo o caso de editar outro campo sem mexer no status
  (que não pode pagar o custo da checagem).
- [ ] 🔵 **18/08 — O tipo ENUM `os_status` continua existindo no banco
  mesmo sem nenhuma coluna usar mais.** Quando o status da OS virou
  texto livre, ninguém apagou o tipo antigo — ele continua cadastrado
  com os 8 valores de antes e aparece no `types.ts` gerado, podendo
  confundir quem olhar o tipo no futuro e achar que o status da OS
  ainda é uma lista fechada de 8 valores.

**🔵 Simplificação**
- [x] ✅ **Resolvido em 21/08 — o arquivo foi apagado.** `untyped.ts` descrevia um estado do banco que não existia mais e, pior, seguia crescendo: de 6 para 8 arquivos, incluindo 4 de Financeiro, onde erro de nome de coluna só apareceria em runtime com dinheiro na frente. As 12 tabelas que ela cobria já estavam todas tipadas há semanas — só faltava o último passo, que as próprias instruções dentro do arquivo descreviam. Ao remover, a checagem revelou um erro real que estava escondido: em `FinanceiroCaixa` o tipo do movimento era texto livre quando o banco aceita 7 valores específicos.
---

## Backlog de simplificação transversal

Não quebram nada hoje — limpar enquanto a mão está na área correspondente:

- [x] ✅ **Feito em 21/08.** `untyped.ts` apagado; os 8 arquivos voltaram ao client tipado.
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

## A verificação de tipo não verificava nada (achado em 21/08)

Vale como item próprio porque afeta a confiança em tudo que foi dito antes.

- [x] ✅ **Resolvido em 21/08.** `npx tsc --noEmit` — o comando usado como
  prova de "está limpo" em dezenas de commits — **compilava zero arquivos**.
  O `tsconfig.json` da raiz tem `"files": []` e delega por `references`, e
  `--noEmit` ignora referências: ele terminava em silêncio, e o silêncio era
  lido como aprovação quando era indiferença.

  Descoberto por acaso: o `vite build` reclamou de uma variável declarada
  duas vezes logo depois de o `tsc` dizer que estava tudo certo. Provado
  injetando `const x: number = "texto"` num arquivo — `tsc --noEmit` não
  disse nada, `tsc --build` acusou na hora.

  Quem vinha segurando erro de tipo era o esbuild dentro do `vite build`,
  que reclama do que é grave mas não faz checagem completa. Rodada a
  verificação de verdade no projeto inteiro: **zero erros** — o código estava
  limpo mesmo, mas por sorte, não por processo.

  Fechado com `npm run typecheck` (`tsc --build --force`) e `npm run check`
  (typecheck + testes + build), e a regra registrada no `CLAUDE.md` com o
  teste que prova.

---

## Achados dos testes com massa real (21/08)

Primeira vez que o sistema foi exercitado com volume: 10 clientes, 10
produtos, 10 vendas e 10 OS espalhadas por 7 etapas, mais seis tentativas
deliberadas de fazer o que o sistema deveria proibir.

**O que passou** (verificado no banco, não presumido): estoque descontou certo
nos 10 produtos, conferido um a um contra o esperado; 20 movimentos gravados
com origem rastreável até o número da venda; auditoria registrou 40 eventos;
numeração sequencial funcionou; e **5 de 6 travas recusaram o que deviam**,
com mensagem em português — venda para cliente bloqueado, pular etapa para
aprovado, entregar OS sem pagamento, cancelar título já pago, e vender mais do
que tem em estoque.

- [x] ✅ **Resolvido em 21/08 — OS que nasce "entregue" pulava as duas travas
  de uma vez.** Criando a OS já com `status = 'entregue'` num único INSERT,
  `conferir_pagamento_ao_entregar` e `gerar_titulo_ao_entregar_os` eram os
  dois pulados, porque ambos eram `BEFORE UPDATE`. Testado: nasceu uma OS
  "entregue" de R$ 999 sem um centavo registrado, e título gerado = 0. Um
  atendimento inteiro, com valor, sumindo do controle financeiro sem rastro.
  A tela nunca faz isso, mas **a migração do sistema antigo e as automações do
  n8n fazem exatamente isso** — OS já concluída entra com status final, e seria
  o pior momento possível para descobrir que nenhuma gerou título. Corrigido na
  migration `20260821110000`: as duas funções valem para INSERT também.
  Retestado nos quatro cenários, incluindo os que não podiam quebrar (garantia
  nascendo entregue, OS normal em análise, fluxo completo gerando 1 título).

**🔴 Alta**

- [x] ✅ **Resolvido em 21/08 — o Caixa abre sozinho na primeira venda.**
  Era: sem caixa aberto, o dinheiro do dia inteiro ficava fora da
  conferência, e ninguém avisava. Os gatilhos que lançam venda e OS no Caixa
  procuram uma sessão com status "aberto"; não achando, saem em silêncio
  (`CONTINUE` em `registrar_pagamentos_venda_no_caixa`, `RETURN NEW` em
  `registrar_pagamento_os_no_caixa`). **Comprovado no teste:** as 10 vendas
  somaram R$ 22.265,40 e o Caixa registrou **zero** movimentos, porque não
  havia sessão aberta. Nada na tela do PDV indica isso.

  Na prática da loja: quem abrir a loja e esquecer de abrir o caixa vende o
  dia todo normalmente, e no fim do dia a conferência compara a gaveta cheia
  contra um sistema que diz que não entrou nada. O dinheiro existe, a venda
  está registrada — só a ponte entre os dois não foi feita, e não dá pra
  reconstruir depois sem trabalho manual.

  **Decisão do Felipe: opção (b), abrir sozinho** — resolve sem depender de
  ninguém lembrar, e o erro acontece justamente no dia corrido em que ninguém
  lê aviso. Implementado na migration `20260821120000`: a função
  `garantir_caixa_aberto` devolve a sessão aberta, criando uma se não houver.
  A automática nasce com valor de abertura **zero** (ninguém contou a gaveta) e
  marcada em `observacoes`; a tela do Caixa mostra isso em destaque, porque
  quem fecha precisa saber — senão vai perseguir uma "sobra" que é só o fundo
  de troco que já estava na gaveta. Concorrência resolvida pelo índice parcial
  que já existia: duas vendas simultâneas, a segunda relê a sessão vencedora em
  vez de derrubar a venda.

  **Armadilha evitada no caminho, que vale registrar:** os dois gatilhos de
  Caixa tinham sido reescritos em 20/08 para corrigir duplicidade (troco, forma
  que não entra no caixa, sessão fechada imutável, recálculo). A primeira versão
  desta migration ia sobrescrevê-los com uma versão simplificada — teria
  desfeito aquela correção inteira em silêncio. Refeita copiando as funções de
  20/08 idênticas e trocando **só** o trecho que desistia. Ao mexer em função de
  banco, conferir sempre qual é a versão mais recente: `CREATE OR REPLACE` não
  avisa que você está regredindo.

**🔵 Observação de cadastro**

- [ ] 🆕 **21/08 — A etapa de OS "tercerizada" está escrita errado** (o certo é
  "terceirizada"). Não está no código: é item cadastrado pela loja em
  Gerenciar Status, então corrige-se pela própria tela, sem migration. Fica
  anotado porque aparece no Kanban e em relatório, à vista do cliente.

---

## Conferência do roteiro de teste por código, e 3 bugs achados (22/08)

Ninguém conseguiu logar no sistema pra percorrer o `ROTEIRO-DE-TESTE.md` na
tela (login ainda não é automatizável), então os 56 passos foram conferidos
por **14 agentes lendo o código-fonte e as migrations do banco de verdade**
— cada um cuidando de um pedaço do roteiro — e cada resultado passou por uma
**segunda checagem independente, tentando ativamente refutar o primeiro**
(mesmo método da revisão de 18/08). Antes de começar, confirmei que todas as
68 migrations locais estavam mesmo aplicadas 1:1 no banco de produção
(`supabase migration list --linked`), então "achei no código" aqui significa
"está rodando de verdade".

**Resultado: 46 dos 56 passos passam exatamente como prometido, nenhum
achado é o sistema fazendo o oposto do prometido.** 7 passos (3, 6, 17, 25,
29, 30, 37) tiveram ressalva — anotada no próprio roteiro, no passo certo — e
3 (39, 42, 56) têm a parte de código confirmada mas só fecham de verdade
clicando (rede cair, cor renderizada, CSV abrindo no Excel). Isso não
substitui o Felipe passar pelo roteiro na tela — só reduz onde é mais
provável achar problema.

**🔴 Alta**

- [x] ✅ **Resolvido em 22/08 — Reabrir e reentregar uma OS duplicava o
  título no Financeiro.** A migration de 21/08 que passou
  `gerar_titulo_ao_entregar_os` a valer também para OS que já nasce entregue
  (`20260821110000`) reescreveu a função e, sem querer, tirou a checagem de
  idempotência que a versão original tinha (`IF NOT EXISTS ... WHERE os_id =
  NEW.id`). Consequência: OS entregue → reaberta (o próprio roteiro, passo
  29, já previa isso e diz que "a cobrança CONTINUA lá") → entregue de novo
  = **segundo título em Contas a Receber**, cobrando o cliente duas vezes
  pelo mesmo conserto. Corrigido na migration `20260822100000`, devolvendo a
  checagem.

- [x] ✅ **Resolvido em 22/08 — OS cancelada não devolvia a peça pro
  estoque.** `baixar_estoque_os()` desconta estoque quando uma peça é
  lançada numa OS, mas nunca existiu o gatilho inverso — a trava de 21/08 que
  congela valor/itens de OS cancelada (`20260821150000`, ver seção Ordens de
  Serviço) não devolve a peça. Era o mesmo buraco que existia em vendas antes
  da correção `20260807040000` (`estorna_estoque_venda_cancelada`), só que
  nunca replicado pro lado da Assistência. Peça lançada numa OS cancelada
  (cliente desistiu, orçamento não aprovado) sumia da prateleira digital pra
  sempre. Corrigido na migration `20260822110000`, espelhando exatamente a
  lógica de vendas — cancelar a OS devolve a quantidade e grava a auditoria
  em Movimentações ("Estorno de peça de OS cancelada").

- [x] ✅ **Resolvido em 22/08 — cliente bloqueado tinha a OS entregue e
  cobrada normalmente, apesar da própria tela prometer o contrário.** Achado
  fora do escopo original do passo 25 (que testa só a abertura da OS):
  `NovaOS.tsx` mostra, pra dono de aparelho bloqueado, o aviso "*A OS pode
  ser aberta normalmente [...] Mas o sistema vai **recusar a cobrança na
  entrega** enquanto o bloqueio existir*" — só que nem
  `conferir_pagamento_ao_entregar_os` nem `gerar_titulo_ao_entregar_os`
  conferiam `clientes.liberado_venda`. A tela prometia uma trava que o banco
  nunca teve — mesma classe do achado de 08/08 sobre venda bloqueada
  (`trg_venda_cliente_bloqueado`, migration `20260808160000`), só que esse
  caminho específico (entrega de OS) tinha ficado de fora daquela correção.
  Corrigido na migration `20260822120000`: `conferir_pagamento_ao_entregar_os`
  agora recusa entregar/cobrar OS paga de cliente bloqueado, com a mesma
  mensagem de recusa que a venda já usa. Escopo: só OS tipo "paga" com
  orçamento > 0 (garantia/cortesia não cobram nada).

**🟢 Baixa**

- [x] ✅ **Resolvido em 22/08 — aviso de "estoque insuficiente" inconsistente
  dentro do PDV.** Clicar no produto pra adicionar ao carrinho mostra "Apenas
  X unidades disponíveis"; clicar no **+** de uma linha já dentro do carrinho
  mostrava só "Estoque insuficiente", sem dizer quanto tem. `PDV.tsx`,
  função `updateQuantity` — agora avisa a mesma quantidade nos dois
  caminhos.

**🔵 Decisão do Felipe**

- [x] ✅ **Resolvido em 22/08 — nenhum aviso de sucesso do sistema era
  verde.** O roteiro descreve dezenas de vezes um "aviso verde" para
  confirmação (`Produto cadastrado!`, `Cliente cadastrado!`, `Venda
  finalizada!` etc.), mas o componente de aviso (`src/components/ui/toast.tsx`)
  só tinha duas cores: cinza neutro ("default") e vermelho de erro
  ("destructive") — verde de sucesso não existia em nenhuma tela, não era
  um caso isolado. Felipe decidiu criar a cor. Feito: terceira variante
  `success` (verde) no componente, aplicada em todos os avisos que
  confirmam ação concluída com sucesso — cadastro, edição, exclusão,
  lançamento, entrega, venda, devolução, etc. — em 25 arquivos, um por um,
  deixando intactos os avisos de erro (vermelho) e os avisos neutros que
  não confirmam conclusão (ex.: "logo enviada, falta clicar em Salvar" e
  "importação com falha parcial" continuam cinza de propósito, porque a
  ação ainda não terminou ou terminou só em parte). `npm run check` limpo
  depois da mudança.

**Sem ação — nuance, não bug:**

- Passo 43 (devolver mais do que foi vendido): a trava do banco existe e
  recusa com a frase certa, mas a tela já corta a quantidade digitada antes
  de enviar, então a frase quase nunca chega a aparecer clicando — proteção
  dobrada (tela + banco), não falha. Nota deixada no próprio passo do
  roteiro.
- Passo 37 (Fluxo de Caixa): o comportamento sempre esteve certo; só o texto
  do passo, escrito de manhã de 21/08, ficou com os rótulos antigos depois
  que o passo 47 (Bloco 11, tarde do mesmo dia) os atualizou. Corrigido o
  texto do próprio `ROTEIRO-DE-TESTE.md`, sem mudança de código.

---

## Requisitos do projeto original que se perderam (resgatados em 21/08)

Até 21/08 o `README.md` guardava, sem ninguém notar, o **prompt de IA
original** que gerou a primeira versão do sistema — 540 linhas escritas para
um produto chamado "OkCells Pro". Boa parte daquilo não descreve mais este
projeto (falava em Next.js, Lovable Cloud e um SaaS vendido por assinatura de
R$49 a R$149/mês; o sisteminha é Vite e é sistema interno de uma loja só), e
por isso o README foi reescrito.

Mas o documento guardava **requisitos que nunca foram implementados e nunca
tinham entrado neste plano** — conferido item a item: zero ocorrência no
código e zero menção aqui. Entram agora, para a decisão de fazer ou descartar
ser consciente, em vez de por esquecimento.

**🟠 Média**

- [ ] 🆕 **21/08 — Termo de aceite assinado pelo cliente não existe.** O
  projeto original previa uma tabela própria com `os_id`, `cliente_assinou`,
  `data_assinatura`, `ip`, `user_agent` e `hash_documento` — ou seja,
  assinatura digital do orçamento com rastro de quem aceitou, de onde e
  quando. Hoje não existe nada disso: a aprovação de orçamento é registrada
  como uma mudança de etapa feita por um funcionário, sem nenhuma
  confirmação do lado do cliente. Para uma assistência técnica isso é
  proteção real — é o que responde "o senhor autorizou este reparo" quando
  o cliente contesta o valor na hora de retirar. Vale decidir se entra.
- [ ] 🆕 **21/08 — Nota fiscal (NFC-e) não existe em lugar nenhum.** Zero
  ocorrência no código e no banco. O prompt original tratava emissão fiscal
  como parte do produto. Como a loja hoje emite por fora, isso pode estar
  certo — mas precisa ser **decisão registrada**, não lacuna silenciosa: no
  dia em que o sisteminha virar o sistema principal, alguém vai perguntar
  por onde sai a nota.

**🔵 Simplificação / futuro**

- [ ] 🆕 **21/08 — PDV offline-first nunca foi feito.** O prompt exigia que o
  PDV funcionasse sem internet, com sincronização automática depois. Hoje
  qualquer queda de conexão para a venda no balcão. É trabalho grande e
  provavelmente não vale agora (a loja tem internet estável), mas fica
  registrado: se um dia a operação crescer ou abrir segunda unidade, isto
  volta a importar.
- [ ] 🆕 **21/08 — Outros itens do prompt original, conferir se ainda fazem
  sentido:** mobile-first de verdade no PDV e na OS (hoje o layout é
  responsivo, mas nunca foi testado como ferramenta principal de celular),
  atalhos de teclado padronizados, onboarding com dados de demonstração, e
  as metas de desempenho que ninguém mediu ("listas abaixo de 500ms com 10
  mil registros", "PDV do código de barras ao fechamento em menos de 2
  segundos").

---

## O que esta revisão não cobriu

Vale lembrar antes de assumir que "não foi achado" significa "não existe":

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
- **Atualização de 18/08**: rodei uma revisão completa nova, um agente
  por área (as 11 do documento inteiro), cada um lendo o código de
  verdade contra o que o plano já registrava — e verificação
  adversarial (tentativa ativa de refutar) em todo achado novo marcado
  crítico. Os 7 achados críticos novos desta rodada foram confirmados
  um a um. Isso cobre a lacuna acima pras 6 áreas que não tinham tido
  2ª leitura ainda — mas a mesma nota de honestidade vale: "não foi
  achado" continua não sendo o mesmo que "não existe".

---

## Ordem sugerida pra continuar (atualizada em 18/08)

Os 6 achados críticos novos da revisão completa de 18/08 (a leva espalhada
por Financeiro, PDV, Estoque, Configurações, Dashboards e OS) **foram todos
corrigidos no mesmo dia**, na ordem de gravidade combinada com o Felipe, cada
um com migration própria (quando mexeu em banco), verificação de
tsc/eslint/build, e revisão adversarial por um segundo processo antes do
commit:

1. ✅ **Financeiro** — os 2 itens críticos novos (valor com separador de
   milhar quebrando em silêncio; sessão de caixa fechada alterável/apagável
   sem rastro, incluindo a mesma brecha em devolução antiga). O item mais
   antigo (Caixa não refletir venda/OS) segue em aberto — não fazia parte
   do escopo de hoje, é uma mudança maior.
2. ✅ **PDV** — botão de pagamento rápido não apaga mais pagamento já
   lançado na mesma venda.
3. ✅ **Estoque** — salvar a ficha do produto não zera mais o custo real de
   quem não tem permissão de ver custo.
4. ✅ **Configurações** — troca de perfil de usuário agora aparece em
   Logs/Auditoria (inclusive o histórico já perdido foi recuperado).
5. ✅ **Dashboards** — `DashboardMetas` não conta mais produto de troca
   pelo valor cheio no painel de premiação.
6. ✅ **OS** — o relógio de "Aguardando Retirada" não reseta mais com
   edição cosmética.

**Segunda leva, também resolvida em 18/08** — depois de fechar os 6 acima, uma
varredura pelos 🔴 restantes (mais antigos, de 07-08/08, nunca corrigidos até
então) achou mais 5 pontos abertos. Todos corrigidos no mesmo dia, mesma
disciplina (migration própria, tsc/eslint/build, revisão adversarial):

1. ✅ **O item mais antigo do Financeiro** — Caixa agora reflete venda do
   PDV e OS entregue e paga (só a parte em dinheiro físico, por decisão do
   Felipe — ver o item na seção Financeiro pra todo o detalhe).
2. ✅ **`ajustar_estoque_produto`/`proximo_numero_documento`** — as duas
   funções do banco que qualquer autenticado conseguia chamar direto pela
   API, ignorando tela e loja, agora conferem tenant e permissão de
   verdade.
3. ✅ **Proteção do último administrador** — não dá mais pra tirar o papel
   ou desativar a única conta de administrador ativa de uma loja.
4. ✅ **Auditoria de exceção de permissão** — a tabela mais sensível de
   Configurações sem rastro agora tem, e a tela ganhou campo de motivo.
5. ✅ **Vendas > Pagamentos** — "Detalhe por forma" agrupa pela forma
   cadastrada específica, não mais só pela categoria ampla do enum.

**Terceira leva, em 18/08 — "onde o sistema mente sobre dinheiro":**

Retomada depois de conferir o estado real do projeto (56 migrations
aplicadas e batendo com o banco, tipos/testes/build limpos, trava de custo
de pé nas 4 tabelas, nada solto fora do GitHub). Dois itens fechados, cada
um com migration ou teste próprio:

1. ✅ **Título já pago não pode mais ser cancelado nem apagado** — e o
   buraco era maior do que o registrado: o DELETE também estava aberto.
2. ✅ **Devolução passou a reduzir o faturamento** em Dashboard,
   DashboardVenda, DashboardMetas e RelatorioVendas, com a fórmula num
   arquivo só e os quatro cenários de troca/devolução virando teste.

Corrigir o item 2 revelou dois pontos novos, registrados acima em vez de
ficarem no ar: `IeComercial`/`IeEstoque` (receita por produto) e o rodapé
do `VendasHistorico` continuam sem descontar devolução, cada um por um
motivo técnico diferente.

Na sequência, os dois itens 🟠 da assistência:

3. ✅ **Reabrir OS entregue agora avisa** o que continua cobrado — e o
   buraco era em dois caminhos, não um: o Kanban tinha o mesmo problema
   do seletor da ficha.
4. ✅ **OS cancelada trava o valor do orçamento**, igual à seção de peças
   que já travava.

Duas coisas fora do código foram resolvidas no mesmo dia:

5. ✅ **O nome do sistema.** Abrindo o sistema no navegador apareceu uma
   divergência de marca: a tela dizia "RPG System.IO" e a documentação
   inteira dizia "RP System.IO". Perguntado, o Felipe confirmou **RPG
   System.IO** — o código estava certo, a documentação é que tinha se
   desencontrado. Documentação acertada; migrations antigas ficam como
   estão (histórico).
6. ✅ **Cinco documentos de planejamento viraram um.** Decisão do Felipe:
   *"apaga os antigos e deixa somente o mais atualizado"*. Este documento
   passou a se chamar `PLANO-DE-ACAO.md` — que é como o Felipe se refere
   a ele — e os outros quatro saíram, depois de conferido item a item que
   nada vivo se perdia. Detalhe no topo deste arquivo.

**Quarta leva, ainda em 18/08 — "telas que mostram o contrário do que
aconteceu":**

7. ✅ **Saída de estoque parava de aparecer como entrada.** Eram duas
   telas (Movimentações e a ficha do produto) e dois bugs — o segundo, o
   contador de entradas inflado, ninguém tinha anotado.
8. ✅ **Relatório de OS passou a mostrar o rótulo da etapa**, não a chave
   crua do banco — inclusive no CSV.
9. ✅ **Rodapé de Vendas e Financeiro parou de somar linha cancelada**, e
   o rótulo agora diz o critério.

**Quinta leva, ainda em 18/08 — "armadilhas e rastro":**

10. ✅ **A trava de custo virou função reaplicável.** 7 colunas de
    `produtos` estavam sem permissão de leitura na tabela crua; agora
    qualquer migration que criar coluna nessas 4 tabelas termina com uma
    chamada e a trava se reajusta sozinha.
11. ✅ **Logs/Auditoria mostra QUEM fez** — a metade da promessa que a
    tela nunca tinha entregue.
12. ✅ **A logo segue a permissão de Minha Empresa**, não a de
    Configurações.
13. ✅ **Cliente bloqueado avisa na Nova OS** — sem travar, porque o
    aparelho precisa voltar de qualquer jeito.

Um padrão se repetiu nas cinco levas e vale registrar: **o achado
anotado quase sempre era menor do que o problema real.** "Reabrir OS
entregue" eram dois caminhos, não um. "Saída em verde" eram duas telas e
dois bugs. "Título pago vira cancelado" também deixava apagar o título
inteiro. Vale abrir o código antes de estimar o tamanho de um item desta
lista.

**Resgate do 11/08, feito em 20/08 — um dia inteiro de trabalho que tinha
se perdido:**

O Felipe levantou a suspeita de ter trabalhado em dois projetos paralelos
(ele usa duas máquinas, casa e serviço). Verificado: **não existem dois
projetos** — um repositório, um remoto, um autor. Mas havia trabalho que
nunca cruzou.

Em **11/08** foi feita uma revisão completa com 6 agentes: 32 achados
verificados, 139 linhas de atualização do plano e um relatório de 221
linhas (`REVISAO-11-08.md`). Tudo isso ficou na branch
`claude/project-complete-review-347203`, que **nunca chegou na main e até
20/08 existia só no disco de uma das máquinas**. O plano não tinha uma
única menção a 11/08.

O que o resgate encontrou:

- 🔴 **A tela de Estoque quebrava — em branco — para Vendedor e Técnico.**
  `vw_produtos` devolve custo/margem nulos pra quem não tem
  `inventory.cost.view` (a trava funcionando como deve), e a tela fazia
  `margem_percent.toFixed(1)` direto. O conserto existia desde 11/08 e
  nunca foi aplicado. **Agravante:** em 17/08 este item foi reavaliado e
  teve a gravidade REBAIXADA, com a nota de que a tela "só mostra R$0
  enganoso" — não mostra, quebra. A reavaliação foi feita sem a informação
  que já existia na branch perdida. Corrigido em 20/08, com varredura no
  resto do projeto: as outras 16 telas que leem das views protegidas já
  tratavam o caso; `Estoque.tsx` era a única exceção, justamente por causa
  da correção órfã.
- 🟠 **PDV: cancelar o pagamento não descartava nada.** Pagamento lançado e
  produto recebido em troca sobreviviam ao cancelamento e reapareciam na
  próxima venda, possivelmente de outro cliente. Corrigido em 20/08.
- 🟠 **Estoque Crítico decidia o rótulo pelo valor, não pela permissão.**
  Corrigido em 20/08.
- 🔵 **Import morto de `untyped.ts` em `useAuth.tsx`.** Removido.

A maioria dos outros 32 achados já tinha sido re-encontrada e resolvida
entre 17 e 18/08, por caminhos independentes — aprovação de orçamento,
`ajustar_estoque_produto`, administrador se autodemovendo, rastro de quem
liberou permissão, "total recebido" somando o que não entrou, relatório
contando troca duas vezes, cliente bloqueado abrindo OS.

**A lição que fica:** trabalho em branch que não sobe não é trabalho
guardado — é trabalho perdido com aparência de guardado. Pior, ele
envenena decisões futuras: a reavaliação de 17/08 rebaixou um bug real
porque quem reavaliou não tinha o que já se sabia. As duas branches que
ainda estavam só em disco foram publicadas no GitHub em 20/08.

**Continua aberto do 11/08:**

- [ ] 🟠 **PDV e ficha do produto não avisam quando uma busca ao banco
  falha.** `src/pages/PDV.tsx` tem 9 consultas diretas e só 2 checagens de
  erro; `EstoqueDetalhe.tsx` tem mais 4 sem checagem. Se o banco engasgar
  por um instante, a lista fica vazia em silêncio — quem está no balcão não
  distingue "não tem cadastro" de "não consegui buscar", e pode cadastrar
  um produto que já existe ou dizer ao cliente que não tem estoque.
- [ ] 🔵 **Os três painéis de filtro (Venda, OS, Produto) repetem a mesma
  estrutura** em vez de compartilhar componente: mesma moldura, mesma função
  de limpar, e o bloco "campo + lista suspensa" copiado 9 vezes entre os
  três arquivos.
- [ ] 🔵 **O cálculo de "quantos dias tem o período" está copiado** em
  `VendasPagamentos.tsx` e `relatorios/RelatorioVendas.tsx`.
- [x] ✅ **Resolvido em 21/08 — a ponte foi apagada.** Ela cresceu de 6 para
  8 arquivos em vez de diminuir, mesmo as tabelas que cobria já estarem
  tipadas há semanas. Os arquivos voltaram ao client tipado, e a checagem
  revelou na hora um erro que estava escondido em `FinanceiroCaixa`.

**Revisão geral de 20/08 — depois de mesclar as duas frentes paralelas de
18/08.** O Felipe pediu uma revisão geral de tudo antes de começar a testar
o sistema por completo. Rodei 7 agentes em paralelo (um por área) mais um
agente de verificação final, focados especialmente em achar bug de
*composição* — arquivo tocado pelas duas frentes de 18/08 que ficou
inconsistente na junção — e não só reconferir achado antigo. Achados
reais, todos corrigidos no mesmo dia:

1. ✅ **Bug de integração real, achado antes mesmo de rodar os agentes**:
   `NovaOS.tsx` quebrava o `tsc` — um objeto `Cliente` local ficou sem o
   campo `liberado_venda` que a outra frente tinha acrescentado na
   interface. Corrigido passando o valor real que o banco devolve.
2. ✅ **Bypass de aprovação de orçamento — 4º caminho, mais simples que os
   três já fechados em 17/08.** Dava pra pular direto pra "Aprovado" vindo
   de qualquer etapa (não só saindo de "Aguardando aprovação"), nas 3
   telas E no banco. Corrigido nas telas e com migration nova.
3. ✅ **Duplicidade de lançamento no Caixa** — venda com 2+ produtos de
   troca em instruções separadas, e OS reaberta/reentregue, podiam lançar
   dinheiro a mais. Os dois gatilhos de Caixa (venda e OS) passaram a
   recalcular sempre a partir de tudo que existe agora, ajustando o
   lançamento em vez de duplicar — respeitando que sessão já fechada é
   imutável.
4. ✅ **CSV/Formula Injection** no exportador de relatórios, item que já
   estava anotado pra reavaliar a severidade — corrigido de vez.
5. ✅ **"Histórico da OS" não atualizava sozinho** depois de mudar etapa
   pela ficha (faltava invalidar a query certa).
6. ✅ **`ConfigLogs.tsx` não reconhecia 2 tabelas novas de auditoria**
   (`os_pagamentos`, `user_permissions`) — outro sintoma de duas frentes
   trabalhando em partes relacionadas sem se verem.
7. ✅ **Documentação corrigida**: dois achados de Estoque, resgatados da
   branch perdida de 11/08, que já estavam certos no código mas o plano
   ainda descrevia como abertos ou rebaixados sem essa informação.

Nenhuma correção desta rodada exigiu decisão de produto nova — todas eram
bug de verdade, com comportamento errado claro. `tsc`, `eslint` (mesma
baseline de antes, nenhum erro novo), 37 testes e `build` limpos depois de
tudo. Migrations testadas com transação revertida no banco antes de
aplicar.

**Pra continuar a partir daqui:**

1. **Testar o sistema de ponta a ponta**, cadastrando dados reais pela
   tela (clientes, produtos, vendas, troca, ordens de serviço) — é o
   próximo passo combinado com o Felipe, depois desta revisão.
2. **Fornecedores não alimentar compra/entrada de estoque** — o único
   achado 🔴 restante que não é ajuste pontual, é feature nova (não existe
   fluxo de recebimento de mercadoria hoje). Precisa de conversa sobre como
   esse fluxo deveria funcionar antes de qualquer código.
3. **O restante dos achados 🟠/🔵** de cada área, na ordem que fizer mais
   sentido pro seu dia a dia — nenhum quebra o uso diário sozinho.
4. **🔴 O banco continuar sem backup** segue sendo o risco maior que
   qualquer item desta lista, em paralelo com tudo acima — ver seção
   própria no início deste documento.

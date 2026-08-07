# Revisão Técnica Completa — Sisteminha (RP System.IO)

**Data:** 06/08/2026
**Método:** 3 agentes especializados leram as camadas-base (Banco de Dados,
Acesso a Dados, Permissões e Rotas) por completo; depois 8 agentes leram cada
área funcional do sistema (Vendas/PDV, Estoque, Ordens de Serviço, Financeiro,
Cadastros de Apoio, Dashboards/IE, Relatórios, Configurações/Admin) recebendo
o inventário das camadas-base como contexto, pra cruzar se cada tela está de
fato ligada ao banco e às permissões — não só "parece certo".

## Antes de tudo: o que está verificado e o que não está

A sessão bateu o limite de uso no meio da etapa de segunda-leitura (a etapa
que tenta **refutar** cada achado antes de eu confiar nele). Resultado real:

- **9 achados** passaram por uma segunda leitura independente que tentou
  ativamente refutá-los e não conseguiu — esses eu marco como
  **✅ confirmado (2ª leitura)** abaixo.
- **1 achado** teve uma segunda leitura que concordou com os fatos mas
  discordou da gravidade — marco como **⚠️ divergência** e explico o porquê.
- **Todo o resto (~82 achados)** é leitura única: um agente especializado leu
  o código de verdade e cita arquivo/linha exatos, mas ninguém tentou
  ativamente derrubar a afirmação. Não somaram viés — cada agente só via o
  código, sem saber o que os outros achavam — mas também não foram
  desafiados. Marco como **— não verificado** e uso isso pra não te vender
  confiança que não tenho.
- O **crítico de completude final** (a etapa que perguntaria "o que ficou de
  fora desta revisão?") também não rodou. Escrevi a seção
  ["O que esta revisão NÃO cobriu"](#o-que-esta-revisão-não-cobriu) à mão pra
  compensar isso.
- Posso terminar a verificação que faltou depois que a sessão resetar (a
  mensagem de erro indicou 1:10 da madrugada, horário de São Paulo) — é só
  pedir.

Isso **não** significa que os achados não-verificados estão errados — a
maioria tem citação de arquivo e linha exata, então é fácil confirmar em 30
segundos abrindo o arquivo. Significa só que eu não apostaria sua tarde numa
afirmação não-verificada sem abrir o arquivo primeiro.

---

## Teste isto agora, antes de tocar em código

Duas afirmações desta revisão, se verdadeiras, são graves o bastante pra
merecer um teste manual de 2 minutos no app no ar, antes de qualquer decisão
de prioridade:

1. **Arraste um card de Ordem de Serviço pra outra coluna no Kanban (ou mude
   o status pela tabela).** Dois agentes diferentes (o que leu só as
   migrations, e o que leu a área de Ordens de Serviço) chegaram
   independentemente à mesma suspeita: a coluna `service_orders.status` virou
   `TEXT` numa migration de janeiro, mas a tabela de histórico
   (`service_order_history`) continua com colunas do tipo ENUM antigo, e o
   gatilho que grava nela roda em toda troca de status. Se a suspeita for
   real, TODA troca de status falha com um erro cru do Postgres — isso
   comprometeria o Passo 4 inteiro (gerar conta a receber ao entregar).
   Nenhum dos dois agentes tinha acesso a um banco real pra confirmar.
2. **Feche uma venda no PDV logado como qualquer usuário, com o banco tendo
   mais de um perfil cadastrado no tenant** (a Rio Preto Games tem
   vendedor/técnico/gerente/admin, então esse teste já reflete o uso real).
   O agente da área de Vendas/PDV encontrou uma query que busca "o perfil do
   usuário logado" sem filtrar por usuário — só por tenant — e usa
   `.single()`, que falha se vier mais de 1 linha. Se confirmar, toda venda
   falharia hoje.

Se os dois testes passarem sem erro, ótimo — quer dizer que alguma proteção
que os agentes não viram (talvez em outra migration, talvez comportamento
real do Supabase) já cobre o caso, e os dois achados caem de prioridade
imediatamente. Se falharem, já sabemos por onde começar.

---

## Prioridade sugerida (curadoria minha, não é ordem mecânica de severidade)

Coloquei no topo o que tem mais **corroboração cruzada** (vários agentes
lendo arquivos diferentes chegaram à mesma conclusão sem saber um do outro)
e/ou maior **raio de impacto** (quebra dinheiro, vaza dado sensível, ou
trava o único admin).

| # | Achado | Por que importa | Verificação |
|---|---|---|---|
| 1 | Troca de status de OS pode falhar no banco (TEXT vs ENUM) | Compromete o Passo 4 inteiro; achado por 2 agentes independentes | — não verificado, testável em 2 min |
| 2 | Checkout do PDV quebra com >1 perfil no tenant | Trava a operação mais crítica do sistema | — não verificado, testável em 2 min |
| 3 | Custo/margem de produto e serviço vazam pra qualquer usuário do tenant via API, apesar de `inventory.cost.view` existir | Achado de forma convergente por **6 agentes diferentes** (banco, acesso a dados, Estoque, Cadastros, Dashboards, Relatórios) sem que nenhum soubesse do achado dos outros até a etapa de contexto compartilhado — é o achado mais corroborado desta revisão | ✅ confirmado (2ª leitura, na camada de banco) |
| 4 | Cancelamento automático de venda no PDV não reverte a baixa de estoque já feita | Estoque sai de verdade numa venda que fica marcada como cancelada, sem rastro do porquê | — não verificado |
| 5 | Caixa (abertura/fechamento) nunca reflete vendas do PDV nem títulos de OS pagos | A "conferência cega" que a tela existe pra fazer compara a gaveta contra um número que ignora quase todo o dinheiro do dia | ✅ confirmado (2ª leitura, com verificação de 7 pontos) |
| 6 | Aprovação de orçamento de OS usa a permissão genérica `orders.edit`, não a `orders.approve` dedicada — técnico aprova orçamento apesar do RBAC dizer que não deveria | Rompe a separação de responsabilidade documentada no próprio banco | ✅ confirmado (2ª leitura) |
| 7 | RPCs `ajustar_estoque_produto` e `proximo_numero_documento` não checam permissão nem tenant dentro do banco (SECURITY DEFINER sem trava) | Qualquer autenticado pode chamar via API direta, bypassando a tela | ✅ confirmado (2ª leitura) |
| 8 | Sem proteção contra o único administrador se autodemover ou se desativar | Sem caminho de volta dentro do app — trava o sistema pra todo mundo | — não verificado |
| 9 | Exceções de permissão por usuário não geram auditoria nem preenchem `motivo`/`definida_por` | A funcionalidade mais sensível da tela de Usuários é a única sem rastro | ✅ confirmado (2ª leitura) |
| 10 | `useUsuarios.definirPapel` troca de papel em 2 chamadas separadas (DELETE + INSERT), sem transação | Falha no meio = usuário some sem nenhum papel, sem acesso a nada | ✅ confirmado (2ª leitura) |
| 11 | Formas de Pagamento, Fornecedores e Origem/Motivo de Compra do Cliente são cadastros "✅ concluídos" no plano mas **nenhuma tela consome os dados** (PDV, Caixa, Clientes continuam nos enums fixos antigos) | 3 "Passos" marcados como prontos no PLANO-DE-CONSTRUCAO.md são, na prática, só uma vitrine de CRUD sem ligação com o resto do sistema | — não verificado, mas fácil de confirmar (grep por nome da tabela) |
| 12 | Dashboard (Home) usa lista fixa de status de OS em vez de `useOsStatuses` — e isso também erra a **contagem** dos cards, não só rótulo/cor | O plano já sabia do problema de rótulo/cor; o agente encontrou que também quebra o número do KPI se a loja renomear/remover um status | ✅ confirmado (2ª leitura) |

Os itens 1, 2 e 3 são os que eu atacaria primeiro — dois são testáveis em
minutos, e o terceiro é uma decisão de segurança consciente que vocês
precisam tomar (aceitar o risco por enquanto, já que hoje é 1 tenant só de
família confiável, ou fechar de verdade).

---

## Achados por camada base

### Banco de dados (Supabase/Postgres)

12 achados — 5 confirmados por 2ª leitura, 7 não verificados.

**🔴 Alta severidade**

1. **`inventory.cost.view` não existe no banco — só na UI.** ✅ *confirmado.*
   A permissão é cadastrada e atribuída a `gerente_tecnico`, mas nenhuma
   policy de RLS de `produtos`/`servicos` a usa. RLS é por linha, não por
   coluna — as policies liberam TODAS as colunas (inclusive `custo`,
   `margem_percent`, `custo_estimado`) pra qualquer autenticado do tenant.
   *Arquivos:* `20260127234413_...sql`, `20260801000002_rbac_permissoes.sql`,
   `20260801000003_cadastros.sql`.

2. **`ajustar_estoque_produto` (RPC, SECURITY DEFINER) não checa permissão
   nem tenant.** ✅ *confirmado.* Roda com privilégio de sistema e ignora as
   policies que normalmente protegeriam a tabela — mas não chama
   `has_permission()` nem valida tenant. *Arquivo:*
   `20260805090000_estoque_ajuste_e_os.sql`.

3. **`track_os_status_change` grava status (TEXT) em colunas ENUM
   `os_status`.** ✅ *confirmado.* Ver [seção de teste](#teste-isto-agora-antes-de-tocar-em-código),
   item 1. *Arquivos:* `20260127234413_...sql`, `20260128002757_...sql`.

**🟠 Média severidade**

4. **`proximo_numero_documento` (RPC pública) não valida que `_tenant`
   pertence ao chamador.** ✅ *confirmado.* SECURITY DEFINER, chamável
   diretamente via RPC. *Arquivo:* `20260801000004_laudo_e_numeracao.sql`.

5. **`vendas.comissao_calculada` e `service_orders.total_pecas`/`total_mao_obra`
   parecem colunas sem gravador.** ✅ *confirmado.* Nenhuma migration escreve
   nelas — possivelmente órfãs (o Dashboard de Metas já documenta que
   comissão é calculada fora do sistema).

6. **`taxa_percent`/`juros_percent` de `formas_pagamento` têm o mesmo risco de
   overflow já corrigido em `margem_percent`, mas só mitigado no front.**
   — *não verificado.* Ainda `DECIMAL(5,2)` (máx. 999,99%), sem CHECK/alargamento
   no banco.

**🟡 Baixa severidade / dívida técnica** (não verificado adversarialmente)

7. `formas_pagamento_parcelas` — tabela e RLS prontas, mas sem UI (o plano já
   assume essa limitação).
8. `produtos.categoria` (enum fixo) e `catalogos` tipo `grupo_produto`
   (catálogo flexível) são dois sistemas paralelos de categorização.
9. Integridade cross-tenant depende só da aplicação, não de FK/CHECK (risco
   zero hoje com 1 tenant só, mas a arquitetura multi-tenant é proposital).
10. Policies redundantes/sobrepostas em `profiles` e `titulos_financeiros`
    (não é bug — Postgres faz OR entre policies — só dificulta leitura).
11. `has_role()` e os valores legados do enum `app_role` (`admin`,
    `atendente`) ficam como código morto, sem `COMMENT ON` avisando.
12. Cabeçalho das migrations chama o sistema de "RPG System.IO", divergindo
    de "Sisteminha (RP System.IO)" usado no resto da documentação.

### Acesso a dados (hooks, integrations, lib)

9 achados — 3 confirmados por 2ª leitura, 1 com divergência relevante, 5 não
verificados.

**🔴 Alta severidade**

1. **`useUsuarios.definirPapel` troca de papel em 2 passos não atômicos
   (DELETE + INSERT do navegador).** ✅ *confirmado.* Falha no meio = usuário
   sem nenhum papel, silenciosamente, até um admin notar.

**🟠 Média severidade**

2. **`untyped.ts` descreve um estado do banco que não existe mais.** — *não
   verificado, mas fácil de confirmar.* O comentário do arquivo diz que
   `catalogos`, `role_permissions`, `formas_pagamento` etc. "ainda não
   existem" em `types.ts` — falso hoje, todas já estão lá (confirmado lendo
   `types.ts`). Falta só o passo 3 da própria receita de remoção do arquivo:
   trocar `db` por `supabase` nos imports e apagar `untyped.ts`. Afeta
   `useCatalogos.ts` e `useTitulos.ts` diretamente, e mais 4 telas (ver
   áreas de Cadastros, Relatórios e Config/Admin abaixo).

3. **Tipo `Role` do front (5 valores) menor que o enum `app_role` do banco (7
   valores).** ⚠️ *divergência entre os dois revisores.* Um confirmou o
   achado como preciso (o descompasso é real, o cast não é validado em
   runtime, e existe um segundo ponto de rótulo em branco em
   `Sidebar.tsx:273` além do citado). O outro concordou com os fatos mas
   discordou da gravidade: os dados legados já foram migrados
   (`UPDATE ... SET role='administrador' WHERE role='admin'`, na migration
   de 01/08), o único combo de escrita no front já limita a 5 valores, RLS
   já é fail-closed pra papel desconhecido, e o próprio comentário da
   migration documenta a orfandade como decisão deliberada (Postgres não
   permite `DROP VALUE` de enum). **Conclusão prática: é cosmético (rótulo
   em branco em 2 lugares), só alcançável escrevendo direto no banco fora do
   app — baixo risco real, mas o rótulo em branco vale uma correção
   trivial** (`ROLE_LABELS[role] ?? 'Desconhecido'`).

4. **`useAuth.aplicar()` sem sequenciamento entre eventos de sessão
   concorrentes.** ✅ *confirmado.* Troca rápida de usuário pode deixar a
   tela com permissões da sessão anterior por alguns instantes.

5. **Camada de hooks cobre só uma fração das entidades.** ✅ *confirmado.*
   9 hooks cobrem autenticação, catálogos, títulos, usuários e status de OS
   — não existe hook para `produtos`, `vendas`, `service_orders` ou
   `clientes`. 34 arquivos de página fazem acesso direto ao Supabase sem
   passar por hook nenhum.

**🟡 Baixa severidade**

6. Tradução de erro de RLS duplicada em pelo menos 13 arquivos (3 hooks +
   10 páginas).
7. `useCardConfig`/`useViewMode` duplicam o mesmo padrão de estado
   persistido em `localStorage`.
8. `Dashboard.tsx` ainda lê status de OS do mapa fixo `OS_STATUS` em vez de
   `useOsStatuses` (o plano já sabia — ver item 12 da tabela de prioridade).
9. `useCatalogos` calcula "próxima ordem"/"item padrão" a partir do cache
   local, sem reconsultar o banco (risco cosmético de corrida entre 2
   usuários).

### Permissões e rotas

6 achados — 1 confirmado por 2ª leitura, 5 não verificados.

**🔴 Alta severidade**

1. **Aprovação de orçamento de OS usa `orders.edit`, não `orders.approve`.**
   ✅ *confirmado* — ver item 6 da tabela de prioridade. A permissão
   `orders.approve` está cadastrada, atribuída a papéis, e checada em
   **nenhum lugar** do sistema (nem tela, nem RLS) — permissão totalmente
   fantasma.

**🟠 Média severidade**

2. **Mudança de status de OS (Kanban/tabela) não checa permissão no front,
   diferente das telas irmãs.** — *não verificado.* `OrdensServico.tsx`
   chama `.update()` direto, sem `can(PERMISSIONS.ORDERS_EDIT)` — RLS ainda
   bloqueia no banco, mas a UX é pior (usuário arrasta, falha, erro cru).

**🟡 Baixa severidade**

3. Item de menu "IE - Serviço" aponta pra chave sem entrada no registry —
   cai em "Em Construção" (já sabido, documentado no próprio código e no
   plano).
4. Lógica de "permissão decide visibilidade" reimplementada em 3 lugares
   (`Sidebar.tsx`, `AppHeader.tsx`, `RequirePermission.tsx`) em vez de uma
   função central.
5. PLANO-DE-CONSTRUCAO.md descreve o RBAC como "admin/atendente/técnico/
   vendedor" (4 papéis antigos) — o código já usa 5 papéis renomeados.
   Só o texto do plano ficou desatualizado.
6. `OSDetalhe.tsx` é a única página fora do registry central, montada
   direto em `App.tsx` (funciona, mas cria 2 mecanismos de rota em
   paralelo).

---

## Achados por área funcional

### Vendas / PDV

11 achados — 6 confirmados por leitura contra os inventários de banco/
permissões compartilhados (marcados "✅ cruzado" — não é a mesma coisa que
2ª leitura adversarial, mas é uma confirmação contra dados de outro agente
independente).

**🔴 Alta severidade**
1. Checkout quebra com >1 perfil no tenant (`.single()` sem filtrar por
   usuário) — ver item 2 da tabela de prioridade. *PDV.tsx:198-201.*
2. Cancelamento automático de venda não reverte a baixa de estoque — ver
   item 4 da tabela de prioridade. *PDV.tsx:221-263.*

**🟠 Média severidade**
3. SELECT em vendas/itens/pagamentos não valida `sales.view`, só tenant —
   RequirePermission é "conveniência de UI", não segurança real aqui.
4. `sales.discount` existe no catálogo e no banco, mas não há UI de
   desconto — permissão decorativa.
5. `sales.cancel` e a policy de UPDATE em vendas não têm UI manual — só o
   catch automático usa.
6. Catálogo "Origens da Venda" existe em Listas do Sistema, mas `vendas`
   não tem coluna pra guardar isso — órfão.
7. `clientes.liberado_venda`/`limite_credito` nunca são lidos nem escritos,
   inclusive no PDV — o controle de crédito documentado no schema não
   existe na operação.
8. Formas de Pagamento (cadastro) não é consultado pelo PDV — ver item 11
   da tabela de prioridade.

**🔵 Simplificação**
9. `PDV.tsx` duplica formatação de moeda em vez de usar `lib/format.ts`.
10. `PDV.tsx` é a única tela da área sem hook de dados nem react-query.
11. `NAV_ITEMS` e `SHORTCUTS.newSale` são código morto (navegação real vem
    de `menu.ts`; nenhum listener de teclado liga o atalho).

### Estoque

7 achados.

**🔴 Alta severidade**
1. `Estoque.tsx` mostra custo/margem pra qualquer usuário com
   `inventory.view`, ignorando `inventory.cost.view` — parte do achado
   corroborado 6x (item 3 da tabela de prioridade). Contraste: as telas
   irmãs (`EstoqueMovimentacoes.tsx`, `OSDetalhe.tsx`) fazem o gating
   corretamente; `Estoque.tsx` é a única que vaza.
2. Botão "Repor" em `EstoqueCritico.tsx` esconde a ação por permissão, mas a
   RPC que ele chama (`ajustar_estoque_produto`) não checa nada — proteção
   é só cosmética (mesma raiz do achado #2 da camada de banco).

**🟠 Média severidade**
3. `inventory.delete` é permissão morta — "Excluir produto" na tela é
   soft-delete via UPDATE, então na prática usa `inventory.edit`.
4. `Estoque.tsx` não esconde os botões de Novo/Editar/Excluir por
   permissão — usuário sem acesso recebe erro cru de RLS em vez de não ver
   o botão.
5. `estoque_atual <= estoque_minimo` reimplementado em pelo menos 6 lugares
   (Estoque, EstoqueCritico, Dashboard, DashboardEstoque, RelatorioEstoque
   ×2), sem helper compartilhado.

**🟡 Baixa**
6. Preview de margem no dialog de cadastro não aplica o mesmo clamp
   ±9999,99% da coluna gerada no banco — salto visual entre o que o usuário
   digita e o que fica salvo.
7. `Estoque.tsx` é a única tela da área ainda em `useState`/`useEffect`
   manual, sem hook compartilhado (`useProdutos()` não existe).

### Ordens de Serviço

10 achados.

**🔴 Alta severidade**
1. Troca de status pode falhar no banco (TEXT vs ENUM) — ver item 1 da
   tabela de prioridade. **Prioridade nº1 pra testar.**
2. Aprovar/recusar orçamento usa `orders.edit`, não `orders.approve` — ver
   item 6 da tabela de prioridade (mesmo achado, visto pelo lado da área).

**🟠 Média severidade**
3. "Técnico Responsável" no cartão do Kanban é campo morto: nunca é
   atribuído a nenhuma OS, e mesmo se fosse, falta o join do nome pra
   aparecer. O toggle "Status" do mesmo diálogo também não tem efeito.
4. Laudo técnico ainda não bate com o padrão da empresa — faltam
   Diagnóstico, Prazo, Garantia da OS e Técnico Responsável na tela (o
   plano já assume isso; este achado só documenta o alcance exato: 7
   colunas do banco sem UI).
5. "Status customizável por loja" depende, na marra, de 6 chaves fixas
   espalhadas pelo código (`NovaOS.tsx`, `OrdensServico.tsx`,
   `OSFinalizadas.tsx`, `OSOrcamentos.tsx`, o gatilho de título). Excluir a
   chave errada em "Gerenciar Status" quebra silenciosamente um fluxo
   inteiro (ex.: fila de orçamentos suja pra sempre).

**🟡 Baixa**
6. OS com status órfão (sem coluna configurada) pode desaparecer do Kanban
   sem aviso, mesmo continuando na Tabela.
7. É possível lançar peça (com baixa real de estoque) numa OS já cancelada
   — só o status "entregue" bloqueia o lançamento.
8. Lógica de status/formatação duplicada entre telas antigas (Kanban/
   Tabela) e novas (Detalhe/Finalizadas/Orçamentos) da mesma área — 3
   cópias do mesmo fallback de status, 2 cópias de formatação de moeda/data.
9. Regra "item de peça não pode ser excluído" só existe na UI — a policy do
   banco permite DELETE de qualquer item via `orders.edit`, sem distinguir
   peça de serviço avulso.
10. `total_pecas`/`total_mao_obra` e `service_order_history` (timeline de
    status) nunca são lidos nem escritos por nenhuma tela.

### Financeiro

6 achados.

**🔴 Alta severidade**
1. Caixa nunca reflete vendas do PDV nem títulos pagos — ver item 5 da
   tabela de prioridade. ✅ *confirmado com verificação de 7 pontos* (a mais
   completa desta revisão).

**🟠 Média severidade**
2. Fluxo de Caixa classifica "Realizado" pelo **vencimento**, não pela data
   real de pagamento (`pago_em`) — reproduz exatamente o erro que o próprio
   comentário do arquivo avisa ser "o mais comum em relatório de fluxo de
   caixa". Afeta títulos manuais pagos fora do mês do vencimento (aluguel,
   fornecedor, crediário).
3. Formulário de título manual não vincula fornecedor/cliente, apesar das
   colunas e dos cadastros já existirem — não dá pra consultar "quanto o
   cliente X me deve" a partir do Financeiro.
4. Assimetria de permissão: abrir/lançar no Caixa exige `finance.cashier.close`,
   mas ler os movimentos lançados exige `finance.view` — inofensivo com os
   papéis padrão, mas quebra pra qualquer exceção individual que só receba a
   primeira.

**🟡 Baixa**
5. `FinanceiroCaixa.tsx` é a única tela financeira sem hook dedicado.
6. Baixa de título sempre paga o valor total — coluna `valor_pago` sugere
   pagamento parcial que a UI não expõe.

### Cadastros de Apoio

10 achados.

**🔴 Alta severidade**
1. Formas de Pagamento é uma tela isolada — PDV, Pagamentos e Caixa
   continuam no enum fixo antigo (ver item 11 da tabela de prioridade).

**🟠 Média severidade**
2. Fornecedores não alimenta compra nem entrada de estoque, apesar do
   próprio hint da tela prometer isso.
3. Origem/Motivo de Compra do Cliente (catálogo) existem e têm dados reais,
   mas `Clientes.tsx` nunca os usa — grava só o enum legado.
4. `tempo_estimado_horas` em Cadastro de Serviços tem o mesmo risco de
   overflow já corrigido 2x no projeto (margem, taxa/juros) — sem clamp.
5. "Ver detalhes" em `Clientes.tsx` navega pra `/clientes/:id`, rota que
   não existe — cai em 404 (mesmo padrão de bug que o Passo 4 já corrigiu
   pros cards de OS, aqui nunca foi).

**🟡 Baixa**
6. `Clientes.tsx` diverge do padrão que as telas novas de Cadastros
   estabeleceram (não usa `useAuth()`, não checa `can()`, não reaproveita
   `PageHeader`/`Vazio`).
7. Tradução de erro de RLS reimplementada com nomes diferentes em 6 lugares.
8. Boilerplate de CRUD quase idêntico repetido em 4 telas (Fornecedores,
   Transportadoras, Serviços, Formas de Pagamento).
9. `useCatalogos.ts` ainda usa o cliente não tipado `db`.
10. `custo_estimado` de Serviços é lido pela API por qualquer usuário do
    tenant — mesma classe do achado #3 da tabela de prioridade.

### Dashboards e Inteligência Empresarial

5 achados.

**🟠 Média severidade**
1. Custo do produto é sempre buscado do banco, mesmo pra quem não tem
   `inventory.cost.view` — só a exibição é escondida (mesma família do
   achado #3 da tabela de prioridade; aqui é **hoje** só "falha latente"
   porque nenhum papel atual combina acesso ao dashboard sem a permissão de
   custo — mas isso vira real no dia em que um papel novo for criado).
2. Dashboard (Home) usa lista fixa de status — e isso também erra a
   **contagem** dos KPIs, não só rótulo/cor. ✅ *confirmado* — ver item 12
   da tabela de prioridade.

**🔵 Simplificação**
3. Agregação "vendas do período por produto" reimplementada quase
   identicamente em 3 telas (`DashboardVenda`, `IeComercial`, `IeEstoque`),
   com duplicação até reconhecida em comentário no próprio código
   ("mesma lógica de vendasTrend do Dashboard.tsx").
4. Dashboard (Home) não checa erro de nenhuma das 6-7 chamadas Supabase —
   falha silenciosa mostra "0" em vez de indicar problema, diferente do
   padrão dos dashboards mais novos.
5. Filtro de período em IE Comercial/IE Estoque compara string de data pura
   contra timestamp, sem ajuste de fuso — pode deslocar até 3h o corte do
   dia (mesmo padrão pré-existente do `RelatorioShell`, não é regressão
   nova, mas inconsistente com o cuidado que o resto do Passo 6 tomou).

### Relatórios

7 achados.

**🟠 Média severidade**
1. `RelatorioEstoque` busca a coluna `custo` do banco mesmo sem
   `inventory.cost.view` — mesma família do achado #3.
2. Relatório Financeiro é liberado por `finance.view`, mas a RLS da tabela
   que ele lê exige outra permissão — com os papéis padrão não quebra, mas
   o gate confere a permissão errada pros dados reais.
3. `RelatorioOS` mostra a chave crua do status (`em_reparo` → "em reparo")
   em vez do rótulo/cor customizável da loja — nem usa `useOsStatuses` nem
   o fallback fixo, é puro `.replace()`.

**🟡 Baixa**
4. Escape de CSV não neutraliza `=`/`+`/`-`/`@` — risco de CSV/Formula
   Injection no Excel para nome de cliente ou descrição de título digitados
   livremente.
5. Nome do arquivo CSV de `RelatorioEstoque` sugere um recorte de datas que
   não existe (a tela não filtra por período).
6. Formatação de moeda pra CSV e filtro de período por timestamp duplicados
   nos 4 relatórios (8 ocorrências do mesmo `toFixed(2).replace()`).
7. `RelatorioFinanceiro` usa o cliente não tipado `db` — mesma pendência do
   achado de acesso a dados.

### Configurações e Administração

9 achados.

**🔴 Alta severidade**
1. Sem proteção contra o único admin se autodemover/desativar — ver item 8
   da tabela de prioridade.
2. Exceções de permissão por usuário não geram auditoria — ver item 9 da
   tabela de prioridade. ✅ *confirmado.*

**🟠 Média severidade**
3. Página gated por `users.manage`, mas escritas de papel/exceção exigem
   `roles.manage` — sem checagem granular na UI (hoje só `administrador` tem
   as duas, mas a tela permite conceder uma sem a outra via exceção
   individual). ✅ *confirmado.*
4. `MinhaEmpresa` edita cor/logo, mas nada no app consome esses campos —
   nem branding, nem laudo/PDF (que ainda não existe). ✅ *confirmado.*
5. Cliente não tipado (`db`) ainda em uso em `ConfigLogs`/`ConfigPerfis`/
   `ConfigPreferencias`, apesar de `Usuarios.tsx` (mesma área) já consultar
   as mesmas tabelas com o cliente tipado sem problema.

**🔵 Simplificação**
6. Fetch/agrupamento de `permissions`/`role_permissions` duplicado entre
   `ConfigPerfis` e `Usuarios` (e com 2 clientes Supabase diferentes pra
   mesma query).
7. Troca de papel não é atômica (mesmo achado da camada de acesso a dados,
   visto pela área).
8. Badge de notificação no `AppHeader` é decorativo — sempre mostra "3",
   sem query nem feature de notificação por trás.
9. `MinhaEmpresa` é a única tela da área fora do padrão useQuery/useMutation.

---

## Backlog de simplificação (agrupado por tema, não por área)

Coisas que não quebram nada hoje, mas valem a pena limpar enquanto se está
com a mão na área:

- **Apagar `untyped.ts` de vez.** Já está no "passo 3 da própria receita" —
  trocar `db` por `supabase` em `useCatalogos.ts`, `useTitulos.ts`,
  `ConfigLogs.tsx`, `ConfigPerfis.tsx`, `ConfigPreferencias.tsx` e
  `RelatorioFinanceiro.tsx`, e apagar o arquivo. Zero risco — os tipos já
  existem em `types.ts`.
- **Um util central pra traduzir erro de RLS.** Hoje reimplementado (com
  nomes diferentes) em pelo menos 13 arquivos.
- **Um helper `isEstoqueCritico(produto)`.** Reimplementado em 6 lugares.
- **Um hook `useCrudSimples`** pro esqueleto repetido de Fornecedores/
  Transportadoras/Serviços/Formas de Pagamento (fetch + busca + dialog +
  exclusão lógica).
- **Um hook `useLocalStorageState<T>`** pra unificar `useCardConfig` e
  `useViewMode`.
- **Hooks faltando pras entidades centrais:** não existe `useProdutos`,
  `useVendas` nem `useServiceOrders` — 34 arquivos de página acessam o
  Supabase direto.
- **Migrar `PDV.tsx` pro padrão react-query** do resto do projeto.
- **Consolidar as 3 cópias do fallback de status de OS** (`OrdensServico`,
  `OSTableView`, e o hook `useOsStatuses` que já devia ser a única fonte).

---

## O que esta revisão NÃO cobriu

Como o crítico de completude final não rodou, escrevo isso à mão:

- **Nenhum teste foi feito no app rodando** — tudo aqui é leitura estática de
  código. Os 2 itens da seção "teste isto agora" são exatamente os que mais
  precisam de confirmação empírica.
- **Componentes `src/components/ui/*` (shadcn) foram excluídos de propósito**
  — são código gerado/vendor, não lógica de negócio da Rio Preto Games.
- **Não existem Edge Functions no projeto** (`supabase/functions` não
  existe) — não há essa camada adicional pra revisar.
- **Não foi feita varredura de segurança automatizada** (SAST/dependência) —
  os achados de segurança aqui vieram de leitura manual de RLS/permissões,
  não de uma ferramenta dedicada.
- **Acessibilidade, performance de bundle (o aviso de chunk >500kB do build)
  e testes automatizados** não foram avaliados nesta rodada — o projeto
  tem hoje só 1 teste de exemplo (`src/test/example.test.ts`).
- **O site de marketing (`marketing/site/*.html`, Passo 8) não foi tocado.**
- A verificação adversarial da maioria dos achados de **Estoque, Ordens de
  Serviço, Cadastros de Apoio, Dashboards, Relatórios e Configurações**
  não rodou (só Banco de Dados, Acesso a Dados e Permissões tiveram a
  maior parte da 2ª leitura completa antes do limite de sessão).

---

## Próximos passos

1. Rodar os 2 testes manuais da seção ["Teste isto agora"](#teste-isto-agora-antes-de-tocar-em-código).
2. Decidir o que fazer com o achado #3 (vazamento de custo/margem) — é uma
   decisão de produto/segurança, não só um bug: aceitar o risco por agora
   (documentando) ou fechar de verdade (view sem a coluna, ou tabela
   separada com RLS própria).
3. Escolher por onde começar a trabalhar — posso abrir uma tarefa por item
   da tabela de prioridade, ou você me diz qual área quer atacar primeiro.
4. Se quiser, retomo a verificação adversarial que faltou depois que a
   sessão resetar, pra dar 2ª opinião nos achados de alta severidade das
   áreas que ainda não foram desafiadas.

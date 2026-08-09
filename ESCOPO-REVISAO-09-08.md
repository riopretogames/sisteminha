# Escopo de trabalho — revisão de 09/08/2026

Revisão pedida pelo Felipe depois das mudanças de 08 e 09/08 (cadastro de
cliente, nova OS, etapas fixas e base de automação).

## Como esta revisão foi feita — e o que ela não cobre

**Foi feita lendo o código e perguntando ao banco**, não clicando na tela. Isso
é limitação real e a lição de 08/08 vale aqui: naquele dia descobrimos uma
proteção anotada como aplicada que nunca tinha chegado ao banco, e as duas
telas que dependiam dela estavam quebradas havia um dia.

Então: os achados abaixo têm arquivo e linha, e cada um diz o que acontece na
prática. Mas **nada disso substitui abrir o sistema e usar**. No fim tem uma
lista curta do que só o teste no navegador revela.

---

## O que está de pé

Verificado nesta revisão:

- **As 5 etapas existem no banco**, marcadas como obrigatórias, e o Kanban lê a
  lista de lá — não de uma lista fixa no código.
- **Nenhuma migration pendente.** As 30 estão aplicadas e batendo com o banco.
- **Checagem de tipos, build e testes**: limpos.
- **Nenhuma chave de status solta no código.** Eram 34 em 7 telas; hoje vivem
  num arquivo só.
- **O gatilho que gera o título ao entregar continua válido**: depende da chave
  `entregue`, que foi preservada de propósito.
- Lint: 8 erros, **todos anteriores a este trabalho** (uso de `any` em captura
  de erro e duas interfaces vazias do shadcn). Nenhum é risco de operação.

---

## Achados novos desta revisão

### ✅ 1. OS some do Kanban se a etapa for desativada — RESOLVIDO 09/08

`src/components/os/OSKanbanView.tsx:19-36`

O Kanban separa as OS por etapa usando **todas** as etapas, mas desenha só as
**ativas**. Uma OS parada numa etapa desativada vai para um balde que nunca
aparece na tela.

**Na prática:** alguém desativa uma etapa que ainda tem aparelho dentro, e
aqueles aparelhos somem do quadro. Não dão erro, não avisam — somem. O
aparelho continua na prateleira e ninguém lembra dele.

Hoje não há OS nessa situação (as etapas antigas só foram desativadas onde
estavam vazias), mas a porta está aberta.

### ✅ 2. O nome do técnico nunca aparece no card — RESOLVIDO 09/08

`src/pages/OrdensServico.tsx:105` e `src/components/os/OSKanbanCard.tsx:89`

O card mostra o técnico se `tecnico_nome` existir. A consulta traz apenas
`tecnico_id`, e **`tecnico_nome` nunca é preenchido em lugar nenhum**.

**Na prática:** você liga a opção "Técnico Responsável" na configuração do
cartão e não aparece nada. Antes isso era desculpável (ninguém atribuía
técnico); desde ontem a abertura de OS grava o técnico, então o dado existe e
continua invisível.

### ✅ 3. A ficha da OS não deixa avançar a etapa — RESOLVIDO 09/08

`src/pages/OSDetalhe.tsx`

A ficha tem salvar orçamento e lançar peça, mas **nenhuma ação de fluxo**.
Trocar de etapa só pelo Kanban (arrastando) ou pelo seletor da tabela.

**Na prática:** desde ontem, criar uma OS leva direto para a ficha dela. O
atendente termina o check-in, está na tela da OS… e precisa voltar para a lista
para mover a etapa. É o caminho mais usado do sistema pedindo um desvio.

### ✅ 4. Arrastar no Kanban não confere permissão antes — RESOLVIDO 09/08

`src/pages/OrdensServico.tsx:121`

A troca de etapa vai direto para o banco. Quem não tem permissão arrasta o
cartão, vê o cartão mudar de lugar e **só então** recebe um erro técnico — e o
cartão volta sozinho.

### ✅ 5. "Cancelado" virou coluna no quadro — RESOLVIDO 09/08

Consequência da migration de ontem: como toda etapa ativa vira coluna,
Cancelado aparece no Kanban junto com o fluxo.

**Decidido pelo Felipe:** sai do quadro, e a etapa continua existindo para
filtro e consulta. OS cancelada aparece em OS Finalizadas e nos relatórios
normalmente.

### 🔴 6. O título nasce "pago" quando a OS é entregue — SEGUE ABERTO

`supabase/migrations/20260805150000`

Entregar a OS cria automaticamente a conta a receber **já quitada**, sem forma
de pagamento e sem passar pelo caixa.

Isso já estava no mapa do Financeiro, mas **ficou mais grave ontem**: agora
"Entregue" significa oficialmente "cliente retirou e pagou". O sistema afirma
que entrou dinheiro sem registrar como entrou nem onde.

**Não foi corrigido de propósito.** A correção de verdade depende das 4
decisões do Financeiro — principalmente "o que conta como dinheiro na gaveta".
Consertar meio caminho agora (por exemplo, exigir forma de pagamento na
entrega) criaria retrabalho assim que essas decisões saírem.

---

## O que continua aberto, por área

Resumo do que o `PLANO-DE-REFINAMENTO.md` já mapeava e ainda vale.

### 🔴 Sem rede de segurança

- **O banco não tem backup nenhum.** Continua sendo o maior risco do projeto,
  acima de qualquer melhoria de tela. Ver a seção própria no plano.

### 🔴 Financeiro — o buraco maior do sistema

- O Caixa não enxerga venda do PDV, OS paga, baixa de título nem devolução: a
  conferência do fim do dia compara a gaveta contra um número que ignora quase
  todo o dinheiro.
- 26 problemas mapeados em `MAPA-FINANCEIRO.md`, quase todos do mesmo buraco.
- **4 decisões suas** estão travando o início.

### 🔴 Segurança que a tela promete e o banco não cumpre

- `ajustar_estoque_produto` (usada pelo botão "Repor" do Estoque Crítico) não
  confere permissão nem loja: dá para chamar por fora e mexer no estoque.
- `proximo_numero_documento` não valida a loja de quem chama.
- Não há proteção contra o **único administrador se autodemover** — sem caminho
  de volta dentro do app.

### 🟠 Assistência técnica

- Aprovar orçamento usa a permissão de editar OS, não a permissão dedicada que
  existe cadastrada e nunca é conferida: **técnico aprova orçamento** apesar do
  RBAC dizer que não.
- Diagnóstico técnico não tem campo em tela nenhuma.
- Cliente bloqueado ainda abre OS (a trava vale só para venda).
- Peça lançada pode ser excluída sem estornar o estoque.
- Foto do aparelho — depende do armazenamento de arquivos, que não existe.

### 🟠 Cadastros e listas

- Falta varrer os outros catálogos procurando o mesmo problema que você achou
  nas marcações: lista cadastrada que nenhuma tela lê. `origem_venda` já se
  sabe que é órfã.
- Listas do Sistema não deixa escolher a cor do item.

---

## Proposta de ordem

**1. Fechar o que esta revisão achou** (meio dia)
Os seis achados acima. São pequenos, estão no caminho do que você acabou de
construir, e três deles atrapalham o uso diário da assistência.

**2. Backup** (uma tarde, e depende de você instalar o Docker)
Antes de qualquer coisa destrutiva. Hoje não existe volta.

**3. Financeiro** (o trabalho grande)
Começa pelas 4 decisões suas. É onde o sistema hoje mente sobre dinheiro.

**4. Fechar a assistência** (depois do Financeiro, porque se cruzam)
Permissão de aprovar orçamento, diagnóstico técnico, e aí sim as automações do
n8n — que dependem do fluxo estar redondo.

---

## O que só você decide

Respondidas em 09/08:

1. ~~Cancelado fica no Kanban?~~ **Sai**, preservando a etapa para consulta.
2. ~~Quem move para "Entregue"?~~ **O vendedor** — e, revisado na sequência,
   ele opera a OS inteira: cria, aprova, finaliza e lança serviço. Quem tem
   contato com o cliente é o balcão, não a bancada.
3. ~~OS pronta que o cliente não busca?~~ **Aviso recorrente no painel** e tela
   própria. Mais de 6 meses = abandonado (a loja descarta ou vende para cobrir
   o reparo).

Ainda aberto:

4. As **4 perguntas do Financeiro** que estão no `MAPA-FINANCEIRO.md`.
5. **Em quais etapas o cliente recebe mensagem automática**, e o que cada uma
   diz — quando ligarmos o n8n.

---

## O que só o teste no navegador revela

Vale abrir e fazer, nesta ordem:

1. Abrir uma OS nova com checklist, senha de desenho, prazo e garantia.
2. Arrastar o cartão pelas cinco etapas e ver se cada uma responde.
3. Entrar em "Gerenciar Status" e tentar excluir uma etapa fixa (tem que
   recusar com explicação).
4. Criar uma etapa nova e ver se ela aparece no quadro.
5. Filtrar em OS Finalizadas por marca e por período.
6. Conferir se as marcações do check-in aparecem na ficha da OS.

E duas consultas para rodar no SQL Editor, que eu não consigo daqui:

```sql
-- As cinco etapas estão certas?
SELECT etapa, key, label, sistema, ativo
  FROM public.os_status_config
 ORDER BY etapa NULLS LAST, ordem;

-- Sobrou OS em etapa antiga?
SELECT status, count(*) FROM public.service_orders GROUP BY status;
```

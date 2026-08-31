# Processo de Ordem de Serviço

Como a Ordem de Serviço caminha na vida real, do momento em que o cliente
entra na loja até o aparelho sair entregue. Este documento existe para o
sisteminha ser construído em cima do processo que a loja realmente pratica —
não de um processo imaginado.

> [!warning] Mapeamento incompleto
> Levantado em **30/08/2026**, a partir da descrição falada do Felipe.
> As etapas 1, 2, 3 e a entrega estão fechadas. O que vem depois da entrega
> (pós-venda) ainda não foi definido — ver [O que ainda falta decidir](#o-que-ainda-falta-decidir).

**Desenho do fluxo (FigJam):** https://www.figma.com/board/vlxcxEJDDg2UtpEOS0Rq1V
O board tem dois desenhos que se encaixam: a **Parte 1** vai do balcão até a
aprovação do laudo, a **Parte 2** vai da execução até o status Entregue.

**Auditoria do processo:** https://claude.ai/code/artifact/b3fa437b-0be8-4883-8d32-bf0b63615c8d
16 buracos encontrados e conferidos contra a documentação da empresa.
O resumo está em [O que a auditoria encontrou](#o-que-a-auditoria-encontrou).

---

## As etapas

Estas são as colunas do Kanban **como estão no banco hoje**, conferidas na
migration `20260830180000_conserta_numeracao_e_terceirizada_repetida.sql`:

| Nº | Coluna | Quem toca | O que acontece ali |
|---|---|---|---|
| **1** | Entrada / Análise | Vendedor **e** Técnico | Balcão, triagem, criação da OS, e a análise que gera o laudo |
| **2a** | Aguardando aprovação | Vendedor registra a resposta | Laudo enviado, esperando o cliente decidir |
| **2b** | Aguardando Peça | Técnico | Reparo aprovado, parado até a peça chegar |
| **3** | Aprovado / Executar | Técnico | O reparo em si |
| **4** | Terceirizada | *a definir* | Aparelho que vai para fora ser consertado |
| **5** | Finalizado | Vendedor | Pronto, guardado no depósito, esperando o cliente |
| **6** | Entregue | automático | Último status. O pagamento marca sozinho |
| — | Cancelado | — | Sem número de propósito: não é passo do processo, é saída de emergência |

Repare que a Etapa 1 é uma etapa só, com duas metades: o vendedor no balcão
**e** o técnico na análise. As duas juntas formam a Entrada / Análise.

> [!note] Duas coisas que o mapeamento falado não tinha
> A conversa que originou este documento não mencionou a **2b Aguardando
> Peça** nem a **4 Terceirizada** — as duas já existem no sistema. E o
> `Finalizado` é a etapa **5**, não a 4 como se supôs.
>
> A **Terceirizada** é a maior lacuna deste documento: sabe-se que a coluna
> existe e onde ela fica no quadro, mas ninguém descreveu ainda quem manda o
> aparelho para fora, como se registra para onde ele foi, quem cobra o
> prazo do terceiro, nem o que acontece quando ele volta.

---

## Etapa 1, parte A — Balcão · dono: VENDEDOR

1. Cliente chega com o aparelho.

2. **Triagem obrigatória — tudo isto acontece antes de criar a OS:**
   - Perguntar quando foi a última vez que o aparelho funcionou.
   - Perguntar o que está acontecendo com ele.
   - Testar o aparelho no balcão, para descartar cabo, fonte e afins.
   - Decidir: **o serviço está na tabela oficial?**

   **Se está na tabela (tabelado):** informa preço e prazo fixos. Não existe
   laudo eletrônico, não existe taxa de R$ 80.

   **Se não está na tabela:** o vendedor vende o laudo eletrônico, explicando
   nesta ordem:
   - o que será feito (desmontagem completa, testes de bancada);
   - a taxa de **R$ 80,00**;
   - o prazo de **1 a 3 dias úteis** (sábado não conta);
   - a regra do dinheiro: se aprovar o reparo, os R$ 80 abatem do total; se
     reprovar, ou se a loja concluir que não compensa consertar, paga os
     R$ 80 na retirada.

3. Vendedor cria a OS.

4. Lança no **Portal**.

> [!note] Portal e passagem são duas coisas diferentes
> O **Portal** é o sistema que transfere a OS entre a loja e a assistência.
> Separado disso, os dois prédios são ligados por uma **passagem física** —
> é por ali que o aparelho anda. Não confundir os dois no sistema.

---

## Etapa 1, parte B — Assistência · dono: TÉCNICO

5. O técnico busca o aparelho, que vem com a OS impressa colada nele.
6. Puxa a OS no sistema.
7. Aperta o botão **INICIAR REPARO**.
8. Confirma que vai iniciar.
9. **Se for tabelado:** pula o laudo eletrônico e vai direto para a Etapa 3.
10. **Se não for tabelado:** desmonta o aparelho, investiga o defeito, monta
    o laudo eletrônico e aperta o botão de confirmar *(o nome desse botão
    ainda não foi definido)*.
11. O laudo dispara no grupo **LAUDISON.IO** e é enviado ao cliente.

> [!important] O reparo só existe a partir do clique
> O botão **Iniciar Reparo** é o marco: antes dele não há reparo nenhum no
> sistema. Por isso ele é exclusivo do perfil Técnico — ver
> [Quem pode o quê](#quem-pode-o-quê).

Hoje o laudo é digitado manualmente no sistema. A intenção é que no futuro
ele nasça no Claude e entre nos dois lugares de uma vez, mas isso ainda não
existe.

---

## Etapa 2 — Aguardando aprovação

12. O cliente responde.

13. **Se aprovou:** o **vendedor** marca `LAUDO APROVADO`. Isso dispara
    mensagem no grupo LAUDISON.IO, e a OS vai para a Etapa 3.

14. **Se reprovou:** o aparelho volta pela **mesma esteira** do reparo
    aprovado — não existe caminho separado para o laudo recusado:
    - o vendedor registra o **motivo da recusa**;
    - a loja pode **tentar comprar o aparelho como sucata**, dependendo do
      caso e do estado da peça;
    - o **técnico remonta** o aparelho;
    - o técnico aperta **REPARO CONCLUÍDO**, o mesmo botão do reparo normal;
    - a OS vai para a **Etapa 5 — Finalizado** e o aparelho fica na loja
      aguardando retirada.

    Na retirada, o cliente paga os R$ 80 do laudo em vez do valor do serviço.

O registro do motivo não é burocracia: é o que permite saber depois se o
cliente recusou por preço, por prazo, ou porque decidiu comprar outro
aparelho. Sem isso, todo "não" vira o mesmo "não".

> [!note] Por que isso importa para quem for programar
> O laudo recusado **não** é um beco sem saída: ele reentra no fluxo normal e
> sai pela mesma porta. Não é preciso criar coluna nem caminho especial para
> ele — basta permitir que o técnico remonte e conclua uma OS que nunca
> chegou a ter reparo aprovado.

---

## Etapa 3 — Execução · dono: TÉCNICO

15. O técnico vê a OS na aba Execução.
16. Aperta o botão **INICIAR A EXECUÇÃO**.
17. Executa o reparo.
18. Aperta o botão **REPARO CONCLUÍDO**.
19. Grava o **vídeo de teste** do aparelho.
20. Encaminha o vídeo.
21. O status vai para **FINALIZADO**.
22. Coloca o aparelho no Portal, de volta para a loja.

Depois, na loja:

23. O **vendedor** pega o aparelho, dispara as mensagens para o cliente
    (avisando que ficou pronto e encaminhando o vídeo) e guarda o aparelho no
    **local sinalizado do depósito**.

O disparo das mensagens é manual hoje. Existe a intenção de automatizar.

---

## Entrega

24. O cliente vem buscar o aparelho.
25. Realiza o **pagamento**.
26. Ao pagar, o sistema marca **ENTREGUE automaticamente** — ninguém clica
    em nada.
27. **ENTREGUE** é o último status do Kanban.

Este é o único ponto de todo o processo em que o status muda sozinho. Em
todos os outros, alguém precisa lembrar de apertar um botão — e é justamente
por isso que este é o passo que menos vai falhar.

---

## Quem pode o quê

O processo tem quatro momentos em que alguém clica e o estado da OS muda de
verdade. Eles não são intercambiáveis entre os perfis:

| Ação | Quem faz | Por quê |
|---|---|---|
| Criar a OS | Vendedor | É quem recebe o cliente |
| **Iniciar Reparo** | **Só o Técnico** | O vendedor **não pode** ter esse botão no perfil dele |
| **Laudo Aprovado** | Vendedor | É quem fala com o cliente e recebe a resposta |
| Iniciar a Execução / Reparo Concluído | Técnico | É quem está com o aparelho na bancada |

O vendedor entra três vezes no processo (cria a OS, registra a aprovação,
avisa que ficou pronto) e o aparelho atravessa a passagem duas vezes (vai
pela Etapa 1, volta pela Etapa 3).

---

## O que a auditoria encontrou

Uma revisão do processo em quatro frentes, conferida contra a documentação da
empresa, encontrou **16 pontos** — 6 críticos, 5 importantes e 5 menores.
O relatório completo, com o trecho de documento que sustenta cada item, está
no link no topo deste documento. Os **seis críticos**, em resumo:

1. **"Laudo eletrônico" e "laudo" viraram a mesma palavra — e não são.**
   O que o serviço tabelado dispensa é a *análise paga de R$ 80*, não o
   *documento de entrega*. O `CLAUDE.md` raiz da empresa diz que **toda**
   ordem de serviço tem laudo. Do jeito que está mapeado, as OS mais comuns
   sairiam sem registro, sem técnico responsável e sem garantia escrita.

2. **A Etapa 2 tem duas saídas; o processo real tem quatro.** Faltam
   "reparo inviável" (quem decide é a loja) e "sem defeito / só preventiva".
   Hoje os dois seriam registrados como "cliente reprovou", o que é falso.

3. **Duas pessoas aprovam o mesmo laudo, em dois lugares.** O Telegram já
   tem botões que gravam status na planilha, e o mapeamento põe o vendedor
   marcando no sistema. O manual da assistência já admite o problema: *"os
   dois convivem sem reconciliação"*. Precisa escolher qual manda.

4. **Os nomes de status não batem — e agora dá para ver as três listas.**
   Conferindo o banco, ficou pior do que a auditoria supunha: são três
   vocabulários vivos ao mesmo tempo para a mesma OS.

   | Onde | Nomes |
   |---|---|
   | **Kanban do sisteminha** | Entrada/Análise · Aguardando aprovação · Aguardando Peça · Aprovado/Executar · Terceirizada · Finalizado · Entregue · Cancelado |
   | **Planilha e webhook** | Aberto · Aguardando aprovacao · Em execucao · Concluido · Entregue · Cancelado |
   | **Botões do Telegram** | Aprovado · Ag. Peça · Aguardando Aprovação · Reprovado |

   Só `Entregue`, `Cancelado` e `Aguardando aprovação` existem nos três.
   `Finalizado` (sistema) e `Concluido` (planilha) são a mesma coisa com
   nomes diferentes; `Terceirizada` e `Aguardando Peça` não existem na
   planilha; `Aberto` e `Em execucao` não existem no Kanban.
   **Fechar uma lista única antes de ligar o Kanban na planilha.**

5. ~~**"Aguardando peça" já existe e ficou de fora.**~~ **Já resolvido no
   sistema.** A auditoria apontou a falta, mas a coluna **2b Aguardando
   Peça** já existe no Kanban. O que ficou de fora foi o mapeamento falado,
   não o sistema. Continua valendo a parte da regra: o prazo prometido ao
   cliente só começa a contar no dia em que a peça chega (script 5.8).

6. **Reparo que vira avançado no meio da análise não avisa ninguém.**
   O prazo pula de 3 para até 30 dias e não há ponto no processo para
   reclassificar o caso nem avisar o balcão.

---

## O que ainda falta decidir

Nada disto está em nenhum documento da empresa — depende de decisão do Felipe:

- [ ] **Como funciona a etapa 4, Terceirizada?** Quem decide mandar o
      aparelho para fora, como se registra para onde ele foi e com quem,
      quem cobra o prazo do terceiro, e o que acontece quando ele volta.
      É a maior lacuna deste documento.
- [ ] O pós-venda (mensagem pedindo avaliação no Google) é coluna do Kanban
      ou roda por fora do quadro?
- [ ] Qual grupo recebe o vídeo de teste — o LAUDISON.IO ou outro?
- [ ] Qual o nome do botão que confirma o laudo e manda para o cliente?
- [ ] Entre o Telegram e o sistema, qual dos dois manda no status?
      (o item 3 da auditoria depende desta resposta)

Duas perguntas que estavam nesta lista **foram respondidas pelo próprio
sistema** ao conferir as migrations: `Finalizado` é a etapa **5** (não a 4),
e `Aguardando Peça` já existe como **2b**.

---

## De onde vem cada regra

O processo acima foi levantado com o Felipe. As regras de valor, prazo e
atendimento vêm de documentos que já existiam na empresa:

- `assistencia/treinamentos/prazos-e-laudos.md` — taxa de R$ 80, prazos,
  reparo simples x avançado, scripts de balcão, checklist do vendedor
- `assistencia/orcamento-atendimento/CLAUDE.md` — padrão do laudo, botões do
  Telegram, colunas do Registro de Laudos
- `brain/processes/laudo-tecnico.md` — campos obrigatórios do laudo, garantia
- `CLAUDE.md` (raiz da empresa) — padrão de atendimento e laudo obrigatório

Esses arquivos ficam no repositório da empresa, que é **separado** deste.

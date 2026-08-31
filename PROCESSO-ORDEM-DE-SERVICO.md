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

O número de etapas segue as colunas do Kanban do sistema.

| Etapa | Nome | Quem toca |
|---|---|---|
| 1 (parte A) | Balcão | Vendedor |
| 1 (parte B) | Assistência / Análise | Técnico |
| 2 | Aguardando aprovação | Vendedor registra a resposta |
| 3 | Execução | Técnico |
| — | Entrega | Vendedor |
| — | **Entregue** | último status do Kanban |

Repare que a Etapa 1 é uma etapa só, com duas metades: o vendedor no balcão
**e** o técnico na análise. As duas juntas formam a Etapa 1.

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

14. **Se reprovou:** o vendedor **registra o motivo da reprovação**, a loja
    cobra os R$ 80 na retirada e o cliente retira o aparelho.

O registro do motivo não é burocracia: é o que permite saber depois se o
cliente recusou por preço, por prazo, ou porque decidiu comprar outro
aparelho. Sem isso, todo "não" vira o mesmo "não".

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

4. **Os nomes de status não batem.** O mapeamento usa `FINALIZADO`; a
   planilha e a automação usam `Aberto / Aguardando aprovacao / Em execucao /
   Concluido / Entregue / Cancelado`. E faltam `Aberto` e `Cancelado` no
   fluxo. **Fechar uma lista única de status antes de programar o Kanban.**

5. **"Aguardando peça" já existe e ficou de fora.** A regra está no
   treinamento do balcão (script 5.8) e o botão *Ag. Peça* já roda no
   Telegram. Não é decisão nova — é trazer o que já existe.

6. **Reparo que vira avançado no meio da análise não avisa ninguém.**
   O prazo pula de 3 para até 30 dias e não há ponto no processo para
   reclassificar o caso nem avisar o balcão.

---

## O que ainda falta decidir

Nada disto está em nenhum documento da empresa — depende de decisão do Felipe:

- [ ] O pós-venda (mensagem pedindo avaliação no Google) é coluna do Kanban
      ou roda por fora do quadro?
- [ ] `FINALIZADO` é a etapa 4? E se virar `Concluído` para bater com a
      planilha, o número da etapa muda?
- [ ] Qual grupo recebe o vídeo de teste — o LAUDISON.IO ou outro?
- [ ] Qual o nome do botão que confirma o laudo e manda para o cliente?
- [ ] Entre o Telegram e o sistema, qual dos dois manda no status?
      (o item 3 da auditoria depende desta resposta)

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

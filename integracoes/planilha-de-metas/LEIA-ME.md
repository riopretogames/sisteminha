# Robô da planilha de metas

A planilha **Metas RPG** (Google Drive) é a fonte das metas da loja desde
23/09/2026 — decisão do Felipe: *"se alterar os dados da planilha, alterar os
dados aí no sistema"*. Este robô é o que faz isso acontecer.

## Como funciona, em uma frase

Alguém edita a aba **METAS DA LOJA** ou **CAMPANHAS** → o robô dentro da
planilha lê as abas e manda os números para o sisteminha → o sisteminha confere
tudo e grava de uma vez só (ou grava a planilha inteira, ou não grava nada) →
**Cadastros › Metas** e o **Dashboard de Metas** passam a mostrar.

Além disso, todo dia às 6h ele reenvia tudo, por garantia.

## As peças

| Peça | Onde mora | O que faz |
|---|---|---|
| O robô | Dentro da planilha, em Extensões › Apps Script. A cópia de referência é o `Codigo.gs` desta pasta | Lê as abas e manda os números |
| A porta do servidor | `supabase/functions/sincronizar-metas/` | Confere o código de acesso e entrega para o banco |
| A função do banco | `aplicar_metas_da_planilha`, na migration `20260923140000` | Confere cada número e grava, numa transação só |
| A tela | Cadastros › Metas | Mostra as metas e diz quando a planilha chegou por último — e, se falhou, por quê |

## Instalar (ou reinstalar) o robô

1. Abra a planilha **Metas RPG 2026** › **Extensões** › **Apps Script**.
2. Apague o que estiver lá, cole o conteúdo inteiro de `Codigo.gs`, salve.
3. Volte na planilha e aperte **F5**. Aparece o menu **Sisteminha**.
4. **Sisteminha › Configurar conexão** › cole o código de acesso.
5. O Google avisa "não verificou este app" — é normal para robô de uso próprio:
   **Avançado › Acessar › Permitir**.

## O código de acesso

É o que prova para o sisteminha que quem está mandando metas é o robô da
planilha. Fica em **três** lugares, e em nenhum outro:

- nos segredos do servidor do Supabase (`METAS_SYNC_SECRET`);
- nas propriedades do robô, dentro da planilha (o menu *Configurar conexão*
  grava lá — não aparece no código nem nas células);
- no arquivo `.env.planilha-metas`, na pasta do sisteminha deste computador —
  que **não** vai para o git (o `.gitignore` barra qualquer `.env*`).

Não mande por WhatsApp nem cole em documento: quem tiver o código consegue
mudar as metas do sistema (só as metas — ele não abre nada além disso).

Um cuidado: qualquer pessoa com permissão de **editar** a planilha consegue
abrir o Apps Script e ler o código. Então só quem pode editar metas deve ter
acesso de edição à planilha — o que já é o certo, porque editar a planilha é
mudar a meta. E o campo "enviado por" que aparece em Cadastros › Metas é
informado pelo próprio robô: serve para orientar, não é prova de quem mandou.

### Trocar o código (se vazar, ou por precaução)

1. Gere um novo (64 caracteres, só números e letras de a até f) e grave no
   servidor. No computador da loja, na pasta do sisteminha:
   ```
   python -c "import secrets; print(secrets.token_hex(32))"
   npx.cmd supabase secrets set METAS_SYNC_SECRET=<o código que saiu na linha de cima>
   ```
2. Atualize o arquivo `.env.planilha-metas` com o novo código.
3. Na planilha: **Sisteminha › Configurar conexão** e cole o novo.

O antigo para de funcionar na hora do passo 1.

## Quando dá erro

O aviso aparece no canto da planilha e em **Cadastros › Metas**, sempre em
português e dizendo o mês e a faixa — por exemplo *"Em outubro, a faixa Prata é
menor que a anterior. As faixas precisam subir."*. Corrija na planilha e o robô
manda de novo sozinho. Enquanto isso, o sistema continua com a última versão
que deu certo: **nada é gravado pela metade**.

Quando o robô **nem consegue ler** a planilha (coluna renomeada, aba apagada),
ele avisa o sistema do mesmo jeito, e o aviso aparece em Cadastros › Metas. Se
for o **envio das 6h** que falhar, o Google também manda um e-mail para a conta
que instalou o robô. E se a planilha passar **mais de um dia** sem chegar,
Cadastros › Metas avisa — o robô reenvia tudo todo dia, então um dia inteiro sem
chegar é sinal de que algo parou.

O que o robô recusa na leitura, antes de mandar:

- **Ano diferente** no título da aba e no nome da planilha (a cópia para 2027
  com o título esquecido gravaria 2027 por cima de 2026).
- **Coluna repetida** ou **faltando** (as colunas são achadas pelo nome exato).
- **Erro de fórmula** (#REF!, #N/A…) numa meta, e valor digitado como texto
  fora do formato brasileiro ("1500.50" com ponto viraria uma meta cem vezes
  maior).
- **Número de vendedores** que não seja inteiro ("2+1", "—").
- **Aba CAMPANHAS sumida** ou sem nenhum bloco reconhecível.

A coluna **Ano passado** é só referência e nunca trava o envio: um "—" ou um
#N/A ali vira vazio.

O que o sisteminha recusa, e por quê:

- **Faltar mês** (tem que vir os 12) — pedido com menos meses é sinal de
  leitura quebrada, e aplicar pela metade apagaria meses bons.
- **Lista de campanhas vazia** — quase sempre é leitura quebrada, e aplicar
  apagaria todas as campanhas. A exceção é quando a planilha diz que as
  campanhas estão **suspensas** (ver abaixo): aí é decisão, e o sistema aceita.
- **Faixa fora de ordem** (Prata menor que Bronze) — quase sempre é dedo
  escorregado, e vira prêmio errado.
- **Valor negativo**, **número de vendedores** fora de 0 a 50, **apuração**
  que não seja "Quinzenal" nem "4 períodos".

## Suspender uma campanha

Escreva **SUSPENSO** no título do bloco, na aba CAMPANHAS — do jeito que já está
o do Gerente. Por exemplo: `🎧 ACESSÓRIOS — SUSPENSO desde 01/11/2026`. No
próximo envio a campanha sai do sistema e do Dashboard de Metas. Para voltar,
apague o SUSPENSO do título.

Pode suspender todas de uma vez: o robô avisa o sistema de que foi de
propósito, e ele aceita a lista vazia. O que o sistema não aceita é a lista
vazia **sem** o aviso — aí é leitura quebrada (bloco apagado, cabeçalho
renomeado) e ele segura as campanhas que já tinha.

## Virada do ano

A planilha é de um ano só (**Metas RPG 2026**). Para 2027:

1. No Drive, **Arquivo › Fazer uma cópia** da planilha de 2026 e dê o nome
   **Metas RPG 2027**.
2. Na cópia, troque o ano no **título da aba METAS DA LOJA** e preencha as
   metas novas. O robô confere que o nome do arquivo e o título dizem o mesmo
   ano — se um dos dois ficar com 2026, ele recusa em vez de gravar 2027 por
   cima de 2026.
3. Na cópia, rode **Sisteminha › Configurar conexão** e cole o código de acesso.
   A cópia leva o robô junto, mas o Google **não** copia os gatilhos (o envio
   ao editar e o das 6h): sem este passo, a planilha de 2027 não manda nada.

A planilha de 2026 para de mandar sozinha às 6h a partir de 1º de janeiro — de
propósito, para não esconder uma falha da de 2027. Se precisar corrigir
dezembro, é só editar a de 2026: a edição continua sendo enviada.

Em **Cadastros › Metas**, a situação mostrada é sempre a da planilha do ano
corrente. Em janeiro, enquanto a de 2027 não chegar, a tela avisa "A planilha
de 2027 ainda não chegou".

## Instalar pela conta certa

Os gatilhos do robô (o de edição e o das 6h) pertencem à conta do Google que
rodou *Configurar conexão*. Se outra conta rodar de novo, cria um segundo envio
automático — por isso o robô avisa quem instalou e pede confirmação. O certo é
instalar sempre pela mesma conta (a dona da planilha).

**Instalado em 24/09/2026 pela conta contato@riopretogames.com.br**, com a
primeira carga às 13h13 (48 faixas e as duas campanhas). Para reinstalar, use
sempre essa conta.

## O que o sistema ainda não sabe

As campanhas não têm data de início: o sistema guarda só a régua **atual** da
planilha e a aplica a qualquer mês. Até setembro/2026, Acessórios e Jogos eram
apurados por mês (com meta e prêmio em dobro); a régua quinzenal vale de
outubro/2026 em diante. Para meses antigos, a régua de campanha mostrada no
painel pode não ser a que valeu.

## O que o robô lê — e o que deixa de fora de propósito

Ele acha as colunas **pelo nome** (MÊS, Bronze, Prata, Ouro, Diamante,
Vendedores, Apuração, Ano passado), então inserir coluna ou linha na planilha
não quebra nada. Na aba CAMPANHAS, vira campanha todo bloco com cabeçalho
**Faixa + Meta + Prêmio** (hoje: Acessórios e Jogos). Cada campanha é ligada ao
**Grupo de Produto** de mesmo nome (sem acento e sem plural: "ACESSÓRIOS" acha
"Acessório").

Ficam só na planilha, porque o sistema ainda não acompanha: **Película e Grip**
(a regra é por unidade), **Monday** (é tarefa, não venda) e o prêmio de
**Gerente** (suspenso desde 03/09/2026).

## Uma planilha só (resolvido em 24/09/2026)

Em 23/09/2026 havia **duas** planilhas de metas idênticas: a do Drive e uma
cópia em Excel na área de premiações. Em 24/09 o Felipe decidiu que a oficial é
a do **Drive**. A cópia foi arquivada em `financeiro/historico/`, e o
`premiacoes/ferramentas/gerar-metas.py` passou a ler direto do Drive. Hoje a
mesma planilha alimenta o sisteminha (por este robô) e as premiações.

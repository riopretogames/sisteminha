# Roteiro de Teste — RP System.IO
### Para o Felipe percorrer na tela, na ordem de um dia de loja

**Tempo estimado: 2h30 a 3h.** São 41 passos, divididos em 11 blocos. Dá para parar no fim de qualquer bloco e voltar depois — só não pare no meio de um bloco, porque um passo usa o que o anterior criou.

Leve papel e caneta: em vários passos você vai precisar **anotar um número antes** (estoque, saldo do caixa, faturamento) para comparar depois.

---

## Antes de começar

1. Abra o programa que roda o sistema (terminal) na pasta do sisteminha e rode:
   ```
   npm run dev
   ```
2. Espere aparecer o endereço e abra no navegador: **http://localhost:8080**
3. Faça login com o seu usuário (o de dono/administrador).

**Sobre a massa de teste:** o banco já tem clientes, produtos e ordens de serviço criados de propósito para este teste, marcados com **[SEED-TESTE-21-08]**. São eles: os clientes *Adriana Prado*, *Bruno Tavares*, *Elaine*, *Fabio* e *Joao Vitor Passos* (esse está **bloqueado de propósito**), 10 produtos (PlayStation 5, Xbox Series S, Nintendo Switch OLED, controle, headset, cabo HDMI, SSD, Echo Dot, teclado, mouse) e algumas OS, sendo 3 já atrasadas.

Não precisa apagar nada no fim. Tudo que você criar aqui é teste, e o sistema ainda não está em uso na loja.

**Marcação usada no roteiro:**
> **[CORREÇÃO RECENTE]** — passo que testa algo que estava quebrado e foi consertado agora. São os que têm mais chance de falhar. Se o tempo apertar, priorize estes.

---

## Bloco 1 — Abrir o sistema e ver se a base está de pé

- [ ] **1. A lista de produtos abre e mostra tudo**
  **O que fazer:** No menu lateral, abra **Estoque > Produtos**. Olhe o painel laranja **Filtros** no topo: o campo **Apto à Venda** tem que estar em **Sim**. Confira se aparecem os 10 produtos da massa de teste.
  **Tem que acontecer:** A tabela carrega com as colunas Produto, Categoria, Custo, Preço, Margem, Estoque, Local. O contador do painel laranja mostra o mesmo número de linhas que você conta na tabela. Se algum produto estiver no mínimo ou abaixo, aparece em cima um cartão amarelo **Estoque Crítico** dizendo quantos são.
  *Por que importa: é a tela que a loja abre o dia inteiro; se vier vazia, ninguém consulta preço nem confere prateleira.*

- [ ] **2. Vendedor não vê Custo nem Margem — e a tela não pode ficar em branco** **[CORREÇÃO RECENTE]**
  **O que fazer:** Abra **Cadastros > Usuários** e veja se existe alguém com o perfil **Vendedor**. Se existir um login de Vendedor que você consiga usar, saia da sua conta e entre com ele. Abra **Estoque > Produtos**, depois **Estoque > Movimentações** e **Estoque > Estoque Crítico**. Depois volte para a sua conta. *(Se não existir usuário Vendedor, pule e me avise.)*
  **Tem que acontecer:** Em Produtos a tabela carrega normalmente, mas **sem** as colunas Custo e Margem — só Produto, Categoria, Preço, Estoque e Local. Em Movimentações some a coluna Valor. Em Estoque Crítico, o último quadrinho mostra "Valor em venda" no lugar de "Custo para repor tudo". Em nenhuma delas a tela pode ficar branca ou dar erro.
  *Por que importa: essa era a pior — para Vendedor e Técnico a tela de estoque ficava totalmente em branco, e eles não conseguiam nem consultar preço para o cliente.*

---

## Bloco 2 — Cadastro de cliente (o que o balcão faz o dia inteiro)

- [ ] **3. Cadastrar cliente só com o nome**
  **O que fazer:** Abra **Cadastros > Clientes** e clique em **Novo Cliente**. Preencha SÓ o campo **Nome completo \*** com `Teste Balcao 21-08` e clique em **Cadastrar**. Não preencha mais nada.
  **Tem que acontecer:** Aviso verde "Cliente cadastrado! — Teste Balcao 21-08 foi salvo com sucesso.", a janela fecha sozinha e o cliente aparece na lista, com um traço (—) na coluna CPF/CNPJ e nada em Contato. Nenhuma mensagem vermelha de campo obrigatório.
  *Por que importa: é o cadastro de fila — se o sistema exigir CPF ou telefone, o vendedor com cliente esperando desiste e a venda sai sem cliente nenhum.*

- [ ] **4. Cliente repetido: CPF e telefone recusam, nome igual só avisa**
  **O que fazer (três tentativas seguidas, todas em Novo Cliente):**
  a) Nome `Adriana Teste`, CPF `910.000.000-01`, aperte **Tab**. Olhe o topo da janela e o botão Cadastrar. Clique em **Usar este cadastro**.
  b) Novo Cliente de novo: nome `Teste Telefone`, telefone `17910000001`, **Tab**. Olhe o topo. Clique em **Cancelar**.
  c) Novo Cliente de novo: nome exatamente `Bruno Tavares`, **Tab**, sem CPF nem telefone. Olhe o topo. Clique em **Cancelar**.
  d) Por fim, no campo de busca da lista de clientes digite `91000000001`, depois `910.000.000-01`, depois `17910000001`.
  **Tem que acontecer:** Em (a) e (b), tarja **VERMELHA** "Este cliente já está cadastrado" apontando *Adriana Prado — mesmo CPF/CNPJ* / *mesmo telefone*, com o botão **Cadastrar apagado** (não clica); "Usar este cadastro" abre a ficha da Adriana Prado. Em (c), tarja **AMARELA** "Já existe alguém com esse mesmo nome" e o botão **Cadastrar continua ativo**. Em (d), as três buscas trazem a mesma Adriana Prado — a pontuação digitada não pode fazer diferença.
  *Por que importa: cliente duplicado quebra histórico, garantia e cobrança; e se a busca exigir a pontuação exata, o atendente não acha e cadastra a mesma pessoa de novo.*

- [ ] **5. Item novo numa Lista do Sistema aparece sozinho no cadastro — e desativar não apaga o antigo**
  **O que fazer:** Abra **Cadastros > Listas do Sistema**, aba **Cliente** (a lista *Origens do Cliente* já vem selecionada). Digite `TikTok Teste` e aperte Enter. Clique em **Tornar padrão** ao lado dele. Vá em **Cadastros > Clientes > Novo Cliente**, role até **Relacionamento** e olhe o campo **Como conheceu a loja**; preencha o nome `Teste TikTok 21-08` e **Cadastrar**. Agora volte em Listas do Sistema e **desligue a chavinha** do "TikTok Teste". Volte em Clientes, ache `Teste TikTok 21-08`, três pontinhos > **Editar**, role até "Como conheceu a loja". Feche em **Cancelar** e abra um **Novo Cliente** para olhar a mesma lista.
  **Tem que acontecer:** "TikTok Teste" entra na lista na hora, sem recarregar a página, e ganha etiqueta **Padrão** com estrela. No cadastro de cliente novo, o campo já vem preenchido com "TikTok Teste" sem você escolher nada, e depois de salvar a coluna "Como conheceu" mostra isso. Depois de desativado: **na ficha do cliente antigo o campo continua mostrando "TikTok Teste"**, mas num cliente novo ele não aparece mais entre as opções.
  *Por que importa: se precisar de programador para acrescentar uma origem, o cadastro congela e todo mundo passa a usar "Outro" — e se a escolha antiga sumir ao editar, o relatório de mídia passa a mentir.*

---

## Bloco 3 — Estoque e produtos

- [ ] **6. Cadastrar produto novo e ver a entrada registrada**
  **O que fazer:** Em **Estoque > Produtos**, clique em **Novo Produto**. Nome `TESTE 21-08 Fone Bluetooth`, Marca `JBL`, Custo `100`, Preço `150`, Estoque Atual `5`, Estoque Mínimo `2`. Clique em **Cadastrar**. Depois abra **Estoque > Movimentações** (o período já vem no mês atual) e procure a linha desse produto.
  **Tem que acontecer:** Aviso verde "Produto cadastrado!", o produto aparece na lista com Preço R$ 150,00, Margem 50,0% em verde e Estoque 5 (antes de salvar, o quadrinho "Margem" dentro da caixa já mostrava 50,0% sozinho). Em Movimentações existe uma linha com etiqueta verde **Entrada**, quantidade **+5 em VERDE**, motivo "Cadastro inicial" e Saldo depois 5.
  *Por que importa: produto salvo torto entra sem preço e alguém vende por R$ 0; e estoque que aparece do nada, sem registro, torna impossível achar erro de contagem depois.*

- [ ] **7. Editar a ficha completa e mudar a quantidade pela ficha**
  **O que fazer:** Clique em cima da linha do `TESTE 21-08 Fone Bluetooth` (a linha inteira abre a ficha). Mude o **Preço** para `180`, escolha Grupo, Marca, Cor e Condição no bloco **Catálogo**, escreva algo em **Observações**. No bloco **Preços e Estoque**, troque Estoque Atual de 5 para `3` e Estoque Mínimo de 2 para `5`. Clique em **Salvar** e desça até **Movimentações recentes**, no pé da página. Depois clique em **Voltar** e reabra a ficha.
  **Tem que acontecer:** Aviso "Produto atualizado!". No bloco de baixo aparece uma linha nova com etiqueta azul **Ajuste**, quantidade **-2 em VERMELHO**, motivo "Ajuste manual" e Saldo 3. Na lista, o Preço virou R$ 180,00 e a marca aparece embaixo do nome. Reabrindo a ficha, **tudo que você escolheu continua lá** — não pode voltar em branco.
  *Por que importa: se o catálogo não gravar, cada edição apaga em silêncio o que alguém preencheu; e correção de contagem sem rastro é o jeito clássico de sumir mercadoria.*

- [ ] **8. Estoque Crítico e reposição rápida**
  **O que fazer:** Abra **Estoque > Estoque Crítico** e procure o `TESTE 21-08 Fone Bluetooth` (ficou com 3 de atual e 5 de mínimo). Clique em **Repor** na linha dele, troque a quantidade sugerida para `3` e clique em **Confirmar reposição**.
  **Tem que acontecer:** Antes: aparece com Atual 3, Mínimo 5, Faltam 2 e triângulo amarelo de alerta; os quadrinhos do topo mostram "Produtos em alerta", "Zerados", "Peças faltando" e "Custo para repor tudo". Depois: aviso "Estoque reposto!" e o produto **sai da lista** (ficou com 6, acima do mínimo). Na ficha dele, um **Ajuste +3** em verde com motivo "Reposição de estoque".
  *Por que importa: é essa lista que diz o que comprar; se ela mentir, a loja fica sem produto ou compra o que já tem.*

- [ ] **9. Tirar um produto da venda (Apto à Venda desligado)**
  **O que fazer:** Abra de novo a ficha do `TESTE 21-08 Fone Bluetooth`, desça até **Disponibilidade** e **desligue a chavinha "Apto à Venda"**. Salve e clique em **Voltar**. Procure o produto na lista. No painel laranja de Filtros, mude **Apto à Venda** para **Não**. Por último abra **Venda > Nova Venda (PDV)** e tente buscar esse produto.
  **Tem que acontecer:** Com o filtro em "Sim" (padrão) o produto sumiu da lista. Com o filtro em "Não", ele aparece com etiqueta cinza **Inativo** ao lado do nome. No PDV, ele **não aparece** na busca.
  *Por que importa: é o freio para não vender aparelho quebrado, reservado ou ainda não revisado.*

---

## Bloco 4 — Vender (o coração da loja)

- [ ] **10. Deixar o caixa FECHADO antes de começar**
  **O que fazer:** Abra **Financeiro > Caixa**. Se aparecer o cartão **Abrir caixa** com "Nenhum caixa aberto no momento", está pronto — não faça mais nada aqui. Se aparecer a tela do caixa aberto (com **Lançar movimento** e **Fechar caixa**), clique em **Fechar caixa**, digite qualquer valor em "Quanto tem na gaveta agora?", clique em **Conferir e fechar** e volte a esta tela.
  **Tem que acontecer:** A tela termina mostrando o cartão **Abrir caixa**, campo "Valor inicial na gaveta" vazio.
  *Por que importa: sem partir de caixa fechado, o próximo passo (o caixa abrir sozinho na venda) não tem como acontecer.*

- [ ] **11. Venda simples do começo ao fim, em dinheiro**
  **O que fazer:** Abra **Venda > Nova Venda (PDV)**. Antes, anote quanto tem de estoque do **Echo Dot**. No campo de busca digite `Echo Dot` e clique no cartão do produto (ele vai para o carrinho, à direita). No topo do carrinho clique no botão **Cliente** e escolha **Adriana Prado**. Clique em **Finalizar Venda**, clique no atalho **Dinheiro** (ele preenche o valor que falta) e depois em **Confirmar Venda**. **Anote o número da venda.**
  **Tem que acontecer:** Aviso verde "Venda finalizada! — Venda VD-… registrada com sucesso". A janela fecha, o carrinho volta a dizer "Carrinho vazio", o botão volta a dizer só "Cliente", e o numerozinho cinza no canto do cartão do produto (o estoque) **diminuiu 1**.
  *Por que importa: é o que a loja faz 50x por dia — se falhar, não dá para vender nada e o estoque não desconta.*

- [ ] **12. Depois da primeira venda: o caixa abriu sozinho e a venda está no histórico** **[CORREÇÃO RECENTE]**
  **O que fazer:** Abra **Financeiro > Caixa**. Depois abra **Venda > Histórico de Vendas** e clique na primeira linha da lista.
  **Tem que acontecer:** No Caixa, ele agora está **ABERTO sozinho**, com tarja amarela *"Este caixa foi aberto pelo sistema, não por uma pessoa"* explicando que abriu na primeira venda do dia. O quadro **Abertura** mostra R$ 0,00 com a observação "Automática — gaveta não contada", e em **Movimentos do expediente** existe uma linha verde "Venda VD-…" com o valor da venda. **Anote o "Saldo esperado".** No Histórico, a primeira linha traz o número, data/hora de agora, "Adriana Prado", seu nome como vendedor e etiqueta verde **pago**; clicando nela abre a janela "Venda V____" com o produto em *Produtos* e "Dinheiro" em *Pagamentos*.
  *Por que importa: antes, vender com o caixa fechado fazia o dinheiro sumir da conferência em silêncio — foram R$ 22 mil vendidos sem um único lançamento no caixa.*

- [ ] **13. Cliente bloqueado é recusado com aviso claro** **[CORREÇÃO RECENTE]**
  **O que fazer:** Volte ao PDV, clique num produto qualquer para jogar no carrinho. Clique em **Cliente**, digite `Joao` na busca e clique na linha do **Joao Vitor Passos**.
  **Tem que acontecer:** Antes mesmo de clicar, a linha dele já vem com ícone vermelho de proibido e etiqueta vermelha **Bloqueado**. Ao clicar, aviso vermelho *"Cliente bloqueado — Joao Vitor Passos está bloqueado para venda. Libere na ficha dele em Cadastros > Clientes."* A janela **continua aberta** e o nome **não entra** no carrinho.
  *Por que importa: bloqueio descoberto tarde vira venda recusada pelo banco no fim, com o carrinho montado e o cliente esperando.*

- [ ] **14. Cancelar o pagamento tem que jogar tudo fora** **[CORREÇÃO RECENTE]**
  **O que fazer:** Com um produto no carrinho, clique em **Finalizar Venda**. Lance um pagamento à mão: escolha **Dinheiro**, digite `50` no Valor e clique no **+**. Depois, em **Produto recebido em troca**, clique em **Adicionar**, escreva `Teste descarte` na descrição, valor de entrada `100`, e clique no **+** dessa parte. Agora clique em **Cancelar** no rodapé. Troque o cliente do carrinho para outra pessoa e clique em **Finalizar Venda** de novo.
  **Tem que acontecer:** A janela reabre **ZERADA**: nenhum pagamento de R$ 50,00, nenhum "Teste descarte" em produto recebido em troca, "Total pago" em R$ 0,00 e "Falta" em vermelho igual ao total. O carrinho e o cliente continuam como estavam (isso é de propósito).
  *Por que importa: antes isso sobrevivia para a venda do PRÓXIMO cliente — entrava no estoque um produto usado que nunca existiu e no caixa uma forma de pagamento errada.*

- [ ] **15. Pagamento: falta trava, duas formas somam, e o troco aparece** **[CORREÇÃO RECENTE]**
  **O que fazer:** Com um produto no carrinho (anote o Total), clique em **Finalizar Venda**. (a) Lance **Dinheiro R$ 10,00** e olhe o rodapé e o botão Confirmar. (b) Agora clique no atalho **Cartão**. (c) Por fim lance mais um pagamento em Dinheiro de valor bem maior que o total (ex.: R$ 5.000,00) e olhe o rodapé.
  **Tem que acontecer:** (a) "Falta" em vermelho e o botão **Confirmar Venda apagado** (não clica). (b) A lista mostra **DUAS linhas** — Dinheiro R$ 10,00 e Cartão Crédito com exatamente o que faltava; **a linha do Dinheiro NÃO some**. (c) Some o "Falta" e aparece **Troco** em verde com a diferença certa, e o Confirmar fica clicável. Pode confirmar a venda; no Histórico ela mostra os dois pagamentos.
  *Por que importa: o atalho já apagou pagamento lançado à mão — a venda inteira ia registrada como cartão e o dinheiro da gaveta não batia no fim do dia.*

- [ ] **16. Venda com desconto, paga em PIX — e o PIX não mexe na gaveta**
  **O que fazer:** Coloque um produto no carrinho e anote o preço. No rodapé do carrinho, no campo **Desconto (R$)**, digite `100`. Finalize com **PIX Total** e **Confirmar Venda**. Depois olhe o valor no **Histórico de Vendas** e vá em **Financeiro > Caixa** olhar o "Saldo esperado" e a tabela **Resumo do dia por forma de pagamento**.
  **Tem que acontecer:** Ao digitar o desconto, o carrinho mostra três linhas: **Subtotal** com o preço cheio, **Desconto** em vermelho ("-R$ 100,00") e **Total** já abatido. O "PIX Total" lança o valor **já com desconto**, e é esse valor que aparece no histórico. No Caixa, o **Saldo esperado NÃO mudou**; na tabela de baixo aparecem Dinheiro com etiqueta verde "Dinheiro físico" e PIX com o texto "Não entra".
  *Por que importa: desconto que não entra na conta cobra a mais do cliente; e PIX contado na gaveta faz todo fechamento acusar falta de dinheiro que nunca esteve lá.*

- [ ] **17. Não deixar vender mais do que tem — e achar produto pelos filtros**
  **O que fazer:** No PDV, olhe o numerozinho cinza no canto de um cartão de produto (é o estoque). Clique nesse cartão mais vezes do que o número mostra, e tente também o **+** da linha dentro do carrinho. Depois limpe o carrinho, deixe a busca vazia e use o painel de filtros (Categoria, Marca, Cor, Condição, Memória, Preço De/Até): escolha uma **Categoria** e digite `1000` no campo **De** do Preço. Por fim clique em **Limpar filtros**.
  **Tem que acontecer:** Aviso vermelho **"Estoque insuficiente — Apenas X unidades disponíveis"** e a quantidade no carrinho **para** no número que existe. Nos filtros, a vitrine vai encurtando; o botão "Limpar filtros" mostra uma bolinha com a quantidade de filtros ligados (2) e, ao clicar, tudo volta e as caixinhas voltam para "Todos".
  *Por que importa: vender o que não tem gera estoque negativo; e vitrine sem filtro trava o atendimento quando o catálogo cresce.*

- [ ] **18. Entrada de produto por troca no PDV: entra no estoque, mas travado**
  **O que fazer:** No PDV, coloque o **PlayStation 5 Slim 1TB** no carrinho, escolha o cliente **Bruno Tavares** e clique em **Finalizar Venda**. Em **Produto recebido em troca** clique em **Adicionar**, descrição `PlayStation 4 Slim 500GB`, preencha Tipo/Marca se quiser, **Valor de entrada (R$)** `1200`, e clique no **+**. Depois clique em **Dinheiro** para cobrir o que falta e em **Confirmar Venda**. No aviso verde, clique em **Revisar produto**. Depois abra **Estoque > Produtos**.
  **Tem que acontecer:** Antes de confirmar, o resumo mostra "Entrada de produto R$ 1.200,00" e o "Falta" já desconta esse valor. Depois, o botão **Revisar produto** abre a ficha do PlayStation 4 recém-criado: **estoque 1, preço R$ 0,00 e a chavinha "Apto à Venda" DESLIGADA**. Em Estoque > Produtos aparece em cima um **cartão azul "Aguardando revisão"** (clicando nele, o filtro muda sozinho para Apto à Venda: Não e o produto aparece com etiqueta azul). O PS4 **não aparece** no PDV enquanto ninguém precificar. Se você colocar preço e ligar o Apto à Venda, ele volta para a lista normal e o cartão azul some.
  *Por que importa: produto usado entrando já liberado e sem preço pode ser vendido por R$ 0,00 antes de alguém olhar se funciona — e sem o aviso azul ele fica perdido no sistema.*

---

## Bloco 5 — Troca e devolução

- [ ] **19. Devolução pura: cliente devolve e leva o dinheiro**
  **O que fazer:** Abra **Venda > Troca / Devolução**. Na busca digite o número da venda do Echo Dot (ou `Adriana`) e clique na linha. No quadro **2. O que está voltando?**, no campo **Devolver** da linha do Echo Dot digite `1`. Pule o quadro 3. No quadro **4. Acerto**, escolha **Dinheiro**, escreva no Motivo `cliente não gostou` e clique em **Confirmar devolução**.
  **Tem que acontecer:** No quadro 4, antes de confirmar, aparece **"Devolver ao cliente R$ 349,00"** em verde. Depois, aviso "Devolução registrada! DV-… — devolver R$ 349,00 ao cliente." e a tela volta sozinha para a lista de vendas.
  *Por que importa: é o caminho mais comum do balcão; conta errada é dinheiro entregue a mais ou a menos na mão do cliente.*

- [ ] **20. Depois da devolução: estoque, caixa e faturamento** **[CORREÇÃO RECENTE]**
  **O que fazer:** Abra **Estoque > Produtos** e confira o Echo Dot contra o número que você anotou. Abra **Estoque > Movimentações** e olhe as linhas de hoje. Abra **Financeiro > Caixa** e olhe os movimentos e o Saldo esperado. Abra o **Dashboard de Vendas** e olhe o cartão "Vendas Hoje".
  **Tem que acontecer:** O Echo Dot **voltou** ao número de antes da venda. Em Movimentações existem duas linhas dele: a da venda com etiqueta vermelha **Saída** e quantidade **-1 em VERMELHO** (nunca em verde com "+"), e a da devolução com etiqueta verde **Entrada**, **+1** em verde e motivo "Devolução de produto"; a coluna "Saldo depois" mostra o estoque cheio. No Caixa entrou uma linha **vermelha** "Devolução DV-… — cliente não gostou", valor **-R$ 349,00**, e o **Saldo esperado voltou** ao de antes da venda. No Dashboard, "Vendas Hoje" desconsidera essa venda. Em Histórico de Vendas a venda **continua** na lista (ela existiu de verdade) — o que não pode existir é o dinheiro dela na gaveta.
  *Por que importa: produto devolvido que não volta ao estoque some da prateleira digital; e dinheiro que saiu da gaveta e continua contado como faturamento faz o painel mentir.*

- [ ] **21. Não deixa devolver a mesma coisa duas vezes**
  **O que fazer:** Volte em **Venda > Troca / Devolução**, busque a mesma venda da Adriana Prado e clique nela.
  **Tem que acontecer:** No quadro 2 aparece *"Nada disponível pra devolver — Todos os itens desta venda já foram devolvidos antes."* e não existe campo nenhum para digitar quantidade.
  *Por que importa: sem essa trava, sai dinheiro em dobro da gaveta e entra estoque que nunca voltou.*

- [ ] **22. Troca por produto MAIS BARATO: a loja devolve a diferença** **[CORREÇÃO RECENTE]**
  **O que fazer:** Anote antes o estoque do **Headset HyperX Cloud II** e do **Teclado Mecanico RGB**. Em **Venda > Troca / Devolução**, busque `Elaine` e clique na venda dela (a que mostra o headset no quadro 2). Digite `1` em **Devolver**. No quadro **3. Vai levar produto novo no lugar?**, busque `Teclado` e clique no **Teclado Mecanico RGB**. No quadro 4 escolha **Dinheiro** e **Confirmar devolução**. Depois confira Estoque > Produtos, Estoque > Movimentações e Financeiro > Caixa.
  **Tem que acontecer:** No quadro 4: "Valor devolvido (itens que voltam) R$ 549,00", "Valor dos itens novos -R$ 279,90" e, em verde e negrito, **"Devolver ao cliente R$ 269,10"**. Depois: o headset **subiu 1** e o teclado **desceu 1**; em Movimentações o headset aparece como **Entrada +1** (motivo "Devolução de produto") e o teclado como **Saída -1 em VERMELHO** (nunca em verde com "+"); no Caixa entrou linha vermelha "Devolução DV-…" de **-R$ 269,10** e o Saldo esperado caiu exatamente isso.
  *Por que importa: o teclado saiu da loja de verdade — se aparecer como entrada, o estoque conta a história ao contrário e ninguém confia mais na tela.*

- [ ] **23. Troca por produto MAIS CARO: o cliente paga a diferença** **[CORREÇÃO RECENTE]**
  **O que fazer:** Anote o estoque do **Cabo HDMI 2.1 2m** e do **Mouse Gamer 16000 DPI**, e anote o **Faturamento** que está em Venda > Histórico de Vendas. Em **Troca / Devolução**, busque `Fabio` e clique na venda do Cabo HDMI. Digite `1` em Devolver. No quadro 3, busque `Mouse` e clique no **Mouse Gamer 16000 DPI**. No quadro 4 escolha **Dinheiro** e confirme. Depois confira Financeiro > Caixa, Histórico de Vendas e o estoque dos dois produtos.
  **Tem que acontecer:** No quadro 4 o rótulo muda para **"Cliente paga a mais"**, mostrando **R$ 140,00 em vermelho**, e a forma de pagamento passa a se chamar "(que o cliente vai pagar)". O aviso final diz "cliente pagou R$ 140,00 a mais". No Caixa entrou linha **VERDE** "Venda VD-…" de **R$ 140,00** (entrada, não saída). No Histórico aparece uma venda nova de R$ 199,90 (preço cheio do mouse), mas o indicador **Faturamento subiu apenas R$ 140,00** — não R$ 199,90. Cabo +1, mouse -1.
  *Por que importa: se o sistema inverter o sentido, a loja devolve R$ 140 em vez de receber; e se o preço cheio virar faturamento, a meta do mês vira ficção.*

---

## Bloco 6 — Assistência técnica (Ordens de Serviço)

- [ ] **24. Abrir uma OS completa, do jeito do balcão (e OS sem defeito não pode nascer)**
  **O que fazer:** Menu **Ordens de Serviço > Nova OS**. Primeiro, um teste rápido: escolha qualquer cliente, **não escreva nada** em "Problema informado pelo cliente" e **não marque** nenhum item em "Defeitos e sintomas" — clique em **Abrir OS**. Depois preencha de verdade: em **Dono do aparelho** escolha *Adriana Prado*; no bloco Equipamento escolha Equipamento, Marca, Modelo, Cor e Memória (se faltar opção, digite o nome novo dentro do próprio campo e cadastre na hora) e preencha IMEI / Nº de Série; escreva o problema relatado; ligue pelo menos um item em cada um dos três quadros do check-in (**Defeitos e sintomas**, **Itens do aparelho**, **Condições de entrada**); em Senhas preencha a **Senha digitada** e desenhe uma sequência na grade de 9 pontos. Deixe o prazo como veio e clique em **Abrir OS**.
  **Tem que acontecer:** Na tentativa vazia, aviso vermelho *"Falta o defeito — Marque um sintoma no checklist ou descreva o problema relatado"* e a OS **não** é criada. Na de verdade: aviso "OS criada!" com o número (formato OS-AAAAMM-0001) e a tela vai direto para a ficha. Na ficha, o aparelho aparece montado (marca + modelo, cor · memória, nº de série), o card **Check-in do aparelho** separa Sintomas relatados / Itens que vieram junto / Estado na entrada, a senha digitada aparece em destaque e o desenho aparece **numerado na ordem** em que foi feito. O card Aparelho mostra "Prazo prometido" com hoje + 3 dias e "Garantia: 90 dias".
  *Por que importa: é o check-in que protege a loja quando o cliente volta dizendo que deixou a fonte junto ou que a tela já estava trincada.*

- [ ] **25. Cliente bloqueado PODE abrir OS** **[CORREÇÃO RECENTE]**
  **O que fazer:** **Nova OS**, clique em "Dono do aparelho", digite `Joao` e escolha **Joao Vitor Passos**. Preencha só o defeito relatado e clique em **Abrir OS**.
  **Tem que acontecer:** Na busca, o nome dele vem com etiqueta **amarela "Bloqueado"**. Depois de escolhido, faixa amarela no card Cliente dizendo que ele está bloqueado para venda e explicando que **a OS pode ser aberta normalmente**. A OS é criada sem erro nenhum.
  *Por que importa: aparelho que já está na bancada precisa ser registrado; o que não pode é o bloqueio aparecer só depois do conserto pronto, na hora de cobrar.*

- [ ] **26. Lançar peça do estoque, serviço avulso e fechar o orçamento**
  **O que fazer:** Abra uma das OS de teste que ainda está em andamento. Anote antes, no Estoque, a quantidade do produto que vai usar. No card **Peças e serviços** clique em **Adicionar item** > aba **Peça do estoque**, escolha um produto com estoque, quantidade `2`, **Adicionar**. De novo em Adicionar item > aba **Serviço avulso**: `Mão de obra — troca de tela`, preço `150`, **Adicionar**. Volte ao Estoque e confira. Depois, na ficha, desça até **Valor do orçamento**, clique em **Usar soma dos itens (R$ …)**, **Salvar**, e aperte **F5**.
  **Tem que acontecer:** Ao lançar a peça: "Peça lançada! O estoque já foi descontado automaticamente" e o estoque cai **exatamente 2**. Os dois itens aparecem na tabela, com o rodapé separando "Peças: R$ …" e "Mão de obra: R$ …". A linha do serviço avulso tem lixeira vermelha; **a linha da peça NÃO tem lixeira nenhuma**. O orçamento é preenchido com a soma exata, aparece "Orçamento salvo!" e, depois do F5, **o valor continua lá**; o botão Salvar fica apagado enquanto nada mudou.
  *Por que importa: peça que não desconta é peça vendida duas vezes; e o valor do orçamento é o que vira a cobrança na entrega — se não gravar, a loja entrega o aparelho e não cobra nada.*

- [ ] **27. Mover a OS pelas etapas e ver quem mexeu**
  **O que fazer:** Na mesma OS, use o botão **Avançar para …** no topo e caminhe: Aguardando análise > Aguardando aprovação > Aprovado > **Finalizado**. Pare em Finalizado. Desça até o card **Histórico da OS**.
  **Tem que acontecer:** Cada clique mostra "Etapa alterada — OS movida para …" e a etiqueta colorida no topo muda junto. O Histórico lista todas as passagens, na ordem, com data e hora, de onde saiu, para onde foi e **o NOME de quem fez a mudança** — sem precisar dar F5.
  *Por que importa: sem o registro de quem moveu o quê, ninguém apura depois quem liberou um aparelho antes da hora.*

- [ ] **28. Entregar OS paga — o sistema cobra antes, e depois trava tudo**
  **O que fazer:** Na OS em Finalizado, clique no botão verde **Avançar para Entregue**. Na janela **Confirmar entrega**, tente confirmar **sem lançar nada**. Depois adicione um pagamento de metade do valor (escolha a forma, digite o valor, clique no **+**), veja o que muda, e adicione uma segunda forma cobrindo o resto **com um pouco a mais** (ex.: R$ 20 acima). Clique em **Confirmar entrega**. Depois olhe o card **Valor do orçamento**, o card **Peças e serviços**, e vá em **Financeiro > Contas a Receber**.
  **Tem que acontecer:** Sem pagamento, o botão fica apagado e a janela mostra **"Falta R$ …"** em vermelho; com a metade, o que falta diminui; com o valor a mais, aparece **Troco** em verde. Ao confirmar: "OS entregue! … pagamento registrado" e a etapa vira Entregue. Depois: o campo Valor fica **cinza** (não digita), some o Salvar e aparece *"Esta OS já foi entregue em <data e hora> — valor travado: R$ …"*; no card de peças somem o botão Adicionar item e as lixeiras. No Financeiro existe um título no **valor exato do orçamento**, no nome do cliente.
  *Por que importa: é o único ponto em que o dinheiro do conserto entra no sistema — e OS entregue é caso encerrado, senão a ficha e o Financeiro contam histórias diferentes.*

- [ ] **29. Reabrir OS entregue tem que pedir confirmação** **[CORREÇÃO RECENTE]**
  **O que fazer:** Na OS já entregue, use o seletor de etapa (ao lado do botão de avançar, mostra a etiqueta "Entregue") e escolha **Finalizado**. **Leia** a janela de confirmação e clique em **Cancelar**. Confira que nada mudou. Repita e, agora, clique em **OK**.
  **Tem que acontecer:** A janela avisa que a OS já foi entregue, diz **o valor exato que já está lançado no Financeiro**, avisa que a cobrança **CONTINUA lá** e que o orçamento volta a ser editável. Em Cancelar, tudo continua travado. Em OK, a etapa volta para Finalizado e o campo de valor volta a aceitar digitação.
  *Por que importa: reabrir sem aviso deixa a ficha mostrando um número e o Financeiro cobrando outro, sem nada na tela denunciando.*

- [ ] **30. OS cancelada também trava o valor** **[CORREÇÃO RECENTE]**
  **O que fazer:** Abra **outra** OS de teste em andamento (não a entregue). No seletor de etapa, escolha a opção vermelha **Cancelar OS**. Olhe o card Valor do orçamento e o card Peças e serviços. Se essa OS tinha peça lançada, confira o Estoque.
  **Tem que acontecer:** A etiqueta vira **Cancelado**. O campo Valor fica cinza, sem botão Salvar, com o texto *"Esta OS foi cancelada — valor travado"*. O botão Adicionar item some. A quantidade da peça **volta a subir** no estoque (estorno).
  *Por que importa: antes, OS cancelada deixava o valor solto enquanto o resto da ficha já estava travado — duas regras na mesma tela confundem quem fecha o laudo.*

- [ ] **31. OS atrasada sobe para o topo, e os cartões filtram**
  **O que fazer:** Vá em **Ordens de Serviço** e ligue o **Modo Grade** (ícone de quadradinhos, canto superior direito). Olhe as primeiras linhas e a coluna **Prioridade**. Depois clique no cartão de contagem **Aguardando aprovação** (a fileira de 4 cartões acima da busca) e clique nele de novo para desfazer.
  **Tem que acontecer:** As **3 OS com prazo vencido aparecem NO TOPO**, com fundo levemente avermelhado e etiqueta vermelha "Xd atrasada" — inclusive à frente de OS marcadas como Urgente que ainda estão no prazo. Abaixo, a ordem segue por prioridade (Urgente, Alta, Normal, Baixa) e, dentro de cada uma, a mais antiga primeiro. O cartão clicado ganha borda destacada, a lista mostra só aquela etapa e **o número do cartão bate com a quantidade de linhas**.
  *Por que importa: atrasada é a única OS em que o cliente já tem motivo para ligar reclamando — se ela afunda na lista, o aparelho esquecido só reaparece quando o cliente chega bravo.*

---

## Bloco 7 — Fechar o caixa no fim do dia

- [ ] **32. Sangria e suprimento (e movimento sem descrição não grava)**
  **O que fazer:** Em **Financeiro > Caixa**, anote o **Saldo esperado**. Clique em **Lançar movimento**, deixe o tipo **Sangria**, descrição `Retirada para depósito`, valor `100,00`, **Lançar**. De novo em Lançar movimento, tipo **Suprimento**, descrição `Troco trazido do cofre`, valor `50,00`, **Lançar**. Uma terceira vez, deixe a **descrição em branco** de propósito e clique em **Lançar**.
  **Tem que acontecer:** A sangria aparece com seta vermelha para cima e valor em vermelho com sinal de menos (−R$ 100,00), e o Saldo esperado **cai exatamente R$ 100,00**. O suprimento entra em verde com seta para baixo e o saldo **sobe R$ 50,00**. O contador "Movimentos" sobe a cada lançamento. A tentativa sem descrição **não grava nada**: aviso vermelho pedindo para preencher, e a janela continua aberta.
  *Por que importa: sangria com sinal trocado infla o caixa; movimento sem descrição vira linha órfã que ninguém explica no fechamento.*

- [ ] **33. Fechamento às cegas — e a diferença acusada**
  **O que fazer:** **Anote no papel** o valor que está em "Saldo esperado". Clique em **Fechar caixa** e **leia a janela inteira antes de digitar**. Depois digite um valor **R$ 20 MAIOR** que o esperado anotado (ex.: esperado 1.234,00 → digite 1.254,00), escreva em Observações `teste de sobra` e clique em **Conferir e fechar**.
  **Tem que acontecer:** A janela pergunta "Quanto tem na gaveta agora?" e **em nenhum lugar aparece o valor que o sistema calculou** — só o aviso de que o esperado é mostrado depois; o botão "Conferir e fechar" fica desabilitado enquanto o campo estiver vazio. Depois de confirmar: aviso **"Caixa fechado"** e **"Sobrou R$ 20,00 na gaveta"**, em vermelho. A tela volta sozinha para o cartão **Abrir caixa**.
  *Por que importa: se o esperado aparece antes, ninguém conta a gaveta — só copia o número, e qualquer erro de troco ou furto passa batido para sempre.*

- [ ] **34. Abrir o caixa na mão, com valor na casa dos milhares** **[CORREÇÃO RECENTE]**
  **O que fazer:** No cartão **Abrir caixa**, digite exatamente `1.500,00` (com o ponto do milhar e a vírgula) em "Valor inicial na gaveta" e clique em **Abrir caixa**. Depois feche o caixa de novo (Fechar caixa > 1500 > Conferir e fechar) e, no cartão de abertura, digite `abc` e clique em **Abrir caixa**.
  **Tem que acontecer:** Na primeira vez o caixa abre com **Abertura R$ 1.500,00** (não R$ 0,00) e **sem** a tarja amarela de abertura automática — essa abertura foi de gente. Na segunda, com "abc", o caixa **não abre**: aviso vermelho dizendo que o valor de abertura é inválido.
  *Por que importa: valor com ponto de milhar já foi lido como R$ 0,00 em silêncio — o fundo de troco inteiro sumia e o fechamento acusava sobra de R$ 1.500.*

---

## Bloco 8 — Contas a pagar e fluxo de caixa

- [ ] **35. Lançar conta de valor alto, dar baixa, e ver que título pago não cancela**
  **O que fazer:** Abra **Financeiro > Contas a Pagar > Nova conta a pagar**. Descrição `Aluguel de agosto — teste`, valor `2.800,00` (com ponto e vírgula), vencimento **hoje**, escolha uma **Categoria**, **Salvar**. Na linha criada, repare nos dois ícones da ponta direita: um **check verde** (dar baixa) e um **círculo cortado cinza** (cancelar). Clique no **check verde**. Depois olhe de novo os ícones dessa linha e tente cancelá-la.
  **Tem que acontecer:** O título aparece com **R$ 2.800,00** (não R$ 2,80 nem nada estranho), a categoria escolhida e etiqueta amarela **Vence hoje**; o quadro "Em aberto" soma esse valor. Depois da baixa: aviso "Título baixado", etiqueta **Pago** em verde, o valor sai de "Em aberto" e entra em "Já pago". Na linha, **o ícone de cancelar SUMIU** — sobra só o de desfazer (seta curva, "Reabrir"). Não existe nenhum caminho na tela para cancelar título já pago.
  *Por que importa: cancelar título pago apagaria o registro de que o dinheiro saiu de verdade — a gaveta esvazia e o sistema diz que nunca foi pago.*

- [ ] **36. Cancelar um título em aberto e ver que ele para de contar**
  **O que fazer:** Crie um segundo título: `Conta errada — teste`, valor `300,00`, vencimento hoje. Anote o valor do quadro **Em aberto**. Clique no ícone de **círculo cortado** (cancelar) na linha dele.
  **Tem que acontecer:** A linha fica acinzentada com etiqueta **Cancelado**, **perde todos os ícones de ação** (não dá para reabrir nem pagar), e o quadro "Em aberto" diminui **exatamente R$ 300,00**.
  *Por que importa: título cancelado que continua somando faz a loja achar que deve mais do que deve.*

- [ ] **37. Fluxo de Caixa: o que já aconteceu x o que só está previsto** **[CORREÇÃO RECENTE]**
  **O que fazer:** Abra **Financeiro > Fluxo de Caixa**, período do mês atual (já vem preenchido). Compare os blocos **Realizado — o que já aconteceu** e **Previsto — tudo que está lançado no período**. Procure na lista "Lançamentos do período" os dois títulos que você criou.
  **Tem que acontecer:** O aluguel de R$ 2.800,00 aparece em **Saiu** no bloco Realizado (foi baixado) e na lista, com a situação "Baixado em <hoje>". O título cancelado de R$ 300,00 **não aparece em lugar nenhum** — nem nos totais, nem na lista, nem na tabela "Por categoria".
  *Por que importa: misturar previsto com realizado, ou somar conta cancelada, mostra um saldo que não existe — e é nesse número que se decide comprar estoque.*

---

## Bloco 9 — Os números do dia (relatórios e auditoria)

- [ ] **38. Relatório Financeiro: o rodapé não pode somar título cancelado** **[CORREÇÃO RECENTE]**
  **O que fazer:** Abra **Relatórios > Relatório Financeiro** e **anote** o número do rodapé, na linha **"Saldo (sem cancelados)"**. Vá em **Financeiro > Contas a Pagar > Nova conta a pagar**: descrição `Teste rodape 21-08`, valor `1000,00`, vencimento **hoje**, Salvar. Volte ao Relatório Financeiro e aperte **F5** — o saldo deve ter piorado em R$ 1.000,00. Volte em Contas a Pagar e clique no ícone redondo de proibido (**Cancelar título**) na linha do teste. Volte ao relatório e atualize de novo.
  **Tem que acontecer:** Depois do cancelamento, a linha "Teste rodape 21-08" **continua aparecendo** na tabela, com Situação **Cancelado**, mas o rodapé "Saldo (sem cancelados)" volta a ser **exatamente o número que você anotou no começo**. O rodapé e o indicador "A pagar" lá em cima contam a mesma história.
  *Por que importa: rodapé somando cancelado dá dois resultados diferentes do mesmo mês na mesma tela.*

- [ ] **39. Relatório de Vendas: totais coerentes, e o CSV abre certo no Excel** **[CORREÇÃO RECENTE]**
  **O que fazer:** Abra **Relatórios > Relatório de Vendas** com o período do mês atual. Compare o rótulo do rodapé, o valor do rodapé (somando de cabeça a coluna **Total** das linhas) e os indicadores **Faturamento** e **Canceladas** no alto. Depois clique em **Exportar CSV**, abra a pasta Downloads e dê duplo clique no arquivo. Repita a exportação no Relatório Financeiro.
  **Tem que acontecer:** O rodapé se chama **"Total (sem canceladas)"** — o critério está escrito, não subentendido. O indicador "Canceladas" mostra 0 e o rodapé bate com a soma das linhas. **Faturamento** só pode ser MENOR que o rodapé se houver devolução no período (e hoje há) — nunca maior. O arquivo baixado se chama `relatorio_vendas_<data inicial>_a_<data final>.csv`; no Excel cada informação cai na **sua** coluna (Venda, Data, Cliente, Status, Desconto, Total), os acentos aparecem certos (Descrição, Situação) e os valores usam vírgula decimal.
  *Por que importa: se rodapé e Faturamento divergirem sem motivo, o número do mês está errado; e CSV embolado obriga a redigitar tudo à mão.*

- [ ] **40. Logs / Auditoria mostra QUEM fez cada alteração** **[CORREÇÃO RECENTE]**
  **O que fazer:** Abra **Configurações > Logs / Auditoria**. Olhe a coluna **Quem** nas primeiras linhas — devem estar ali as ações que você acabou de fazer (criar e cancelar o "Teste rodape 21-08"). Clique no filtro **Título financeiro** e, numa linha marcada como **Alterou**, clique no link azul **"N campos"**.
  **Tem que acontecer:** Existe a coluna **Quem**, com o **seu nome** nas linhas das ações que você acabou de fazer. Ao abrir "N campos", aparece o campo que mudou com o valor antigo **riscado em vermelho** e o novo **em verde** (ex.: status: aberto → cancelado). Linhas antigas geradas pelo próprio banco aparecem como **"Sistema"**, nunca em branco.
  *Por que importa: log sem o nome de quem mexeu não serve para nada no dia em que sumir dinheiro ou um preço for alterado.*

---

## Bloco 10 — Dois testes finais (se ainda houver fôlego)

- [ ] **41. Orçamento é só simulação — não pode gravar venda**
  **O que fazer:** Vá em **Venda > Orçamento (Simulação)**. Clique em dois ou três produtos, escreva um nome em "Nome do cliente", digite um desconto e clique em **Imprimir** (pode cancelar a janela de impressão do navegador). Depois vá em **Venda > Histórico de Vendas** e confira se apareceu venda nova.
  **Tem que acontecer:** A tela calcula o "Total simulado" certinho e a impressão sai com o nome da loja e o texto **"ORÇAMENTO — SIMULAÇÃO, não é comprovante de venda"**. No Histórico **não aparece nenhuma venda nova**, e no PDV o estoque dos produtos usados continua igual.
  *Por que importa: simulação que grava venda cria faturamento fantasma e produto sumindo do estoque sem ninguém ter comprado.*

- [ ] **42. Quando a internet cai, a tela avisa em vez de mentir** **[CORREÇÃO RECENTE]**
  **O que fazer:** Com o PDV aberto, desligue o wi-fi (ou tire o cabo de rede) e aperte **F5**. Depois religue a internet e recarregue de novo.
  **Tem que acontecer:** Com a internet fora, aparecem avisos vermelhos do tipo *"Não consegui carregar os produtos" / "os clientes" / "as formas de pagamento"*, pedindo para verificar a internet e atualizar a página. **Não pode aparecer uma vitrine vazia calada**, como se a loja não tivesse produto cadastrado. Com a internet de volta, tudo carrega normal.
  *Por que importa: lista vazia sem aviso faz o vendedor dizer "não tem em estoque" para um produto que existe, ou cadastrar de novo um cliente que já existe.*

---

## Se algo falhar

Não tente consertar nem investigar. Anote e siga para o próximo passo — o roteiro foi montado para que uma falha não derrube o resto.

Para cada falha, anote quatro coisas:

1. **Número e nome do passo** (ex.: "Passo 20 — Depois da devolução").
2. **O que você fez** — o clique exato, o valor digitado, o cliente e o produto usados.
3. **O que você esperava** que acontecesse (está escrito no passo).
4. **O que aconteceu de verdade** — copie o texto do aviso na tela, palavra por palavra, se houver.

E, sempre que der: **tire um print da tela inteira** (tecla `Print Screen`, ou `Windows + Shift + S` para recortar), incluindo o menu lateral, para dar para saber em que tela foi.

Se a tela ficar **branca** ou **travar**: aperte `F5` uma vez. Se voltar, anote isso ("ficou branca, F5 resolveu"). Se não voltar, anote e pule o bloco inteiro.

Priorize me mandar primeiro as falhas dos passos marcados **[CORREÇÃO RECENTE]** — são os 20 que testam coisas consertadas agora e que têm mais chance de estar quebradas de novo.
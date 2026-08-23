# Teste do Sisteminha

**Um documento só.** Até 23/08 existiam dois — este roteiro e um `TESTE-MANUAL`
separado — e ninguém sabia mais qual valia. Agora é este.

## Como ler

Cada passo tem uma etiqueta:

- **🔴 ESSENCIAL** — o que precisa ser feito antes de a loja migrar. São os
  fluxos que movem dinheiro e os que nenhuma verificação automática alcança.
- **⚪ QUANDO DER** — importante, mas não bloqueia. Faça quando sobrar fôlego.

E três linhas fixas: **O que fazer**, **Tem que acontecer** e *por que importa*.
A terceira existe para você poder decidir pular um passo sabendo o que está
abrindo mão.

## O que já roda sozinho

O sistema tem **152 testes automáticos** que rodam a cada mudança. Eles cobrem
as contas (faturamento, devolução, custo médio, ranking) e o comportamento das
telas por perfil — inclusive o pior defeito que este sistema já teve, a tela de
Estoque ficando branca para quem não vê custo.

Passos que viraram teste automático **saíram deste documento**. Não some
trabalho por engano: some porque a máquina passou a fazer, toda vez, sem
esquecer.

O que a máquina não faz, e por isso continua aqui: **papel** (impressão),
**mão** (arrastar cartão, tirar o cabo da internet) e **julgamento** (se o
número faz sentido com a realidade da sua loja).

---

## Antes de começar

1. Abra o terminal na pasta do sisteminha e rode:
   ```
   npm run dev
   ```
2. Abra **http://localhost:8080** no navegador.
3. Entre com o seu usuário de administrador.

**Tenha à mão:** papel e caneta — vários passos pedem para anotar um número
antes e comparar depois.

**Se algo falhar:** não tente consertar nem investigar. Anote o número do
passo, o que fez, o que esperava e o que aconteceu, e tire um print da tela
inteira. Depois siga em frente: os passos foram ordenados para que uma falha
não derrube os seguintes.

---

## Bloco 1 — Abrir o sistema e ver se a base está de pé

- [ ] **⚪ 1. A lista de produtos abre e mostra tudo**
  **O que fazer:** No menu lateral, abra **Estoque > Produtos**. Olhe o painel laranja **Filtros** no topo: o campo **Apto à Venda** tem que estar em **Sim**. Confira se aparecem os 10 produtos da massa de teste.
  **Tem que acontecer:** A tabela carrega com as colunas Produto, Categoria, Custo, Preço, Margem, Estoque, Local. O contador do painel laranja mostra o mesmo número de linhas que você conta na tabela. Se algum produto estiver no mínimo ou abaixo, aparece em cima um cartão amarelo **Estoque Crítico** dizendo quantos são.
  *Por que importa: é a tela que a loja abre o dia inteiro; se vier vazia, ninguém consulta preço nem confere prateleira.*


## Bloco 2 — Cadastro de cliente (o que o balcão faz o dia inteiro)

- [ ] **⚪ 2. Cadastrar cliente só com o nome**
  **O que fazer:** Abra **Cadastros > Clientes** e clique em **Novo Cliente**. Preencha SÓ o campo **Nome completo \*** com `Teste Balcao 21-08` e clique em **Cadastrar**. Não preencha mais nada.
  **Tem que acontecer:** Aviso verde "Cliente cadastrado! — Teste Balcao 21-08 foi salvo com sucesso.", a janela fecha sozinha e o cliente aparece na lista, com um traço (—) na coluna CPF/CNPJ e nada em Contato. Nenhuma mensagem vermelha de campo obrigatório.
  *Por que importa: é o cadastro de fila — se o sistema exigir CPF ou telefone, o vendedor com cliente esperando desiste e a venda sai sem cliente nenhum.*
  > 🔎 **Corrigido em 22/08:** o aviso não saía verde — o sistema só tinha duas cores de aviso, cinza (neutro) e vermelho (erro). Felipe decidiu criar a terceira cor; agora este e todos os avisos de sucesso do sistema saem verdes de verdade.

- [ ] **⚪ 3. Cliente repetido: CPF e telefone recusam, nome igual só avisa**
  **O que fazer (três tentativas seguidas, todas em Novo Cliente):**
  a) Nome `Adriana Teste`, CPF `910.000.000-01`, aperte **Tab**. Olhe o topo da janela e o botão Cadastrar. Clique em **Usar este cadastro**.
  b) Novo Cliente de novo: nome `Teste Telefone`, telefone `17910000001`, **Tab**. Olhe o topo. Clique em **Cancelar**.
  c) Novo Cliente de novo: nome exatamente `Bruno Tavares`, **Tab**, sem CPF nem telefone. Olhe o topo. Clique em **Cancelar**.
  d) Por fim, no campo de busca da lista de clientes digite `91000000001`, depois `910.000.000-01`, depois `17910000001`.
  **Tem que acontecer:** Em (a) e (b), tarja **VERMELHA** "Este cliente já está cadastrado" apontando *Adriana Prado — mesmo CPF/CNPJ* / *mesmo telefone*, com o botão **Cadastrar apagado** (não clica); "Usar este cadastro" abre a ficha da Adriana Prado. Em (c), tarja **AMARELA** "Já existe alguém com esse mesmo nome" e o botão **Cadastrar continua ativo**. Em (d), as três buscas trazem a mesma Adriana Prado — a pontuação digitada não pode fazer diferença.
  *Por que importa: cliente duplicado quebra histórico, garantia e cobrança; e se a busca exigir a pontuação exata, o atendente não acha e cadastra a mesma pessoa de novo.*

- [ ] **⚪ 4. Item novo numa Lista do Sistema aparece sozinho no cadastro — e desativar não apaga o antigo**
  **O que fazer:** Abra **Cadastros > Listas do Sistema**, aba **Cliente** (a lista *Origens do Cliente* já vem selecionada). Digite `TikTok Teste` e aperte Enter. Clique em **Tornar padrão** ao lado dele. Vá em **Cadastros > Clientes > Novo Cliente**, role até **Relacionamento** e olhe o campo **Como conheceu a loja**; preencha o nome `Teste TikTok 21-08` e **Cadastrar**. Agora volte em Listas do Sistema e **desligue a chavinha** do "TikTok Teste". Volte em Clientes, ache `Teste TikTok 21-08`, três pontinhos > **Editar**, role até "Como conheceu a loja". Feche em **Cancelar** e abra um **Novo Cliente** para olhar a mesma lista.
  **Tem que acontecer:** "TikTok Teste" entra na lista na hora, sem recarregar a página, e ganha etiqueta **Padrão** com estrela. No cadastro de cliente novo, o campo já vem preenchido com "TikTok Teste" sem você escolher nada, e depois de salvar a coluna "Como conheceu" mostra isso. Depois de desativado: **na ficha do cliente antigo o campo continua mostrando "TikTok Teste"**, mas num cliente novo ele não aparece mais entre as opções.
  *Por que importa: se precisar de programador para acrescentar uma origem, o cadastro congela e todo mundo passa a usar "Outro" — e se a escolha antiga sumir ao editar, o relatório de mídia passa a mentir.*

---

## Bloco 3 — Estoque e produtos

- [ ] **⚪ 5. Cadastrar produto novo e ver a entrada registrada**
  **O que fazer:** Em **Estoque > Produtos**, clique em **Novo Produto**. Nome `TESTE 21-08 Fone Bluetooth`, Marca `JBL`, Custo `100`, Preço `150`, Estoque Atual `5`, Estoque Mínimo `2`. Clique em **Cadastrar**. Depois abra **Estoque > Movimentações** (o período já vem no mês atual) e procure a linha desse produto.
  **Tem que acontecer:** Aviso verde "Produto cadastrado!", o produto aparece na lista com Preço R$ 150,00, Margem 50,0% em verde e Estoque 5 (antes de salvar, o quadrinho "Margem" dentro da caixa já mostrava 50,0% sozinho). Em Movimentações existe uma linha com etiqueta verde **Entrada**, quantidade **+5 em VERDE**, motivo "Cadastro inicial" e Saldo depois 5.
  *Por que importa: produto salvo torto entra sem preço e alguém vende por R$ 0; e estoque que aparece do nada, sem registro, torna impossível achar erro de contagem depois.*
  > 🔎 **Corrigido em 22/08:** mesmo caso do passo 3 — o aviso de sucesso agora sai verde.

- [ ] **⚪ 6. Editar a ficha completa e mudar a quantidade pela ficha**
  **O que fazer:** Clique em cima da linha do `TESTE 21-08 Fone Bluetooth` (a linha inteira abre a ficha). Mude o **Preço** para `180`, escolha Grupo, Marca, Cor e Condição no bloco **Catálogo**, escreva algo em **Observações**. No bloco **Preços e Estoque**, troque Estoque Atual de 5 para `3` e Estoque Mínimo de 2 para `5`. Clique em **Salvar** e desça até **Movimentações recentes**, no pé da página. Depois clique em **Voltar** e reabra a ficha.
  **Tem que acontecer:** Aviso "Produto atualizado!". No bloco de baixo aparece uma linha nova com etiqueta azul **Ajuste**, quantidade **-2 em VERMELHO**, motivo "Ajuste manual" e Saldo 3. Na lista, o Preço virou R$ 180,00 e a marca aparece embaixo do nome. Reabrindo a ficha, **tudo que você escolheu continua lá** — não pode voltar em branco.
  *Por que importa: se o catálogo não gravar, cada edição apaga em silêncio o que alguém preencheu; e correção de contagem sem rastro é o jeito clássico de sumir mercadoria.*

- [ ] **🔴 7. Estoque Crítico e reposição rápida**
  **O que fazer:** Abra **Estoque > Estoque Crítico** e procure o `TESTE 21-08 Fone Bluetooth` (ficou com 3 de atual e 5 de mínimo). Clique em **Repor** na linha dele, troque a quantidade sugerida para `3` e clique em **Confirmar reposição**.
  **Tem que acontecer:** Antes: aparece com Atual 3, Mínimo 5, Faltam 2 e triângulo amarelo de alerta; os quadrinhos do topo mostram "Produtos em alerta", "Zerados", "Peças faltando" e "Custo para repor tudo". Depois: aviso "Estoque reposto!" e o produto **sai da lista** (ficou com 6, acima do mínimo). Na ficha dele, um **Ajuste +3** em verde com motivo "Reposição de estoque".
  *Por que importa: é essa lista que diz o que comprar; se ela mentir, a loja fica sem produto ou compra o que já tem.*

- [ ] **🔴 8. Tirar um produto da venda (Apto à Venda desligado)**
  **O que fazer:** Abra de novo a ficha do `TESTE 21-08 Fone Bluetooth`, desça até **Disponibilidade** e **desligue a chavinha "Apto à Venda"**. Salve e clique em **Voltar**. Procure o produto na lista. No painel laranja de Filtros, mude **Apto à Venda** para **Não**. Por último abra **Venda > Nova Venda (PDV)** e tente buscar esse produto.
  **Tem que acontecer:** Com o filtro em "Sim" (padrão) o produto sumiu da lista. Com o filtro em "Não", ele aparece com etiqueta cinza **Inativo** ao lado do nome. No PDV, ele **não aparece** na busca.
  *Por que importa: é o freio para não vender aparelho quebrado, reservado ou ainda não revisado.*

---

## Bloco 4 — Vender (o coração da loja)

- [ ] **🔴 9. Deixar o caixa FECHADO antes de começar**
  **O que fazer:** Abra **Financeiro > Caixa**. Se aparecer o cartão **Abrir caixa** com "Nenhum caixa aberto no momento", está pronto — não faça mais nada aqui. Se aparecer a tela do caixa aberto (com **Lançar movimento** e **Fechar caixa**), clique em **Fechar caixa**, digite qualquer valor em "Quanto tem na gaveta agora?", clique em **Conferir e fechar** e volte a esta tela.
  **Tem que acontecer:** A tela termina mostrando o cartão **Abrir caixa**, campo "Valor inicial na gaveta" vazio.
  *Por que importa: sem partir de caixa fechado, o próximo passo (o caixa abrir sozinho na venda) não tem como acontecer.*

- [ ] **🔴 10. Venda simples do começo ao fim, em dinheiro**
  **O que fazer:** Abra **Venda > Nova Venda (PDV)**. Antes, anote quanto tem de estoque do **Echo Dot**. No campo de busca digite `Echo Dot` e clique no cartão do produto (ele vai para o carrinho, à direita). No topo do carrinho clique no botão **Cliente** e escolha **Adriana Prado**. Clique em **Finalizar Venda**, clique no atalho **Dinheiro** (ele preenche o valor que falta) e depois em **Confirmar Venda**. **Anote o número da venda.**
  **Tem que acontecer:** Aviso verde "Venda finalizada! — Venda VD-… registrada com sucesso". A janela fecha, o carrinho volta a dizer "Carrinho vazio", o botão volta a dizer só "Cliente", e o numerozinho cinza no canto do cartão do produto (o estoque) **diminuiu 1**.
  *Por que importa: é o que a loja faz 50x por dia — se falhar, não dá para vender nada e o estoque não desconta.*

- [ ] **🔴 11. Depois da primeira venda: o caixa abriu sozinho e a venda está no histórico** **[CORREÇÃO RECENTE]**
  **O que fazer:** Abra **Financeiro > Caixa**. Depois abra **Venda > Histórico de Vendas** e clique na primeira linha da lista.
  **Tem que acontecer:** No Caixa, ele agora está **ABERTO sozinho**, com tarja amarela *"Este caixa foi aberto pelo sistema, não por uma pessoa"* explicando que abriu na primeira venda do dia. O quadro **Abertura** mostra R$ 0,00 com a observação "Automática — gaveta não contada", e em **Movimentos do expediente** existe uma linha verde "Venda VD-…" com o valor da venda. **Anote o "Saldo esperado".** No Histórico, a primeira linha traz o número, data/hora de agora, "Adriana Prado", seu nome como vendedor e etiqueta verde **pago**; clicando nela abre a janela "Venda V____" com o produto em *Produtos* e "Dinheiro" em *Pagamentos*.
  *Por que importa: antes, vender com o caixa fechado fazia o dinheiro sumir da conferência em silêncio — foram R$ 22 mil vendidos sem um único lançamento no caixa.*

- [ ] **⚪ 12. Cliente bloqueado é recusado com aviso claro** **[CORREÇÃO RECENTE]**
  **O que fazer:** Volte ao PDV, clique num produto qualquer para jogar no carrinho. Clique em **Cliente**, digite `Joao` na busca e clique na linha do **Joao Vitor Passos**.
  **Tem que acontecer:** Antes mesmo de clicar, a linha dele já vem com ícone vermelho de proibido e etiqueta vermelha **Bloqueado**. Ao clicar, aviso vermelho *"Cliente bloqueado — Joao Vitor Passos está bloqueado para venda. Libere na ficha dele em Cadastros > Clientes."* A janela **continua aberta** e o nome **não entra** no carrinho.
  *Por que importa: bloqueio descoberto tarde vira venda recusada pelo banco no fim, com o carrinho montado e o cliente esperando.*

- [ ] **🔴 13. Cancelar o pagamento tem que jogar tudo fora** **[CORREÇÃO RECENTE]**
  **O que fazer:** Com um produto no carrinho, clique em **Finalizar Venda**. Lance um pagamento à mão: escolha **Dinheiro**, digite `50` no Valor e clique no **+**. Depois, em **Produto recebido em troca**, clique em **Adicionar**, escreva `Teste descarte` na descrição, valor de entrada `100`, e clique no **+** dessa parte. Agora clique em **Cancelar** no rodapé. Troque o cliente do carrinho para outra pessoa e clique em **Finalizar Venda** de novo.
  **Tem que acontecer:** A janela reabre **ZERADA**: nenhum pagamento de R$ 50,00, nenhum "Teste descarte" em produto recebido em troca, "Total pago" em R$ 0,00 e "Falta" em vermelho igual ao total. O carrinho e o cliente continuam como estavam (isso é de propósito).
  *Por que importa: antes isso sobrevivia para a venda do PRÓXIMO cliente — entrava no estoque um produto usado que nunca existiu e no caixa uma forma de pagamento errada.*

- [ ] **🔴 14. Pagamento: falta trava, duas formas somam, e o troco aparece** **[CORREÇÃO RECENTE]**
  **O que fazer:** Com um produto no carrinho (anote o Total), clique em **Finalizar Venda**. (a) Lance **Dinheiro R$ 10,00** e olhe o rodapé e o botão Confirmar. (b) Agora clique no atalho **Cartão**. (c) Por fim lance mais um pagamento em Dinheiro de valor bem maior que o total (ex.: R$ 5.000,00) e olhe o rodapé.
  **Tem que acontecer:** (a) "Falta" em vermelho e o botão **Confirmar Venda apagado** (não clica). (b) A lista mostra **DUAS linhas** — Dinheiro R$ 10,00 e Cartão Crédito com exatamente o que faltava; **a linha do Dinheiro NÃO some**. (c) Some o "Falta" e aparece **Troco** em verde com a diferença certa, e o Confirmar fica clicável. Pode confirmar a venda; no Histórico ela mostra os dois pagamentos.
  *Por que importa: o atalho já apagou pagamento lançado à mão — a venda inteira ia registrada como cartão e o dinheiro da gaveta não batia no fim do dia.*

- [ ] **🔴 15. Venda com desconto, paga em PIX — e o PIX não mexe na gaveta**
  **O que fazer:** Coloque um produto no carrinho e anote o preço. No rodapé do carrinho, no campo **Desconto (R$)**, digite `100`. Finalize com **PIX Total** e **Confirmar Venda**. Depois olhe o valor no **Histórico de Vendas** e vá em **Financeiro > Caixa** olhar o "Saldo esperado" e a tabela **Resumo do dia por forma de pagamento**.
  **Tem que acontecer:** Ao digitar o desconto, o carrinho mostra três linhas: **Subtotal** com o preço cheio, **Desconto** em vermelho ("-R$ 100,00") e **Total** já abatido. O "PIX Total" lança o valor **já com desconto**, e é esse valor que aparece no histórico. No Caixa, o **Saldo esperado NÃO mudou**; na tabela de baixo aparecem Dinheiro com etiqueta verde "Dinheiro físico" e PIX com o texto "Não entra".
  *Por que importa: desconto que não entra na conta cobra a mais do cliente; e PIX contado na gaveta faz todo fechamento acusar falta de dinheiro que nunca esteve lá.*

- [ ] **⚪ 16. Não deixar vender mais do que tem — e achar produto pelos filtros**
  **O que fazer:** No PDV, olhe o numerozinho cinza no canto de um cartão de produto (é o estoque). Clique nesse cartão mais vezes do que o número mostra, e tente também o **+** da linha dentro do carrinho. Depois limpe o carrinho, deixe a busca vazia e use o painel de filtros (Categoria, Marca, Cor, Condição, Memória, Preço De/Até): escolha uma **Categoria** e digite `1000` no campo **De** do Preço. Por fim clique em **Limpar filtros**.
  **Tem que acontecer:** Aviso vermelho **"Estoque insuficiente — Apenas X unidades disponíveis"** e a quantidade no carrinho **para** no número que existe. Nos filtros, a vitrine vai encurtando; o botão "Limpar filtros" mostra uma bolinha com a quantidade de filtros ligados (2) e, ao clicar, tudo volta e as caixinhas voltam para "Todos".
  *Por que importa: vender o que não tem gera estoque negativo; e vitrine sem filtro trava o atendimento quando o catálogo cresce.*
  > 🔎 **Corrigido em 22/08:** a trava de quantidade sempre funcionou nos dois caminhos, mas o aviso do **+** dentro do carrinho não dizia quantas unidades existem (só o clique no produto dizia). Agora os dois avisam a mesma coisa.

- [ ] **🔴 17. Entrada de produto por troca no PDV: entra no estoque, mas travado**
  **O que fazer:** No PDV, coloque o **PlayStation 5 Slim 1TB** no carrinho, escolha o cliente **Bruno Tavares** e clique em **Finalizar Venda**. Em **Produto recebido em troca** clique em **Adicionar**, descrição `PlayStation 4 Slim 500GB`, preencha Tipo/Marca se quiser, **Valor de entrada (R$)** `1200`, e clique no **+**. Depois clique em **Dinheiro** para cobrir o que falta e em **Confirmar Venda**. No aviso verde, clique em **Revisar produto**. Depois abra **Estoque > Produtos**.
  **Tem que acontecer:** Antes de confirmar, o resumo mostra "Entrada de produto R$ 1.200,00" e o "Falta" já desconta esse valor. Depois, o botão **Revisar produto** abre a ficha do PlayStation 4 recém-criado: **estoque 1, preço R$ 0,00 e a chavinha "Apto à Venda" DESLIGADA**. Em Estoque > Produtos aparece em cima um **cartão azul "Aguardando revisão"** (clicando nele, o filtro muda sozinho para Apto à Venda: Não e o produto aparece com etiqueta azul). O PS4 **não aparece** no PDV enquanto ninguém precificar. Se você colocar preço e ligar o Apto à Venda, ele volta para a lista normal e o cartão azul some.
  *Por que importa: produto usado entrando já liberado e sem preço pode ser vendido por R$ 0,00 antes de alguém olhar se funciona — e sem o aviso azul ele fica perdido no sistema.*

---

## Bloco 5 — Troca e devolução

- [ ] **🔴 18. Devolução pura: cliente devolve e leva o dinheiro**
  **O que fazer:** Abra **Venda > Troca / Devolução**. Na busca digite o número da venda do Echo Dot (ou `Adriana`) e clique na linha. No quadro **2. O que está voltando?**, no campo **Devolver** da linha do Echo Dot digite `1`. Pule o quadro 3. No quadro **4. Acerto**, escolha **Dinheiro**, escreva no Motivo `cliente não gostou` e clique em **Confirmar devolução**.
  **Tem que acontecer:** No quadro 4, antes de confirmar, aparece **"Devolver ao cliente R$ 349,00"** em verde. Depois, aviso "Devolução registrada! DV-… — devolver R$ 349,00 ao cliente." e a tela volta sozinha para a lista de vendas.
  *Por que importa: é o caminho mais comum do balcão; conta errada é dinheiro entregue a mais ou a menos na mão do cliente.*

- [ ] **🔴 19. Depois da devolução: estoque, caixa e faturamento** **[CORREÇÃO RECENTE]**
  **O que fazer:** Abra **Estoque > Produtos** e confira o Echo Dot contra o número que você anotou. Abra **Estoque > Movimentações** e olhe as linhas de hoje. Abra **Financeiro > Caixa** e olhe os movimentos e o Saldo esperado. Abra o **Dashboard de Vendas** e olhe o cartão "Vendas Hoje".
  **Tem que acontecer:** O Echo Dot **voltou** ao número de antes da venda. Em Movimentações existem duas linhas dele: a da venda com etiqueta vermelha **Saída** e quantidade **-1 em VERMELHO** (nunca em verde com "+"), e a da devolução com etiqueta verde **Entrada**, **+1** em verde e motivo "Devolução de produto"; a coluna "Saldo depois" mostra o estoque cheio. No Caixa entrou uma linha **vermelha** "Devolução DV-… — cliente não gostou", valor **-R$ 349,00**, e o **Saldo esperado voltou** ao de antes da venda. No Dashboard, "Vendas Hoje" desconsidera essa venda. Em Histórico de Vendas a venda **continua** na lista (ela existiu de verdade) — o que não pode existir é o dinheiro dela na gaveta.
  *Por que importa: produto devolvido que não volta ao estoque some da prateleira digital; e dinheiro que saiu da gaveta e continua contado como faturamento faz o painel mentir.*

- [ ] **⚪ 20. Não deixa devolver a mesma coisa duas vezes**
  **O que fazer:** Volte em **Venda > Troca / Devolução**, busque a mesma venda da Adriana Prado e clique nela.
  **Tem que acontecer:** No quadro 2 aparece *"Nada disponível pra devolver — Todos os itens desta venda já foram devolvidos antes."* e não existe campo nenhum para digitar quantidade.
  *Por que importa: sem essa trava, sai dinheiro em dobro da gaveta e entra estoque que nunca voltou.*

- [ ] **🔴 21. Troca por produto MAIS BARATO: a loja devolve a diferença** **[CORREÇÃO RECENTE]**
  **O que fazer:** Anote antes o estoque do **Headset HyperX Cloud II** e do **Teclado Mecanico RGB**. Em **Venda > Troca / Devolução**, busque `Elaine` e clique na venda dela (a que mostra o headset no quadro 2). Digite `1` em **Devolver**. No quadro **3. Vai levar produto novo no lugar?**, busque `Teclado` e clique no **Teclado Mecanico RGB**. No quadro 4 escolha **Dinheiro** e **Confirmar devolução**. Depois confira Estoque > Produtos, Estoque > Movimentações e Financeiro > Caixa.
  **Tem que acontecer:** No quadro 4: "Valor devolvido (itens que voltam) R$ 549,00", "Valor dos itens novos -R$ 279,90" e, em verde e negrito, **"Devolver ao cliente R$ 269,10"**. Depois: o headset **subiu 1** e o teclado **desceu 1**; em Movimentações o headset aparece como **Entrada +1** (motivo "Devolução de produto") e o teclado como **Saída -1 em VERMELHO** (nunca em verde com "+"); no Caixa entrou linha vermelha "Devolução DV-…" de **-R$ 269,10** e o Saldo esperado caiu exatamente isso.
  *Por que importa: o teclado saiu da loja de verdade — se aparecer como entrada, o estoque conta a história ao contrário e ninguém confia mais na tela.*

- [ ] **🔴 22. Troca por produto MAIS CARO: o cliente paga a diferença** **[CORREÇÃO RECENTE]**
  **O que fazer:** Anote o estoque do **Cabo HDMI 2.1 2m** e do **Mouse Gamer 16000 DPI**, e anote o **Faturamento** que está em Venda > Histórico de Vendas. Em **Troca / Devolução**, busque `Fabio` e clique na venda do Cabo HDMI. Digite `1` em Devolver. No quadro 3, busque `Mouse` e clique no **Mouse Gamer 16000 DPI**. No quadro 4 escolha **Dinheiro** e confirme. Depois confira Financeiro > Caixa, Histórico de Vendas e o estoque dos dois produtos.
  **Tem que acontecer:** No quadro 4 o rótulo muda para **"Cliente paga a mais"**, mostrando **R$ 140,00 em vermelho**, e a forma de pagamento passa a se chamar "(que o cliente vai pagar)". O aviso final diz "cliente pagou R$ 140,00 a mais". No Caixa entrou linha **VERDE** "Venda VD-…" de **R$ 140,00** (entrada, não saída). No Histórico aparece uma venda nova de R$ 199,90 (preço cheio do mouse), mas o indicador **Faturamento subiu apenas R$ 140,00** — não R$ 199,90. Cabo +1, mouse -1.
  *Por que importa: se o sistema inverter o sentido, a loja devolve R$ 140 em vez de receber; e se o preço cheio virar faturamento, a meta do mês vira ficção.*

---

## Bloco 6 — Assistência técnica (Ordens de Serviço)

- [ ] **⚪ 23. Abrir uma OS completa, do jeito do balcão (e OS sem defeito não pode nascer)**
  **O que fazer:** Menu **Ordens de Serviço > Nova OS**. Primeiro, um teste rápido: escolha qualquer cliente, **não escreva nada** em "Problema informado pelo cliente" e **não marque** nenhum item em "Defeitos e sintomas" — clique em **Abrir OS**. Depois preencha de verdade: em **Dono do aparelho** escolha *Adriana Prado*; no bloco Equipamento escolha Equipamento, Marca, Modelo, Cor e Memória (se faltar opção, digite o nome novo dentro do próprio campo e cadastre na hora) e preencha IMEI / Nº de Série; escreva o problema relatado; ligue pelo menos um item em cada um dos três quadros do check-in (**Defeitos e sintomas**, **Itens do aparelho**, **Condições de entrada**); em Senhas preencha a **Senha digitada** e desenhe uma sequência na grade de 9 pontos. Deixe o prazo como veio e clique em **Abrir OS**.
  **Tem que acontecer:** Na tentativa vazia, aviso vermelho *"Falta o defeito — Marque um sintoma no checklist ou descreva o problema relatado"* e a OS **não** é criada. Na de verdade: aviso "OS criada!" com o número (formato OS-AAAAMM-0001) e a tela vai direto para a ficha. Na ficha, o aparelho aparece montado (marca + modelo, cor · memória, nº de série), o card **Check-in do aparelho** separa Sintomas relatados / Itens que vieram junto / Estado na entrada, a senha digitada aparece em destaque e o desenho aparece **numerado na ordem** em que foi feito. O card Aparelho mostra "Prazo prometido" com hoje + 3 dias e "Garantia: 90 dias".
  *Por que importa: é o check-in que protege a loja quando o cliente volta dizendo que deixou a fonte junto ou que a tela já estava trincada.*

- [ ] **⚪ 24. Cliente bloqueado PODE abrir OS** **[CORREÇÃO RECENTE]**
  **O que fazer:** **Nova OS**, clique em "Dono do aparelho", digite `Joao` e escolha **Joao Vitor Passos**. Preencha só o defeito relatado e clique em **Abrir OS**.
  **Tem que acontecer:** Na busca, o nome dele vem com etiqueta **amarela "Bloqueado"**. Depois de escolhido, faixa amarela no card Cliente dizendo que ele está bloqueado para venda e explicando que **a OS pode ser aberta normalmente**. A OS é criada sem erro nenhum.
  *Por que importa: aparelho que já está na bancada precisa ser registrado; o que não pode é o bloqueio aparecer só depois do conserto pronto, na hora de cobrar.*
  > 🔎 **Bug achado e corrigido em 22/08:** o aviso amarelo desta tela promete que "o sistema vai recusar a cobrança na entrega" enquanto o cliente estiver bloqueado — mas o banco não conferia isso na hora de entregar a OS, então a cobrança passava normalmente. Agora o banco recusa de verdade a entrega/cobrança de uma OS paga enquanto o cliente estiver bloqueado, do mesmo jeito que já recusa venda no PDV.

- [ ] **🔴 25. Lançar peça do estoque, serviço avulso e fechar o orçamento**
  **O que fazer:** Abra uma das OS de teste que ainda está em andamento. Anote antes, no Estoque, a quantidade do produto que vai usar. No card **Peças e serviços** clique em **Adicionar item** > aba **Peça do estoque**, escolha um produto com estoque, quantidade `2`, **Adicionar**. De novo em Adicionar item > aba **Serviço avulso**: `Mão de obra — troca de tela`, preço `150`, **Adicionar**. Volte ao Estoque e confira. Depois, na ficha, desça até **Valor do orçamento**, clique em **Usar soma dos itens (R$ …)**, **Salvar**, e aperte **F5**.
  **Tem que acontecer:** Ao lançar a peça: "Peça lançada! O estoque já foi descontado automaticamente" e o estoque cai **exatamente 2**. Os dois itens aparecem na tabela, com o rodapé separando "Peças: R$ …" e "Mão de obra: R$ …". A linha do serviço avulso tem lixeira vermelha; **a linha da peça NÃO tem lixeira nenhuma**. O orçamento é preenchido com a soma exata, aparece "Orçamento salvo!" e, depois do F5, **o valor continua lá**; o botão Salvar fica apagado enquanto nada mudou.
  *Por que importa: peça que não desconta é peça vendida duas vezes; e o valor do orçamento é o que vira a cobrança na entrega — se não gravar, a loja entrega o aparelho e não cobra nada.*

- [ ] **⚪ 26. Mover a OS pelas etapas e ver quem mexeu**
  **O que fazer:** Na mesma OS, use o botão **Avançar para …** no topo e caminhe: Aguardando análise > Aguardando aprovação > Aprovado > **Finalizado**. Pare em Finalizado. Desça até o card **Histórico da OS**.
  **Tem que acontecer:** Cada clique mostra "Etapa alterada — OS movida para …" e a etiqueta colorida no topo muda junto. O Histórico lista todas as passagens, na ordem, com data e hora, de onde saiu, para onde foi e **o NOME de quem fez a mudança** — sem precisar dar F5.
  *Por que importa: sem o registro de quem moveu o quê, ninguém apura depois quem liberou um aparelho antes da hora.*

- [ ] **🔴 27. Entregar OS paga — o sistema cobra antes, e depois trava tudo**
  **O que fazer:** Na OS em Finalizado, clique no botão verde **Avançar para Entregue**. Na janela **Confirmar entrega**, tente confirmar **sem lançar nada**. Depois adicione um pagamento de metade do valor (escolha a forma, digite o valor, clique no **+**), veja o que muda, e adicione uma segunda forma cobrindo o resto **com um pouco a mais** (ex.: R$ 20 acima). Clique em **Confirmar entrega**. Depois olhe o card **Valor do orçamento**, o card **Peças e serviços**, e vá em **Financeiro > Contas a Receber**.
  **Tem que acontecer:** Sem pagamento, o botão fica apagado e a janela mostra **"Falta R$ …"** em vermelho; com a metade, o que falta diminui; com o valor a mais, aparece **Troco** em verde. Ao confirmar: "OS entregue! … pagamento registrado" e a etapa vira Entregue. Depois: o campo Valor fica **cinza** (não digita), some o Salvar e aparece *"Esta OS já foi entregue em <data e hora> — valor travado: R$ …"*; no card de peças somem o botão Adicionar item e as lixeiras. No Financeiro existe um título no **valor exato do orçamento**, no nome do cliente.
  *Por que importa: é o único ponto em que o dinheiro do conserto entra no sistema — e OS entregue é caso encerrado, senão a ficha e o Financeiro contam histórias diferentes.*

- [ ] **⚪ 28. Reabrir OS entregue tem que pedir confirmação** **[CORREÇÃO RECENTE]**
  **O que fazer:** Na OS já entregue, use o seletor de etapa (ao lado do botão de avançar, mostra a etiqueta "Entregue") e escolha **Finalizado**. **Leia** a janela de confirmação e clique em **Cancelar**. Confira que nada mudou. Repita e, agora, clique em **OK**.
  **Tem que acontecer:** A janela avisa que a OS já foi entregue, diz **o valor exato que já está lançado no Financeiro**, avisa que a cobrança **CONTINUA lá** e que o orçamento volta a ser editável. Em Cancelar, tudo continua travado. Em OK, a etapa volta para Finalizado e o campo de valor volta a aceitar digitação.
  *Por que importa: reabrir sem aviso deixa a ficha mostrando um número e o Financeiro cobrando outro, sem nada na tela denunciando.*
  > 🔎 **Bug achado e corrigido em 22/08:** a correção de 21/08 que passou a valer também para OS que já nasce entregue (migration do dia) removeu, sem querer, a trava que impedia duplicar o título. Reabrir esta OS e entregar de novo criava um SEGUNDO título em Contas a Receber, cobrando o cliente duas vezes pelo mesmo conserto. Corrigido — voltou a checar se já existe título antes de criar outro.

- [ ] **⚪ 29. OS cancelada também trava o valor** **[CORREÇÃO RECENTE]**
  **O que fazer:** Abra **outra** OS de teste em andamento (não a entregue). No seletor de etapa, escolha a opção vermelha **Cancelar OS**. Olhe o card Valor do orçamento e o card Peças e serviços. Se essa OS tinha peça lançada, confira o Estoque.
  **Tem que acontecer:** A etiqueta vira **Cancelado**. O campo Valor fica cinza, sem botão Salvar, com o texto *"Esta OS foi cancelada — valor travado"*. O botão Adicionar item some. A quantidade da peça **volta a subir** no estoque (estorno).
  *Por que importa: antes, OS cancelada deixava o valor solto enquanto o resto da ficha já estava travado — duas regras na mesma tela confundem quem fecha o laudo.*
  > 🔎 **Bug achado e corrigido em 22/08:** o valor e os itens realmente travam, mas a peça lançada **não** voltava pro estoque ao cancelar — só existia esse estorno para venda cancelada no PDV, nunca para OS. A peça saía da prateleira digital para sempre. Corrigido — cancelar a OS agora devolve a peça ao estoque, com o mesmo tipo de registro em Movimentações que a venda já tinha.

- [ ] **⚪ 30. OS atrasada sobe para o topo, e os cartões filtram**
  **O que fazer:** Vá em **Ordens de Serviço** e ligue o **Modo Grade** (ícone de quadradinhos, canto superior direito). Olhe as primeiras linhas e a coluna **Prioridade**. Depois clique no cartão de contagem **Aguardando aprovação** (a fileira de 4 cartões acima da busca) e clique nele de novo para desfazer.
  **Tem que acontecer:** As **3 OS com prazo vencido aparecem NO TOPO**, com fundo levemente avermelhado e etiqueta vermelha "Xd atrasada" — inclusive à frente de OS marcadas como Urgente que ainda estão no prazo. Abaixo, a ordem segue por prioridade (Urgente, Alta, Normal, Baixa) e, dentro de cada uma, a mais antiga primeiro. O cartão clicado ganha borda destacada, a lista mostra só aquela etapa e **o número do cartão bate com a quantidade de linhas**.
  *Por que importa: atrasada é a única OS em que o cliente já tem motivo para ligar reclamando — se ela afunda na lista, o aparelho esquecido só reaparece quando o cliente chega bravo.*

---

## Bloco 7 — Fechar o caixa no fim do dia

- [ ] **⚪ 31. Sangria e suprimento (e movimento sem descrição não grava)**
  **O que fazer:** Em **Financeiro > Caixa**, anote o **Saldo esperado**. Clique em **Lançar movimento**, deixe o tipo **Sangria**, descrição `Retirada para depósito`, valor `100,00`, **Lançar**. De novo em Lançar movimento, tipo **Suprimento**, descrição `Troco trazido do cofre`, valor `50,00`, **Lançar**. Uma terceira vez, deixe a **descrição em branco** de propósito e clique em **Lançar**.
  **Tem que acontecer:** A sangria aparece com seta vermelha para cima e valor em vermelho com sinal de menos (−R$ 100,00), e o Saldo esperado **cai exatamente R$ 100,00**. O suprimento entra em verde com seta para baixo e o saldo **sobe R$ 50,00**. O contador "Movimentos" sobe a cada lançamento. A tentativa sem descrição **não grava nada**: aviso vermelho pedindo para preencher, e a janela continua aberta.
  *Por que importa: sangria com sinal trocado infla o caixa; movimento sem descrição vira linha órfã que ninguém explica no fechamento.*

- [ ] **⚪ 32. Fechamento às cegas — e a diferença acusada**
  **O que fazer:** **Anote no papel** o valor que está em "Saldo esperado". Clique em **Fechar caixa** e **leia a janela inteira antes de digitar**. Depois digite um valor **R$ 20 MAIOR** que o esperado anotado (ex.: esperado 1.234,00 → digite 1.254,00), escreva em Observações `teste de sobra` e clique em **Conferir e fechar**.
  **Tem que acontecer:** A janela pergunta "Quanto tem na gaveta agora?" e **em nenhum lugar aparece o valor que o sistema calculou** — só o aviso de que o esperado é mostrado depois; o botão "Conferir e fechar" fica desabilitado enquanto o campo estiver vazio. Depois de confirmar: aviso **"Caixa fechado"** e **"Sobrou R$ 20,00 na gaveta"**, em vermelho. A tela volta sozinha para o cartão **Abrir caixa**.
  *Por que importa: se o esperado aparece antes, ninguém conta a gaveta — só copia o número, e qualquer erro de troco ou furto passa batido para sempre.*

- [ ] **🔴 33. Abrir o caixa na mão, com valor na casa dos milhares** **[CORREÇÃO RECENTE]**
  **O que fazer:** No cartão **Abrir caixa**, digite exatamente `1.500,00` (com o ponto do milhar e a vírgula) em "Valor inicial na gaveta" e clique em **Abrir caixa**. Depois feche o caixa de novo (Fechar caixa > 1500 > Conferir e fechar) e, no cartão de abertura, digite `abc` e clique em **Abrir caixa**.
  **Tem que acontecer:** Na primeira vez o caixa abre com **Abertura R$ 1.500,00** (não R$ 0,00) e **sem** a tarja amarela de abertura automática — essa abertura foi de gente. Na segunda, com "abc", o caixa **não abre**: aviso vermelho dizendo que o valor de abertura é inválido.
  *Por que importa: valor com ponto de milhar já foi lido como R$ 0,00 em silêncio — o fundo de troco inteiro sumia e o fechamento acusava sobra de R$ 1.500.*

---

## Bloco 8 — Contas a pagar e fluxo de caixa

- [ ] **⚪ 34. Lançar conta de valor alto, dar baixa, e ver que título pago não cancela**
  **O que fazer:** Abra **Financeiro > Contas a Pagar > Nova conta a pagar**. Descrição `Aluguel de agosto — teste`, valor `2.800,00` (com ponto e vírgula), vencimento **hoje**, escolha uma **Categoria**, **Salvar**. Na linha criada, repare nos dois ícones da ponta direita: um **check verde** (dar baixa) e um **círculo cortado cinza** (cancelar). Clique no **check verde**. Depois olhe de novo os ícones dessa linha e tente cancelá-la.
  **Tem que acontecer:** O título aparece com **R$ 2.800,00** (não R$ 2,80 nem nada estranho), a categoria escolhida e etiqueta amarela **Vence hoje**; o quadro "Em aberto" soma esse valor. Depois da baixa: aviso "Título baixado", etiqueta **Pago** em verde, o valor sai de "Em aberto" e entra em "Já pago". Na linha, **o ícone de cancelar SUMIU** — sobra só o de desfazer (seta curva, "Reabrir"). Não existe nenhum caminho na tela para cancelar título já pago.
  *Por que importa: cancelar título pago apagaria o registro de que o dinheiro saiu de verdade — a gaveta esvazia e o sistema diz que nunca foi pago.*

- [ ] **⚪ 35. Cancelar um título em aberto e ver que ele para de contar**
  **O que fazer:** Crie um segundo título: `Conta errada — teste`, valor `300,00`, vencimento hoje. Anote o valor do quadro **Em aberto**. Clique no ícone de **círculo cortado** (cancelar) na linha dele.
  **Tem que acontecer:** A linha fica acinzentada com etiqueta **Cancelado**, **perde todos os ícones de ação** (não dá para reabrir nem pagar), e o quadro "Em aberto" diminui **exatamente R$ 300,00**.
  *Por que importa: título cancelado que continua somando faz a loja achar que deve mais do que deve.*

- [ ] **🔴 36. Fluxo de Caixa: o que já aconteceu x o que só está previsto** **[CORREÇÃO RECENTE]**
  **O que fazer:** Abra **Financeiro > Fluxo de Caixa**, período do mês atual (já vem preenchido). Compare os blocos **Realizado — o dinheiro que se moveu neste período** e **Previsto — o que vence neste período**. Procure na lista "Lançamentos do período" os dois títulos que você criou.
  **Tem que acontecer:** O aluguel de R$ 2.800,00 aparece em **Saiu** no bloco Realizado (foi baixado) e na lista, com a situação "Baixado em <hoje>". O título cancelado de R$ 300,00 **não aparece em lugar nenhum** — nem nos totais, nem na lista, nem na tabela "Por categoria".
  *Por que importa: misturar previsto com realizado, ou somar conta cancelada, mostra um saldo que não existe — e é nesse número que se decide comprar estoque.*
  > 🔎 **Nota do código (22/08):** os números batem certo — só os RÓTULOS mudaram no mesmo dia 21/08 (correção do passo 47, Bloco 11) e este passo, escrito de manhã, ficou com o texto antigo. Os títulos certos, hoje, são "Realizado — o dinheiro que se moveu neste período" e "Previsto — o que vence neste período" (o texto abaixo já foi ajustado).

---

## Bloco 9 — Os números do dia (relatórios e auditoria)

- [ ] **⚪ 37. Relatório Financeiro: o rodapé não pode somar título cancelado** **[CORREÇÃO RECENTE]**
  **O que fazer:** Abra **Relatórios > Relatório Financeiro** e **anote** o número do rodapé, na linha **"Saldo (sem cancelados)"**. Vá em **Financeiro > Contas a Pagar > Nova conta a pagar**: descrição `Teste rodape 21-08`, valor `1000,00`, vencimento **hoje**, Salvar. Volte ao Relatório Financeiro e aperte **F5** — o saldo deve ter piorado em R$ 1.000,00. Volte em Contas a Pagar e clique no ícone redondo de proibido (**Cancelar título**) na linha do teste. Volte ao relatório e atualize de novo.
  **Tem que acontecer:** Depois do cancelamento, a linha "Teste rodape 21-08" **continua aparecendo** na tabela, com Situação **Cancelado**, mas o rodapé "Saldo (sem cancelados)" volta a ser **exatamente o número que você anotou no começo**. O rodapé e o indicador "A pagar" lá em cima contam a mesma história.
  *Por que importa: rodapé somando cancelado dá dois resultados diferentes do mesmo mês na mesma tela.*

- [ ] **🔴 38. Relatório de Vendas: totais coerentes, e o CSV abre certo no Excel** **[CORREÇÃO RECENTE]**
  **O que fazer:** Abra **Relatórios > Relatório de Vendas** com o período do mês atual. Compare o rótulo do rodapé, o valor do rodapé (somando de cabeça a coluna **Total** das linhas) e os indicadores **Faturamento** e **Canceladas** no alto. Depois clique em **Exportar CSV**, abra a pasta Downloads e dê duplo clique no arquivo. Repita a exportação no Relatório Financeiro.
  **Tem que acontecer:** O rodapé se chama **"Total (sem canceladas)"** — o critério está escrito, não subentendido. O indicador "Canceladas" mostra 0 e o rodapé bate com a soma das linhas. **Faturamento** só pode ser MENOR que o rodapé se houver devolução no período (e hoje há) — nunca maior. O arquivo baixado se chama `relatorio_vendas_<data inicial>_a_<data final>.csv`; no Excel cada informação cai na **sua** coluna (Venda, Data, Cliente, Status, Desconto, Total), os acentos aparecem certos (Descrição, Situação) e os valores usam vírgula decimal.
  *Por que importa: se rodapé e Faturamento divergirem sem motivo, o número do mês está errado; e CSV embolado obriga a redigitar tudo à mão.*

- [ ] **⚪ 39. Logs / Auditoria mostra QUEM fez cada alteração** **[CORREÇÃO RECENTE]**
  **O que fazer:** Abra **Configurações > Logs / Auditoria**. Olhe a coluna **Quem** nas primeiras linhas — devem estar ali as ações que você acabou de fazer (criar e cancelar o "Teste rodape 21-08"). Clique no filtro **Título financeiro** e, numa linha marcada como **Alterou**, clique no link azul **"N campos"**.
  **Tem que acontecer:** Existe a coluna **Quem**, com o **seu nome** nas linhas das ações que você acabou de fazer. Ao abrir "N campos", aparece o campo que mudou com o valor antigo **riscado em vermelho** e o novo **em verde** (ex.: status: aberto → cancelado). Linhas antigas geradas pelo próprio banco aparecem como **"Sistema"**, nunca em branco.
  *Por que importa: log sem o nome de quem mexeu não serve para nada no dia em que sumir dinheiro ou um preço for alterado.*

---

## Bloco 10 — Dois testes finais (se ainda houver fôlego)

- [ ] **🔴 40. Orçamento é só simulação — não pode gravar venda**
  **O que fazer:** Vá em **Venda > Orçamento (Simulação)**. Clique em dois ou três produtos, escreva um nome em "Nome do cliente", digite um desconto e clique em **Imprimir** (pode cancelar a janela de impressão do navegador). Depois vá em **Venda > Histórico de Vendas** e confira se apareceu venda nova.
  **Tem que acontecer:** A tela calcula o "Total simulado" certinho e a impressão sai com o nome da loja e o texto **"ORÇAMENTO — SIMULAÇÃO, não é comprovante de venda"**. No Histórico **não aparece nenhuma venda nova**, e no PDV o estoque dos produtos usados continua igual.
  *Por que importa: simulação que grava venda cria faturamento fantasma e produto sumindo do estoque sem ninguém ter comprado.*

- [ ] **🔴 41. Quando a internet cai, a tela avisa em vez de mentir** **[CORREÇÃO RECENTE]**
  **O que fazer:** Com o PDV aberto, desligue o wi-fi (ou tire o cabo de rede) e aperte **F5**. Depois religue a internet e recarregue de novo.
  **Tem que acontecer:** Com a internet fora, aparecem avisos vermelhos do tipo *"Não consegui carregar os produtos" / "os clientes" / "as formas de pagamento"*, pedindo para verificar a internet e atualizar a página. **Não pode aparecer uma vitrine vazia calada**, como se a loja não tivesse produto cadastrado. Com a internet de volta, tudo carrega normal.
  *Por que importa: lista vazia sem aviso faz o vendedor dizer "não tem em estoque" para um produto que existe, ou cadastrar de novo um cliente que já existe.*

---

## Bloco 11 — Correções da tarde de 21/08 (todas novas, nenhuma testada na tela)

Este bloco não existia quando o roteiro foi escrito de manhã. São 14 correções feitas depois, todas verificadas no banco e **nenhuma vista na tela por uma pessoa**. Se o tempo estiver curto, este é o bloco mais valioso — é o que tem maior chance de esconder um erro.

- [ ] **⚪ 42. Devolver mais do que foi vendido é recusado** **[CORREÇÃO RECENTE]**
  **O que fazer:** Abra **Venda > Troca e Devolução**. Escolha uma venda que tenha um produto com quantidade 1 ou 2. Tente digitar, no campo de quantidade a devolver, um número **maior** do que foi vendido. Se o campo não deixar digitar (ele limita), tudo bem — devolva a quantidade inteira, salve, e depois tente abrir uma **segunda** devolução da mesma venda para o mesmo produto.
  **Tem que acontecer:** No primeiro caso, o campo não deixa passar do que foi vendido. No segundo, o sistema recusa com uma frase dizendo quanto a venda teve, quanto já foi devolvido e quanto resta — algo como *"a venda teve 2, e 2 já foi devolvida. Resta 0"*.
  *Por que importa: devolver a mais paga ao cliente dinheiro que ele nunca gastou e coloca no estoque uma unidade que nunca saiu — a diferença só apareceria no inventário, meses depois.*
  > 🔎 **Nota do código (22/08):** a trava do banco existe e recusa de verdade, com a frase prometida — mas na prática você não vai VER essa frase clicando pela tela normal: antes de enviar, a tela já corta (limita) a quantidade digitada para o que ainda pode ser devolvido, então o pedido que chega ao banco já vem certo. A frase só apareceria numa tentativa fora da tela (API direta) ou numa falha rara de sincronismo — o que importa (não dá pra devolver a mais) está garantido em dois lugares, não só um.

- [ ] **🔴 43. Venda devolvida fica marcada no Histórico e sai do total** **[CORREÇÃO RECENTE]**
  **O que fazer:** Depois de fazer a devolução do passo anterior, abra **Venda > Histórico de Vendas** e procure a venda que você devolveu. Olhe a linha dela e o indicador **Faturamento** no topo.
  **Tem que acontecer:** A linha tem uma etiqueta amarela **Devolvida**, e logo abaixo do valor aparece quanto foi devolvido, com sinal de menos. O indicador Faturamento desconta esse valor e o texto embaixo dele diz que descontou.
  *Por que importa: antes o rodapé somava a venda cheia; quem conferia via um faturamento maior do que o dinheiro que ficou na loja.*

- [ ] **⚪ 44. Produto devolvido some do ranking de mais vendidos** **[CORREÇÃO RECENTE]**
  **O que fazer:** Abra **Inteligência > IE Comercial** e ache o produto que você devolveu. Anote a quantidade e a receita dele. Depois abra **Inteligência > IE Estoque** e olhe o mesmo produto.
  **Tem que acontecer:** No IE Comercial, a quantidade e a receita já vêm **descontadas** da devolução. No IE Estoque, a quantidade vendida também. Um produto vendido 2 e devolvido 2 tem que aparecer como se tivesse girado zero, não dois.
  *Por que importa: essas telas decidem o que comprar de novo — produto que voltou inteiro não pode contar como sucesso de venda.*

- [ ] **🔴 45. Filtrar período no Histórico de Vendas traz o período certo** **[CORREÇÃO RECENTE]**
  **O que fazer:** Em **Venda > Histórico de Vendas**, escolha um período no filtro de datas (por exemplo, o mês inteiro). Anote o valor do indicador **Faturamento**. Agora abra **Relatórios > Relatório de Vendas** e escolha exatamente o mesmo período.
  **Tem que acontecer:** Os dois faturamentos batem (fora a diferença de devolução, que o Relatório também desconta). Se a lista bater em 500 vendas, aparece um aviso amarelo dizendo que há mais e apontando o Relatório para o número fechado.
  *Por que importa: antes as duas telas respondiam diferente para a mesma pergunta, e quem conferia não sabia em qual acreditar.*

- [ ] **🔴 46. Fluxo de Caixa separa o que vence do que foi pago** **[CORREÇÃO RECENTE]**
  **O que fazer:** Abra **Financeiro > Contas a Pagar** e crie uma conta com vencimento **no mês passado**. Dê baixa nela **hoje**. Agora abra **Financeiro > Fluxo de Caixa** e olhe dois períodos: o mês passado e este mês.
  **Tem que acontecer:** No mês passado, a conta aparece no **Previsto** (venceu lá) mas **não** no Realizado. Neste mês, aparece no **Realizado** (o dinheiro saiu hoje). Os títulos das seções dizem "o que vence neste período" e "o dinheiro que se moveu neste período".
  *Por que importa: antes uma conta paga fora do mês do vencimento contava como realizada no mês em que nenhum dinheiro se moveu.*

- [ ] **⚪ 47. Título manual agora tem dono** **[CORREÇÃO RECENTE]**
  **O que fazer:** Em **Financeiro > Contas a Pagar**, clique em **Novo título**. Olhe se existe o campo **Fornecedor**. Escolha um, preencha o resto e salve. Depois faça o mesmo em **Contas a Receber**, onde o campo tem que ser **Cliente**.
  **Tem que acontecer:** O campo existe nas duas telas, com a lista certa em cada uma (fornecedores numa, clientes na outra). Depois de salvar, o nome escolhido aparece na linha da tabela, logo abaixo da descrição.
  *Por que importa: sem o vínculo, não dá para responder "quanto o cliente X me deve" pelo Financeiro.*

- [ ] **⚪ 48. Não dá para cadastrar taxa de 5.000%** **[CORREÇÃO RECENTE]**
  **O que fazer:** Abra **Cadastros > Formas de Pagamento**, edite uma forma de cartão e tente colocar **150** no campo de taxa. Salve.
  **Tem que acontecer:** O sistema recusa. (A mensagem pode vir técnica — se vier, me avise o texto exato, porque aí falta traduzir.)
  *Por que importa: taxa digitada errado entra no cálculo de toda venda parcelada naquela forma e come a margem sem ninguém entender por quê.*

- [ ] **⚪ 49. Etapa de OS inventada é recusada** **[CORREÇÃO RECENTE]**
  **O que fazer:** Este é difícil de testar pela tela de propósito — a tela só oferece etapas válidas. O que dá para conferir: abra **Configurações > Gerenciar Status**, crie uma etapa nova chamada `Teste 21-08`, e vá ao Kanban de OS ver se ela aparece como coluna. Depois arraste uma OS para ela.
  **Tem que acontecer:** A etapa nova aparece no Kanban e aceita receber OS normalmente. (A trava nova só recusa etapa que **não existe** no cadastro — e você não consegue criar essa situação pela tela, que é justamente o ponto.)
  *Por que importa: a trava protege o caminho de integração e importação, onde um erro de digitação entraria calado na fila que alimenta as automações.*

- [ ] **🔴 50. "Orçamento em aberto" só conta o que o cliente aprovou** **[CORREÇÃO RECENTE]**
  **O que fazer:** Abra **Relatórios > Relatório de OS**. Olhe o indicador **Orçamento em aberto** e o texto embaixo dele. Compare com quantas OS estão nas etapas **Aprovado** e **Finalizado** no Kanban.
  **Tem que acontecer:** O valor corresponde só às OS aprovadas e finalizadas — OS em análise ou esperando resposta do cliente **não** entram. O texto embaixo diz de quantas OS o número veio.
  *Por que importa: antes somava toda OS não entregue e chamava de "aprovado", inflando a estimativa de caixa futuro com dinheiro que ainda dependia do cliente dizer sim.*

- [ ] **⚪ 51. Relatório Financeiro abre com dados** **[CORREÇÃO RECENTE]**
  **O que fazer:** Abra **Relatórios > Relatório Financeiro** com o seu usuário de administrador. Confira que aparecem títulos.
  **Tem que acontecer:** A lista vem preenchida. (Antes, quem tivesse só a permissão de "acessar o financeiro" abria a tela e via **vazio**, sem erro nenhum — parecia que não tinha lançamento no período.)
  *Por que importa: tela que abre vazia por falta de permissão engana — a pessoa acha que não há dado, não que não tem acesso.*

- [ ] **🔴 52. Trocar o perfil de um usuário não deixa ninguém sem perfil** **[CORREÇÃO RECENTE]**
  **O que fazer:** Abra **Cadastros > Usuários**, clique num usuário de teste (**não** no seu) e troque o perfil dele — por exemplo, de Vendedor para Técnico. Feche e abra a ficha de novo.
  **Tem que acontecer:** O perfil novo está lá. Em nenhum momento a pessoa aparece "Sem perfil".
  *Por que importa: antes eram duas operações separadas — se a segunda falhasse, a pessoa ficava sem perfil nenhum, ou seja, sem acesso ao sistema, e ninguém percebia.*

- [ ] **⚪ 53. O último administrador continua protegido** **[CORREÇÃO RECENTE]**
  **O que fazer:** Ainda em **Cadastros > Usuários**, tente trocar o **seu próprio** perfil de Administrador para outro (se você for o único administrador da loja).
  **Tem que acontecer:** O sistema **recusa**, dizendo que não dá para tirar o último administrador.
  *Por que importa: este teste existe porque a correção do passo anterior quase desligou essa trava sem querer — vale confirmar que ela continua de pé.*

- [ ] **🔴 54. Comprovante sem coluna de desconto vazia** **[CORREÇÃO RECENTE]**
  **O que fazer:** Abra uma venda no **Histórico de Vendas**, clique em **Imprimir** e olhe a tabela de produtos do comprovante em folha.
  **Tem que acontecer:** **Não existe** mais a coluna "Desconto" mostrando R$ 0,00 em todas as linhas. Se a venda teve desconto, ele continua aparecendo no rodapé, no total.
  *Por que importa: coluna zerada em todo comprovante não diz "não houve desconto" — diz "o sistema não sabe calcular", e o cliente lê isso.*

- [ ] **⚪ 55. Nada quebrou nas telas de configuração** **[CORREÇÃO RECENTE]**
  **O que fazer:** Passe rápido por **Configurações > Logs/Auditoria**, **Configurações > Perfis de Acesso**, **Configurações > Preferências** e **Financeiro > Caixa**. Só abra cada uma e veja se carrega.
  **Tem que acontecer:** Todas abrem normalmente, com dados.
  *Por que importa: essas quatro telas usavam um atalho de programação que foi removido hoje. A remoção foi verificada, mas é o tipo de mudança que só a tela confirma.*

---

## Bloco 12 — Numeração curta e linha do tempo (22 e 23/08)

Quatro testes das mudanças mais recentes: o número de venda e de OS ficaram curtos e sem reiniciar, e as duas telas ganharam linha do tempo. Nenhum deles foi visto na tela ainda.

Este bloco é rápido — uns 15 minutos — e cobre o que você mais vai olhar no dia a dia: o número que você fala em voz alta no balcão.

- [ ] **🔴 56. Venda nova sai como OV0001** **[CORREÇÃO RECENTE]**
  **O que fazer:** Abra o **PDV**, monte uma venda simples de qualquer produto e finalize. Anote o número que aparece no aviso verde. Faça uma **segunda** venda e anote o número dela também.
  **Tem que acontecer:** Os números têm o formato **OV** seguido de 4 dígitos — `OV0001`, `OV0002` — e o segundo é exatamente o primeiro **mais um**. Não aparece mês nem ano no meio.
  *Por que importa: antes o número reiniciava todo mês, então duas vendas de meses diferentes podiam ser as duas "0001" — e falar "a venda 1" exigia dizer o mês junto.*

- [ ] **🔴 57. Venda antiga continua com o número antigo** **[CORREÇÃO RECENTE]**
  **O que fazer:** Em **Venda > Histórico de Vendas**, role até as vendas mais antigas (as da massa de teste, de agosto).
  **Tem que acontecer:** Elas continuam com o número no formato antigo, tipo `VD-202608-0006`. **Não** podem ter sido renumeradas.
  *Por que importa: o número que o cliente levou no comprovante tem que continuar batendo com o do sistema — renumerar histórico quebraria isso.*

- [ ] **⚪ 58. OS nova sai como OS0001, e a antiga não muda** **[CORREÇÃO RECENTE]**
  **O que fazer:** Abra **Assistência > Nova OS**, preencha o mínimo (cliente, aparelho, defeito) e salve. Anote o número. Abra outra e anote. Depois vá em **Assistência > Ordens de Serviço** e olhe as OS antigas.
  **Tem que acontecer:** As novas saem `OS0001`, `OS0002`… sequenciais, sem mês no meio. As antigas continuam `OS-202608-000X`.
  *Por que importa: é o número que você fala no telefone quando o cliente liga perguntando do aparelho.*

- [ ] **⚪ 59. Linha do tempo da OS começa na abertura** **[CORREÇÃO RECENTE]**
  **O que fazer:** Abra a ficha de uma das OS que você acabou de criar (clique nela na lista). Role até o card **Linha do tempo**. Depois mude a etapa dela — por exemplo, de "Entrada/Análise" para "Aguardando aprovação" — e olhe o card de novo.
  **Tem que acontecer:** Antes de mudar qualquer coisa, já aparece uma linha **"OS aberta"** com a data, a **hora e o minuto**, e o seu nome. Depois de mudar a etapa, aparece uma segunda linha mostrando de qual etapa para qual, também com hora, minuto e quem fez. As linhas ficam em ordem de horário.
  *Por que importa: "quando esse aparelho entrou e quem recebeu" é a pergunta mais feita quando o cliente liga — antes essa informação estava só no cabeçalho, separada do resto da cronologia.*

- [ ] **⚪ 60. Aprovação aparece na linha do tempo com hora** **[CORREÇÃO RECENTE]**
  **O que fazer:** Pegue uma OS, coloque um valor no orçamento e leve ela até a etapa **Aprovado**. Volte ao card **Linha do tempo**.
  **Tem que acontecer:** Existe uma linha registrando a passagem para **Aprovado**, com data, hora, minuto e o nome de quem aprovou.
  *Por que importa: é a hora que responde "quando o cliente autorizou o serviço", se ele contestar o valor na retirada.*

---

---

## Bloco 13 — Usuários (assuntos de 23/08)

- [ ] **🔴 61. Criar um usuário pela tela**
  **O que fazer:** Em **Cadastros > Usuários**, clique em **Novo usuário**.
  Preencha nome, um e-mail como `teste@riopretogames.com.br`, clique em
  **Sortear** para a senha e escolha o perfil **Vendedor**. **Anote a senha.**
  **Tem que acontecer:** Aviso **verde** de "Usuário criado", e a pessoa
  aparece na lista já marcada como **Vendedor** — não como "Sem perfil".
  **NÃO PODE:** aviso técnico tipo "Edge Function returned a non-2xx status
  code". Se aparecer isso, me mande a frase inteira.
  *Por que importa: até 23/08 criar usuário só dava para fazer pelo painel do
  Supabase, fora do sistema.*

- [ ] **🔴 62. O mesmo e-mail duas vezes é recusado**
  **O que fazer:** Clique em **Novo usuário** e use **o mesmo e-mail** do passo
  anterior.
  **Tem que acontecer:** Aviso vermelho dizendo **"Já existe um usuário com
  este e-mail"** — nessas palavras, não um erro técnico.
  *Por que importa: dois cadastros da mesma pessoa é o problema que a loja já
  teve com cliente. Com usuário seria pior: duas contas de acesso.*

- [ ] **🔴 63. Arquivar não pode apagar venda**
  **O que fazer:** Em **Gerenciar** num usuário que JÁ FEZ VENDA, role até o
  bloco vermelho. Arquive. Depois abra **Venda > Histórico** e ache uma venda
  dele. Por fim, volte em Usuários, clique em **Mostrar arquivados** e em
  **Trazer de volta**.
  **Tem que acontecer:** O botão diz **Arquivar** (não "Excluir"), e o texto
  explica que as vendas continuam. Depois de arquivar, a venda continua no
  histórico **com o nome dele**. Ao trazer de volta, ele reaparece marcado como
  **Inativo**.
  **NÃO PODE:** a venda sumir, ou ficar sem vendedor.
  *Por que importa: é a regra que você pediu em 23/08 — sair da tela sem sumir
  do histórico. Apagar de verdade deixaria a venda sem ninguém, para sempre.*

- [ ] **⚪ 64. Trocar a senha de alguém**
  **O que fazer:** Em **Gerenciar**, bloco **Senha de acesso**, clique em
  **Trocar**, sorteie uma senha nova e salve.
  **Tem que acontecer:** Aviso verde de "Senha trocada".
  *Por que importa: é o socorro de quando um funcionário esquece a senha no
  meio do expediente.*

---

## Bloco 14 — Entrada de mercadoria (23/08)

- [ ] **🔴 65. Anote o antes**
  **O que fazer:** Em **Estoque > Produtos**, escolha um produto que tenha
  estoque e tenha custo. Anote o **nome**, as **unidades** e o **custo**.
  *Por que importa: sem esse número no papel, os dois passos seguintes não têm
  como ser conferidos.*

- [ ] **🔴 66. Dar entrada, e o custo virar média**
  **O que fazer:** Abra **Estoque > Entrada de Mercadoria**, clique em **Nova
  entrada**, escolha o fornecedor, **deixe a nota fiscal em branco**, adicione
  o produto do passo anterior com quantidade **10** e um preço de compra bem
  diferente do custo atual (se o custo é R$ 20, ponha R$ 50). Salve e volte em
  Estoque > Produtos.
  **Tem que acontecer:** Antes de salvar, aparece uma linha avisando que o
  custo vai passar de X para Y, e **Y fica entre** o custo antigo e o preço
  novo — nunca igual ao preço novo. Depois de salvar, o estoque é o anotado
  **+ 10** e o custo é o valor Y.
  *Por que importa: se o custo virasse os R$ 50 cheios, tudo que já estava na
  prateleira passaria a "valer" R$ 50 e sua margem apareceria errada.*

- [ ] **🔴 67. A compra caiu no financeiro, já paga**
  **O que fazer:** Abra **Financeiro > Contas a Pagar**.
  **Tem que acontecer:** Existe um lançamento **"Compra de mercadoria EM0001"**
  no valor de 10 × o preço digitado, com status **pago**, apontando para o
  fornecedor, e a observação dizendo **"Nota fiscal ainda não recebida"**.

- [ ] **⚪ 68. Divergência não trava a entrada**
  **O que fazer:** Faça outra entrada e, no campo **"Veio diferente do
  pedido?"**, escreva `Vieram 2 a menos`.
  **Tem que acontecer:** O sistema **deixa salvar** — não bloqueia. Na lista, a
  entrada aparece com tarja **divergência**.
  *Por que importa: a mercadoria já está fisicamente na loja. Se o sistema
  segurasse a entrada, o estoque na tela mentiria sobre a prateleira.*

---

## Bloco 15 — Os dois painéis (23/08)

- [ ] **🔴 69. Fazer uma devolução de verdade**
  **O que fazer:** Anote o faturamento de um vendedor em **Dashboards >
  Venda**, tabela Ranking. Vá em **Venda > Troca e Devolução** e faça uma
  devolução de uma venda **daquele vendedor**. Volte ao painel e aperte `F5`.
  **Tem que acontecer:** O valor dele caiu **exatamente o valor devolvido**, e
  o dos outros ficou igual.
  *Por que importa: a regra está testada automaticamente, mas com dados de
  mentira. **Nunca houve uma devolução de verdade neste banco** — a sua será a
  primeira, e é a única forma de saber se a tela de Troca e Devolução grava
  tudo que o painel espera encontrar.*

- [ ] **⚪ 70. Os números fazem sentido com a sua loja**
  **O que fazer:** Abra **Dashboards > Venda** e **Dashboards > Assistência**.
  Some no papel o faturamento de todos os vendedores do Ranking e compare com
  o card **Vendas da Semana**. Na Assistência, olhe **Tempo Médio de Reparo** e
  **Aparelhos Parados**.
  **Tem que acontecer:** Os dois valores batem, e os números da bancada
  conferem com o que você sabe.
  *Se o ranking não bater com o card, a diferença é o que foi vendido sem
  vendedor preenchido — me diga de quanto foi.*
  *Por que importa: a máquina testa a conta com dados de mentira; só você sabe
  se "tempo médio de 3 dias" bate com a realidade.*

- [ ] **⚪ 71. Serviço escrito de dois jeitos conta junto**
  **O que fazer:** Em duas OS diferentes, lance o mesmo serviço escrito
  diferente: numa `Troca de tela`, na outra `troca de tela ` (minúsculo, com
  espaço no fim). Entregue as duas e abra a Assistência.
  **Tem que acontecer:** Aparece **uma linha só**, com **2 vezes**.
  *Por que importa: o sistema guarda o serviço como texto digitado, não como
  item de cadastro. Sem juntar as variações, o serviço mais feito da loja
  apareceria espalhado e nenhuma linha pareceria importante.*

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

Priorize me mandar primeiro as falhas dos passos marcados **[CORREÇÃO RECENTE]** — são os que testam coisas consertadas agora e que têm mais chance de estar quebradas de novo.
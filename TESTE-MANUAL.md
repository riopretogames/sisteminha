# O que só você pode testar

**Tempo: 2h10 a 2h30.** São 37 testes.

Este documento é diferente do `ROTEIRO-DE-TESTE.md`. Aquele tem 61 passos e
cobre o sistema inteiro — mas **46 deles já foram conferidos no código e no
banco**, com resultado confirmado. Repetir aqueles seria gastar seu tempo com o
que já se sabe que funciona.

O que sobrou é o que **nenhuma verificação automática alcança**: como a tela se
comporta com uma pessoa na frente. Layout, mensagem, fluxo, e o que só aparece
quando alguém de verdade clica.

---

## Antes de começar

1. Abra o terminal na pasta do sisteminha e rode:
   ```
   npm run dev
   ```
2. Abra **http://localhost:8080** no navegador.
3. Entre com o seu usuário de administrador.

**Tenha à mão:** papel e caneta (alguns testes pedem para anotar um número
antes e comparar depois), e o celular se quiser marcar na versão clicável.

**Se algo falhar:** não tente consertar nem investigar. Anote o número do
teste, o que você fez, o que esperava e o que aconteceu — e tire um print da
tela inteira. Depois siga para o próximo: os testes foram ordenados para que
uma falha não derrube os seguintes.

---

## Parte 1 — Criar usuário e testar com ele (20 min)

Esta é a parte mais valiosa do documento, e a única que **não tem como ser
verificada de nenhum outro jeito**. Quatro problemas graves já apareceram neste
sistema com o mesmo padrão: a tela abre, os dados não vêm, e ninguém recebe
erro. Só se descobre com um usuário de permissão reduzida.

Até 22/08 essa parte dependia de você criar o usuário no painel do Supabase.
Agora o próprio sistema cria — e a criação virou parte do teste.

- [ ] **1. Criar um Vendedor pela tela**
  Em **Cadastros > Usuários**, clique em **Novo usuário** (canto direito, no
  alto). Preencha nome, um e-mail como `vendedor.teste@riopretogames.com.br`,
  clique em **Sortear** para gerar a senha, e escolha o perfil **Vendedor**.
  **Anote a senha antes de salvar.**
  **Tem que acontecer:** aviso **verde** de "Usuário criado", e a pessoa
  aparece na lista já marcada como **Vendedor** — não como "Sem perfil".
  **NÃO PODE:** aviso genérico tipo "Edge Function returned a non-2xx status
  code". Se aparecer isso, me mande a frase inteira.

- [ ] **2. O mesmo e-mail duas vezes é recusado**
  Clique em **Novo usuário** de novo e use **o mesmo e-mail** do teste 1.
  **Tem que acontecer:** aviso vermelho dizendo **"Já existe um usuário com
  este e-mail"** — nessas palavras, não um erro técnico.
  *Dois cadastros da mesma pessoa é o problema que a loja já teve com cliente.
  Aqui seria pior: duas contas de acesso para o mesmo funcionário.*

- [ ] **3. Senha curta é barrada**
  Ainda no formulário, apague a senha e digite `123`.
  **Tem que acontecer:** o botão **Criar usuário** fica **desabilitado** — a
  tela nem deixa tentar. Cancele e siga.

- [ ] **4. Estoque com o Vendedor — o teste mais importante de todos**
  Abra uma **janela anônima** (`Ctrl + Shift + N`), entre com o Vendedor que
  você criou, e abra **Estoque > Produtos**.
  **Tem que acontecer:** a tabela carrega normalmente, **sem** as colunas
  **Custo** e **Margem** — só Produto, Categoria, Preço, Estoque e Local.
  **NÃO PODE:** tela em branco, tela travada, ou erro.
  *Este era o pior bug do sistema: a tela ficava totalmente branca para
  Vendedor e Técnico, e eles não conseguiam nem consultar preço para o
  cliente.*
  *Use a janela anônima o resto da Parte 1: assim você fica com as duas contas
  abertas ao mesmo tempo, sem ficar saindo e entrando.*

- [ ] **5. Ainda como Vendedor: Movimentações e Estoque Crítico**
  Abra **Estoque > Movimentações** e **Estoque > Estoque Crítico**.
  **Tem que acontecer:** as duas carregam. Em Movimentações some a coluna
  Valor. Em Estoque Crítico, o último quadrinho diz **"Valor em venda"** em
  vez de "Custo para repor tudo".

- [ ] **6. Ainda como Vendedor: as telas de dinheiro**
  Abra **Financeiro > Caixa** e **Relatórios > Relatório Financeiro**.
  **Tem que acontecer:** ou a tela abre **com dados**, ou o item nem aparece no
  menu. **O que não pode é abrir vazia** — tela vazia por falta de permissão
  engana, porque parece "não tem lançamento nenhum".
  *Anote qual das duas coisas aconteceu em cada tela.*

- [ ] **7. Ainda como Vendedor: o botão de criar usuário não existe**
  Abra **Cadastros > Usuários** na janela do Vendedor (se o item aparecer no
  menu).
  **Tem que acontecer:** **não existe** o botão **Novo usuário**.
  **NÃO PODE:** o botão aparecer. Se aparecer, clique nele e tente criar
  alguém — o servidor tem que recusar com **"Seu perfil de acesso não permite
  criar ou alterar usuários"**. Me avise em qualquer um dos dois casos.
  *A trava de verdade é no servidor, não no botão. O botão escondido é só
  educação com quem está usando.*

- [ ] **8. Ainda como Vendedor: trocar perfil de alguém**
  Clique em **Gerenciar** num usuário.
  **Tem que acontecer:** o seletor de **Perfil** está **desabilitado**, com uma
  linha embaixo explicando que trocar perfil exige outra permissão.
  **NÃO PODE:** o seletor estar habilitado e dar erro depois do clique.

- [ ] **9. Trocar a senha do Vendedor (de volta como administrador)**
  Na sua janela normal, em **Cadastros > Usuários**, clique em **Gerenciar** no
  Vendedor, e no bloco **Senha de acesso** clique em **Trocar**. Sorteie uma
  senha nova e salve. **Anote.**
  **Tem que acontecer:** aviso verde de "Senha trocada".
  Agora, na janela anônima, **saia e entre de novo** com a senha **antiga**.
  **Tem que acontecer:** não entra.
  Entre com a **nova**.
  **Tem que acontecer:** entra normalmente.
  *É o socorro de quando um funcionário esquece a senha no meio do expediente.*

---

## Parte 2 — Número e linha do tempo (15 min)

A lógica destes eu já testei no banco e passou. O que falta é ver **na tela**.

- [ ] **10. Venda nova sai OV0001**
  Faça uma venda simples no **PDV** e anote o número do aviso. Faça outra.
  **Tem que acontecer:** `OV0001` e `OV0002` — quatro dígitos, sem mês no meio,
  e o segundo é o primeiro mais um.

- [ ] **11. OS nova sai OS0001**
  Abra **Assistência > Nova OS**, preencha o mínimo e salve. Anote o número.
  Abra outra.
  **Tem que acontecer:** `OS0001` e `OS0002`.

- [ ] **12. Documento antigo NÃO pode ter mudado**
  Em **Venda > Histórico** e em **Assistência > Ordens de Serviço**, olhe os
  registros antigos.
  **Tem que acontecer:** continuam `VD-202608-000X` e `OS-202608-000X`.
  **Se tiverem virado OV/OS curto, me avise na hora** — o número do comprovante
  que o cliente levou pararia de bater com o do sistema.

- [ ] **13. Linha do tempo da OS, com o SEU nome**
  Abra a ficha de uma OS que você acabou de criar e role até **Linha do tempo**.
  **Tem que acontecer:** já aparece **"OS aberta"** com data, **hora e minuto**,
  e **o seu nome**.
  Agora mude a etapa dela (por exemplo, para "Aguardando aprovação") e olhe de
  novo.
  **Tem que acontecer:** aparece uma segunda linha, de qual etapa para qual,
  com hora e **o seu nome**.
  *Esta é a única parte que meu teste no banco não conseguiu provar: lá não
  existe usuário logado, então o nome saía vazio. Só o seu clique confirma.*

- [ ] **14. Aprovação com hora e nome**
  Ponha um valor no orçamento dessa OS e leve ela até a etapa **Aprovado**.
  Volte na Linha do tempo.
  **Tem que acontecer:** existe a linha da passagem para Aprovado, com hora,
  minuto e o seu nome.
  *É o registro que responde "quando o cliente autorizou este serviço", se ele
  contestar o valor na retirada.*

---

## Parte 3 — Impressão e papel (10 min)

Nada disso pode ser verificado sem olhar o papel (ou a prévia de impressão).

- [ ] **15. Comprovante de venda em folha**
  Abra uma venda no **Histórico**, clique em **Imprimir** e escolha o formato
  de folha.
  **Tem que acontecer:** o comprovante sai completo — cabeçalho com dados da
  loja, itens, total, forma de pagamento. **Não existe** uma coluna "Desconto"
  mostrando R$ 0,00 em todas as linhas.
  *Confira também se a logo da loja aparece, se você já cadastrou uma.*

- [ ] **16. Comprovante térmico**
  Mesmo caminho, escolha o formato **térmica 80mm**.
  **Tem que acontecer:** cabe na largura, não corta texto, e os valores estão
  alinhados.

- [ ] **17. Venda com desconto no papel**
  Faça uma venda **com desconto** e imprima.
  **Tem que acontecer:** o desconto aparece no rodapé, e o total bate com o que
  foi cobrado.

---

## Parte 4 — Interação de verdade (15 min)

- [ ] **18. Arrastar cartão no Kanban**
  Abra **Assistência > Ordens de Serviço** na visão de quadro. Arraste um
  cartão de uma coluna para outra.
  **Tem que acontecer:** o cartão fica na coluna nova e não volta sozinho. Se
  você não tiver permissão para aquela transição, aparece um aviso **antes** de
  o cartão se mover.

- [ ] **19. Criar etapa nova e ver no quadro**
  Em **Configurações > Gerenciar Status**, crie uma etapa chamada
  `Teste 23-08`. Volte ao Kanban.
  **Tem que acontecer:** ela aparece como coluna nova, e aceita receber OS.
  Depois tente **excluir uma etapa fixa** (como "Entregue").
  **Tem que acontecer:** o sistema recusa, com explicação.

- [ ] **20. Filtros que não perdem o que você digitou**
  Em **Venda > Histórico de Vendas**, use o filtro de período e mais um filtro
  (vendedor ou forma de pagamento). Depois clique em **Limpar filtros**.
  **Tem que acontecer:** os filtros somem juntos, a lista volta ao normal, e o
  botão Limpar está sempre visível — não escondido atrás de outro clique.

- [ ] **21. Quando a internet cai**
  Com o PDV aberto, **desligue o wi-fi** (ou tire o cabo) e aperte **F5**.
  Depois religue e recarregue.
  **Tem que acontecer:** aparecem avisos **vermelhos** — "Não consegui carregar
  os produtos", "os clientes", "as formas de pagamento". **Não pode** aparecer
  uma vitrine vazia calada, como se a loja não tivesse produto cadastrado.

- [ ] **22. Passada geral nas telas de configuração**
  Abra, uma por uma, e veja se carregam com dados:
  **Configurações > Logs/Auditoria** (confira se tem a coluna **Quem**),
  **Configurações > Perfis de Acesso**, **Configurações > Preferências**,
  **Configurações > Minha Empresa**.
  *Essas telas usavam um atalho de programação que foi removido. A remoção foi
  verificada, mas é o tipo de mudança que só a tela confirma.*

---

## Parte 5 — Entrada de mercadoria (20 min)

Tela nova, feita em 23/08 em cima do que você me contou sobre como a loja
recebe. A lógica eu testei no banco e as onze verificações passaram — falta a
tela. Faça esta parte como **administrador**.

Antes de começar: precisa existir pelo menos **um fornecedor cadastrado** em
Cadastros > Fornecedores. Se não tiver, cadastre um qualquer.

- [ ] **23. Anote o antes**
  Em **Estoque > Produtos**, escolha um produto que **tenha estoque e tenha
  custo**. Anote no papel: o **nome**, quantas **unidades** tem, e o **custo**.
  *Sem esse número anotado, os dois testes seguintes não têm como ser
  conferidos.*

- [ ] **24. Dar entrada**
  Abra **Estoque > Entrada de Mercadoria** e clique em **Nova entrada**.
  Escolha o fornecedor, **deixe a nota fiscal em branco**, procure o produto do
  teste 23 e adicione. Ponha quantidade **10** e preço de compra bem diferente
  do custo atual (se o custo é R$ 20, ponha R$ 50).
  **Tem que acontecer:** aparece uma linha embaixo do item avisando que o custo
  vai passar de X para Y, **antes** de você salvar — e Y fica **entre** o custo
  antigo e o preço novo, nunca igual ao preço novo.
  Salve.
  **Tem que acontecer:** aviso verde, e a entrada aparece na lista como
  `EM0001`, com a coluna Nota fiscal dizendo **"ainda não chegou"**.

- [ ] **25. Conferir o estoque e o custo**
  Volte em **Estoque > Produtos** e ache o produto.
  **Tem que acontecer:** o estoque é o que você anotou **+ 10**, e o custo é o
  valor Y que a tela avisou — **não** o preço que você digitou.
  *Este é o coração da decisão que você tomou hoje. Se o custo tivesse virado
  os R$ 50 cheios, tudo que já estava na prateleira passaria a "valer" R$ 50 e
  sua margem apareceria errada.*

- [ ] **26. A compra caiu no financeiro, já paga**
  Abra **Financeiro > Contas a Pagar** (ou Títulos).
  **Tem que acontecer:** existe um lançamento **"Compra de mercadoria EM0001"**
  no valor de 10 × o preço que você digitou, com status **pago**, apontando
  para o fornecedor, e a observação dizendo **"Nota fiscal ainda não
  recebida"**.

- [ ] **27. Divergência não trava a entrada**
  Faça outra entrada. Adicione um produto e, no campo **"Veio diferente do
  pedido?"**, escreva `Vieram 2 a menos`.
  **Tem que acontecer:** o sistema **deixa salvar normalmente** — não bloqueia.
  Na lista, a entrada aparece com uma tarja **divergência**.
  **NÃO PODE:** o sistema recusar a entrada.
  *A mercadoria já está fisicamente na loja. Se o sistema segurasse a entrada,
  o estoque na tela mentiria sobre o que tem na prateleira.*

- [ ] **28. Entrada sem produto nenhum é barrada**
  Comece uma entrada nova, escolha o fornecedor e **não adicione nenhum
  produto**.
  **Tem que acontecer:** o botão **Dar entrada** fica desabilitado.

---

## Parte 6 — Os dois painéis (30 min)

Telas de 23/08. As contas eu testei — 73 testes automáticos, mais uma
devolução de mentira criada no banco só para medir o abatimento. O que falta é
ver na tela, com os seus números.

Faça como **administrador**.

- [ ] **29. Dashboard de Vendas: os cards novos**
  Abra **Dashboards > Venda** e role até a segunda fileira de cards.
  **Tem que acontecer:** aparecem **Melhor Vendedor da Semana** (com o nome e
  quantas vendas) e **Horário de Pico** (uma faixa tipo "14h às 15h").
  **NÃO PODE:** aparecer alguém chamado "Sem nome" no melhor vendedor.
  *Venda sem vendedor preenchido é ignorada de propósito — um funcionário
  fantasma disputando o primeiro lugar seria pior que não mostrar.*

- [ ] **30. A conta do ranking fecha**
  Na mesma tela, some no papel o faturamento de **todos** os vendedores da
  tabela **Ranking de Vendedores** e compare com o card **Vendas da Semana**.
  **Tem que acontecer:** os dois valores batem.
  *Se não baterem, a diferença é exatamente o que foi vendido sem vendedor
  preenchido. Me diga de quanto foi.*

- [ ] **31. Devolução desconta de quem vendeu — o teste mais importante desta parte**
  Anote o faturamento de um vendedor no ranking. Agora vá em
  **Venda > Troca e Devolução** e faça uma **devolução** de uma venda **daquele
  vendedor**. Volte ao Dashboard de Venda e aperte `F5`.
  **Tem que acontecer:** o valor daquele vendedor **caiu exatamente o valor
  devolvido**, e o de todos os outros ficou igual.
  **NÃO PODE:** o valor continuar o mesmo, ou o desconto respingar em outro
  vendedor.
  *Você me corrigiu nisso hoje: eu tinha deixado sem descontar, alegando que
  não dava para saber de quem descontar. Dava — a devolução guarda a venda de
  origem, e a venda guarda o vendedor. **Este teste é a prova disso.***
  *Nunca houve uma devolução de verdade neste banco: a sua será a primeira.*

- [ ] **32. Categorias e formas de pagamento**
  Ainda no Dashboard de Venda, olhe **Categorias Mais Vendidas** e **Como o
  Cliente Paga**.
  **Tem que acontecer:** as duas tabelas têm conteúdo e a coluna **Fatia**
  mostra uma barrinha com a porcentagem. As porcentagens de cada tabela somam
  perto de 100%.

- [ ] **33. Dashboard de Assistência abre**
  Abra **Dashboards > Assistência** — é um item novo no menu.
  **Tem que acontecer:** a tela abre com quatro cards no topo (Entraram Hoje,
  Entregues na Semana, Ticket Médio da OS, Na Bancada Agora).
  **Se o item não aparecer no menu**, saia e entre de novo no sistema: a
  permissão é nova e é lida quando a página carrega. Se ainda assim não
  aparecer, me avise.

- [ ] **34. Aparelhos parados há mais tempo**
  Role até o quadro **Aparelhos Parados Há Mais Tempo**.
  **Tem que acontecer:** lista as OS que ainda não foram entregues, da mais
  antiga para a mais nova, com quantos dias cada uma está parada. Passou de 7
  dias fica **laranja**, passou de 15 fica **vermelho**.
  *Este quadro ignora o recorte de semana de propósito: o aparelho esquecido
  do mês passado é justamente o que precisa aparecer.*

- [ ] **35. Técnico, tempo de reparo e fila**
  Ainda na Assistência, confira **Melhor Técnico da Semana**, **Tempo Médio de
  Reparo** e a tabela **Fila por Etapa**.
  **Tem que acontecer:** o tempo médio faz sentido com a realidade da bancada,
  e a soma da coluna **OS** da Fila por Etapa bate com o card **Na Bancada
  Agora**.
  *Se você não entregou nenhuma OS esta semana, Melhor Técnico e Tempo Médio
  aparecem com um traço. Isso é o certo, não é falha.*

- [ ] **36. Serviços, peças e mão de obra**
  Ainda na Assistência, role até **Serviços Mais Realizados**, **Peças Mais
  Usadas** e os cards **Mão de Obra da Semana** / **Peças da Semana**.
  **ATENÇÃO — provavelmente vai estar quase tudo vazio, e isso NÃO é falha.**
  Conferi no banco: existem 13 OS, mas **um único item lançado** nelas todas
  (uma limpeza de R$ 150). Sem peça ou serviço lançado na ficha da OS, não há
  o que somar.
  **Para testar de verdade:** abra uma OS, clique em **Lançar item**, e lance
  **um serviço** (ex.: `Troca de tela`, R$ 200) e **uma peça** do estoque.
  Entregue essa OS. Volte ao painel e aperte `F5`.
  **Tem que acontecer:** o serviço aparece em Serviços Mais Realizados, a peça
  em Peças Mais Usadas, e os dois cards se dividem — mão de obra de um lado,
  peça do outro, cada um com a sua porcentagem.

- [ ] **37. Variação de digitação conta junto**
  Em duas OS diferentes, lance o mesmo serviço escrito diferente: numa
  `Troca de tela`, na outra `troca de tela ` (com espaço no fim, minúsculo).
  Entregue as duas e volte ao painel.
  **Tem que acontecer:** aparece **uma linha só**, com **2 vezes** — não duas
  linhas de 1.
  *O sistema guarda o serviço como texto digitado, não como um item do
  cadastro. Sem juntar as variações, o serviço mais feito da loja apareceria
  espalhado em três linhas e nenhuma delas pareceria importante.*

---

## Sobre a cor dos avisos

**Os avisos de sucesso SÃO verdes** — foram aplicados em 22/08, em 33 avisos
espalhados por 24 telas. Se algum aviso de "salvo", "cadastrado" ou "concluído"
sair **cinza**, isso É uma falha e vale anotar.

Duas exceções, que estão cinza/vermelho de propósito e **não** devem ser
anotadas:

- **"Logo enviada — clique em Salvar para confirmar"** (Minha Empresa). É etapa
  do meio, não conclusão: verde ali diria "acabou" quando ainda falta salvar.
- **"OS criada, mas o checklist não foi salvo"** (Nova OS). Sucesso parcial com
  problema — sai em vermelho, que é o certo.

*(Uma versão anterior deste documento dizia que os avisos ainda eram cinzas.
Estava errado: eu li a nota da conferência de 22/08 sem ver que o commit
seguinte, do mesmo dia, já tinha aplicado a cor.)*

---

## Se algo falhar

Anote quatro coisas, e siga em frente:

1. **O número e o nome do teste** (ex.: "Teste 4 — Estoque com o Vendedor").
2. **O que você fez** — o clique exato, o valor digitado, qual cliente e qual
   produto.
3. **O que você esperava** — está escrito no teste.
4. **O que aconteceu de verdade** — copie o texto do aviso da tela, palavra por
   palavra, se houver.

E tire um **print da tela inteira** (`Print Screen`, ou `Windows + Shift + S`
para recortar), incluindo o menu lateral, para dar para saber em que tela foi.

**Se a tela ficar branca ou travar:** aperte `F5` uma vez. Se voltar, anote
isso ("ficou branca, F5 resolveu"). Se não voltar, anote e pule para a próxima
parte.

**Prioridade se o tempo acabar:** a **Parte 1** é a mais importante — ela é a
única que nenhuma outra forma de verificação alcança, e já revelou quatro
problemas graves neste sistema.

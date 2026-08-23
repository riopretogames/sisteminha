# O que só você pode testar

**Tempo: 1h a 1h20.** São 25 testes.

Este documento é diferente do `ROTEIRO-DE-TESTE.md`. Aquele tem 61 passos e
cobre o sistema inteiro — mas **46 deles já foram conferidos no código e no
banco**, com resultado confirmado. Repetir aqueles seria gastar seu tempo com o
que já se sabe que funciona.

O que sobrou é o que **nenhuma verificação automática alcança**: como a tela se
comporta com uma pessoa na frente. Layout, mensagem, fluxo, e o que só aparece
quando alguém de verdade clica.

**Em 23/08 esta lista encolheu de novo.** Passei a conseguir abrir as telas do
sistema num navegador de mentira, com o perfil que eu quiser — então tudo que
era "entre como Vendedor e veja se some a coluna de custo" virou teste
automático, que roda em dois segundos toda vez. São 48 verificações de tela
que saíram das suas mãos — incluindo todos os números dos painéis.

**Você não precisa mais criar um segundo usuário nem usar janela anônima.**

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

## Parte 1 — Usuários (10 min)

Esta parte encolheu de 9 passos para 4. Os outros cinco viraram **teste
automático** em 23/08 — inclusive o que abria o Estoque com perfil de
Vendedor, que era o mais importante do documento inteiro.

**Você não precisa mais criar um segundo usuário nem usar janela anônima.**
Rodam sozinhos, em dois segundos, toda vez que eu rodo `npm run check`.

O que sobrou aqui é o que depende do servidor de verdade — criar conta,
trocar senha — e não dá para simular.

- [ ] **1. Criar um usuário**
  Em **Cadastros > Usuários**, clique em **Novo usuário**. Preencha nome, um
  e-mail como `teste@riopretogames.com.br`, clique em **Sortear** para a senha
  e escolha o perfil **Vendedor**. **Anote a senha.**
  **Tem que acontecer:** aviso **verde** de "Usuário criado", e a pessoa
  aparece na lista já marcada como **Vendedor**.
  **NÃO PODE:** aviso técnico tipo "Edge Function returned a non-2xx status
  code". Se aparecer isso, me mande a frase inteira.

- [ ] **2. O mesmo e-mail duas vezes é recusado**
  Clique em **Novo usuário** e use **o mesmo e-mail** do teste 1.
  **Tem que acontecer:** aviso vermelho dizendo **"Já existe um usuário com
  este e-mail"** — nessas palavras, não um erro técnico.

- [ ] **3. Trocar a senha de alguém**
  Em **Gerenciar** no usuário que você criou, bloco **Senha de acesso**,
  clique em **Trocar**, sorteie uma senha nova e salve. **Anote.**
  **Tem que acontecer:** aviso verde de "Senha trocada".
  *Se quiser confirmar de verdade, entre com ele numa janela anônima usando a
  senha ANTIGA (não pode entrar) e depois a NOVA (tem que entrar). É opcional
  — a troca em si o aviso já confirma.*

- [ ] **4. Arquivar não pode apagar venda**
  Em **Gerenciar** num usuário que JÁ FEZ VENDA, role até o bloco vermelho.
  **Tem que acontecer:** o botão diz **Arquivar** (não "Excluir"), e o texto
  explica que as vendas continuam no sistema.
  Arquive. Depois abra **Venda > Histórico** e ache uma venda dele.
  **Tem que acontecer:** a venda continua lá, **com o nome dele**.
  **NÃO PODE:** a venda sumir, ou ficar sem vendedor.
  Volte em Usuários, clique em **Mostrar arquivados** e depois em **Trazer de
  volta**.
  **Tem que acontecer:** ele reaparece na lista, marcado como **Inativo**.
  *Este é o teste da regra que você pediu hoje: sair da tela sem sumir do
  histórico.*

---

## Parte 2 — Número e linha do tempo (15 min)

A lógica destes eu já testei no banco e passou. O que falta é ver **na tela**.

- [ ] **5. Venda nova sai OV0001**
  Faça uma venda simples no **PDV** e anote o número do aviso. Faça outra.
  **Tem que acontecer:** `OV0001` e `OV0002` — quatro dígitos, sem mês no meio,
  e o segundo é o primeiro mais um.

- [ ] **6. OS nova sai OS0001**
  Abra **Assistência > Nova OS**, preencha o mínimo e salve. Anote o número.
  Abra outra.
  **Tem que acontecer:** `OS0001` e `OS0002`.

- [ ] **7. Documento antigo NÃO pode ter mudado**
  Em **Venda > Histórico** e em **Assistência > Ordens de Serviço**, olhe os
  registros antigos.
  **Tem que acontecer:** continuam `VD-202608-000X` e `OS-202608-000X`.
  **Se tiverem virado OV/OS curto, me avise na hora** — o número do comprovante
  que o cliente levou pararia de bater com o do sistema.

- [ ] **8. Linha do tempo da OS, com o SEU nome**
  Abra a ficha de uma OS que você acabou de criar e role até **Linha do tempo**.
  **Tem que acontecer:** já aparece **"OS aberta"** com data, **hora e minuto**,
  e **o seu nome**.
  Agora mude a etapa dela (por exemplo, para "Aguardando aprovação") e olhe de
  novo.
  **Tem que acontecer:** aparece uma segunda linha, de qual etapa para qual,
  com hora e **o seu nome**.
  *Esta é a única parte que meu teste no banco não conseguiu provar: lá não
  existe usuário logado, então o nome saía vazio. Só o seu clique confirma.*

- [ ] **9. Aprovação com hora e nome**
  Ponha um valor no orçamento dessa OS e leve ela até a etapa **Aprovado**.
  Volte na Linha do tempo.
  **Tem que acontecer:** existe a linha da passagem para Aprovado, com hora,
  minuto e o seu nome.
  *É o registro que responde "quando o cliente autorizou este serviço", se ele
  contestar o valor na retirada.*

---

## Parte 3 — Impressão e papel (10 min)

Nada disso pode ser verificado sem olhar o papel (ou a prévia de impressão).

- [ ] **10. Comprovante de venda em folha**
  Abra uma venda no **Histórico**, clique em **Imprimir** e escolha o formato
  de folha.
  **Tem que acontecer:** o comprovante sai completo — cabeçalho com dados da
  loja, itens, total, forma de pagamento. **Não existe** uma coluna "Desconto"
  mostrando R$ 0,00 em todas as linhas.
  *Confira também se a logo da loja aparece, se você já cadastrou uma.*

- [ ] **11. Comprovante térmico**
  Mesmo caminho, escolha o formato **térmica 80mm**.
  **Tem que acontecer:** cabe na largura, não corta texto, e os valores estão
  alinhados.

- [ ] **12. Venda com desconto no papel**
  Faça uma venda **com desconto** e imprima.
  **Tem que acontecer:** o desconto aparece no rodapé, e o total bate com o que
  foi cobrado.

---

## Parte 4 — Interação de verdade (15 min)

- [ ] **13. Arrastar cartão no Kanban**
  Abra **Assistência > Ordens de Serviço** na visão de quadro. Arraste um
  cartão de uma coluna para outra.
  **Tem que acontecer:** o cartão fica na coluna nova e não volta sozinho. Se
  você não tiver permissão para aquela transição, aparece um aviso **antes** de
  o cartão se mover.

- [ ] **14. Criar etapa nova e ver no quadro**
  Em **Configurações > Gerenciar Status**, crie uma etapa chamada
  `Teste 23-08`. Volte ao Kanban.
  **Tem que acontecer:** ela aparece como coluna nova, e aceita receber OS.
  Depois tente **excluir uma etapa fixa** (como "Entregue").
  **Tem que acontecer:** o sistema recusa, com explicação.

- [ ] **15. Filtros que não perdem o que você digitou**
  Em **Venda > Histórico de Vendas**, use o filtro de período e mais um filtro
  (vendedor ou forma de pagamento). Depois clique em **Limpar filtros**.
  **Tem que acontecer:** os filtros somem juntos, a lista volta ao normal, e o
  botão Limpar está sempre visível — não escondido atrás de outro clique.

- [ ] **16. Quando a internet cai**
  Com o PDV aberto, **desligue o wi-fi** (ou tire o cabo) e aperte **F5**.
  Depois religue e recarregue.
  **Tem que acontecer:** aparecem avisos **vermelhos** — "Não consegui carregar
  os produtos", "os clientes", "as formas de pagamento". **Não pode** aparecer
  uma vitrine vazia calada, como se a loja não tivesse produto cadastrado.

- [ ] **17. Passada geral nas telas de configuração**
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

- [ ] **18. Anote o antes**
  Em **Estoque > Produtos**, escolha um produto que **tenha estoque e tenha
  custo**. Anote no papel: o **nome**, quantas **unidades** tem, e o **custo**.
  *Sem esse número anotado, os dois testes seguintes não têm como ser
  conferidos.*

- [ ] **19. Dar entrada**
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

- [ ] **20. Conferir o estoque e o custo**
  Volte em **Estoque > Produtos** e ache o produto.
  **Tem que acontecer:** o estoque é o que você anotou **+ 10**, e o custo é o
  valor Y que a tela avisou — **não** o preço que você digitou.
  *Este é o coração da decisão que você tomou hoje. Se o custo tivesse virado
  os R$ 50 cheios, tudo que já estava na prateleira passaria a "valer" R$ 50 e
  sua margem apareceria errada.*

- [ ] **21. A compra caiu no financeiro, já paga**
  Abra **Financeiro > Contas a Pagar** (ou Títulos).
  **Tem que acontecer:** existe um lançamento **"Compra de mercadoria EM0001"**
  no valor de 10 × o preço que você digitou, com status **pago**, apontando
  para o fornecedor, e a observação dizendo **"Nota fiscal ainda não
  recebida"**.

- [ ] **22. Divergência não trava a entrada**
  Faça outra entrada. Adicione um produto e, no campo **"Veio diferente do
  pedido?"**, escreva `Vieram 2 a menos`.
  **Tem que acontecer:** o sistema **deixa salvar normalmente** — não bloqueia.
  Na lista, a entrada aparece com uma tarja **divergência**.
  **NÃO PODE:** o sistema recusar a entrada.
  *A mercadoria já está fisicamente na loja. Se o sistema segurasse a entrada,
  o estoque na tela mentiria sobre o que tem na prateleira.*

- [ ] **23. Entrada sem produto nenhum é barrada**
  Comece uma entrada nova, escolha o fornecedor e **não adicione nenhum
  produto**.
  **Tem que acontecer:** o botão **Dar entrada** fica desabilitado.

---

## Parte 6 — Os dois painéis (10 min)

Esta parte encolheu de 7 passos para 2. Os números dos painéis viraram teste
automático em 23/08: melhor vendedor, ranking com devolução abatida,
categorias, horário de pico, aparelhos parados com as cores certas, e o
agrupamento de serviço escrito de jeitos diferentes.

O que sobrou é o que a máquina não sabe julgar: **se o número faz sentido com
a sua realidade**. Eu testo com dados de mentira; você olha os de verdade.

- [ ] **24. Os dois painéis abrem e os números fecham**
  Abra **Dashboards > Venda** e **Dashboards > Assistência**.
  **Tem que acontecer:** os dois abrem com dados.
  Agora some no papel o faturamento de todos os vendedores da tabela
  **Ranking de Vendedores** e compare com o card **Vendas da Semana**.
  **Tem que acontecer:** batem.
  *Se não baterem, a diferença é o que foi vendido sem vendedor preenchido —
  me diga de quanto foi, é uma informação útil por si só.*
  Na Assistência, confira se **Tempo Médio de Reparo** e **Aparelhos Parados**
  batem com o que você sabe da bancada.

- [ ] **25. Fazer uma devolução de verdade**
  Anote o faturamento de um vendedor no ranking. Vá em **Venda > Troca e
  Devolução** e faça uma **devolução** de uma venda **daquele vendedor**. Volte
  ao painel e aperte `F5`.
  **Tem que acontecer:** o valor dele caiu **exatamente o valor devolvido**, e
  o dos outros ficou igual.
  *A regra está testada automaticamente, mas com dados de mentira. **Nunca
  houve uma devolução de verdade neste banco** — a sua será a primeira, e é a
  única forma de saber se a tela de Troca e Devolução grava tudo que o painel
  espera encontrar.*

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

# O que só você pode testar

**Tempo: 1h a 1h20.** São 18 testes.

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

## Parte 1 — Com outro usuário (10 min)

Esta é a parte mais valiosa do documento, e a única que **não tem como ser
verificada de nenhum outro jeito**. Quatro problemas graves já apareceram neste
sistema com o mesmo padrão: a tela abre, os dados não vêm, e ninguém recebe
erro. Só se descobre com um usuário de permissão reduzida.

- [ ] **1. Existe um usuário Vendedor?**
  Abra **Cadastros > Usuários** e veja se há alguém com o perfil **Vendedor**.
  Se não houver e você conseguir criar um (ou souber a senha de algum), use
  ele. **Se não for possível, pule a Parte 1 inteira e me avise** — aí eu
  registro que essa parte segue sem cobertura, em vez de ficar parecendo
  testada.

- [ ] **2. Estoque com o Vendedor — o teste mais importante de todos**
  Saia da sua conta, entre com o Vendedor, e abra **Estoque > Produtos**.
  **Tem que acontecer:** a tabela carrega normalmente, **sem** as colunas
  **Custo** e **Margem** — só Produto, Categoria, Preço, Estoque e Local.
  **NÃO PODE:** tela em branco, tela travada, ou erro.
  *Este era o pior bug do sistema: a tela ficava totalmente branca para
  Vendedor e Técnico, e eles não conseguiam nem consultar preço para o
  cliente.*

- [ ] **3. Ainda como Vendedor: Movimentações e Estoque Crítico**
  Abra **Estoque > Movimentações** e **Estoque > Estoque Crítico**.
  **Tem que acontecer:** as duas carregam. Em Movimentações some a coluna
  Valor. Em Estoque Crítico, o último quadrinho diz **"Valor em venda"** em
  vez de "Custo para repor tudo".

- [ ] **4. Ainda como Vendedor: as telas de dinheiro**
  Abra **Financeiro > Caixa** e **Relatórios > Relatório Financeiro**.
  **Tem que acontecer:** ou a tela abre **com dados**, ou o item nem aparece no
  menu. **O que não pode é abrir vazia** — tela vazia por falta de permissão
  engana, porque parece "não tem lançamento nenhum".
  *Anote qual das duas coisas aconteceu em cada tela.*

- [ ] **5. Ainda como Vendedor: trocar perfil de alguém**
  Abra **Cadastros > Usuários** (se aparecer no menu) e clique num usuário.
  **Tem que acontecer:** o seletor de **Perfil** está **desabilitado**, com uma
  linha embaixo explicando que trocar perfil exige outra permissão.
  **NÃO PODE:** o seletor estar habilitado e dar erro depois do clique.

  → **Volte para a sua conta de administrador antes de continuar.**

---

## Parte 2 — Número e linha do tempo (15 min)

A lógica destes eu já testei no banco e passou. O que falta é ver **na tela**.

- [ ] **6. Venda nova sai OV0001**
  Faça uma venda simples no **PDV** e anote o número do aviso. Faça outra.
  **Tem que acontecer:** `OV0001` e `OV0002` — quatro dígitos, sem mês no meio,
  e o segundo é o primeiro mais um.

- [ ] **7. OS nova sai OS0001**
  Abra **Assistência > Nova OS**, preencha o mínimo e salve. Anote o número.
  Abra outra.
  **Tem que acontecer:** `OS0001` e `OS0002`.

- [ ] **8. Documento antigo NÃO pode ter mudado**
  Em **Venda > Histórico** e em **Assistência > Ordens de Serviço**, olhe os
  registros antigos.
  **Tem que acontecer:** continuam `VD-202608-000X` e `OS-202608-000X`.
  **Se tiverem virado OV/OS curto, me avise na hora** — o número do comprovante
  que o cliente levou pararia de bater com o do sistema.

- [ ] **9. Linha do tempo da OS, com o SEU nome**
  Abra a ficha de uma OS que você acabou de criar e role até **Linha do tempo**.
  **Tem que acontecer:** já aparece **"OS aberta"** com data, **hora e minuto**,
  e **o seu nome**.
  Agora mude a etapa dela (por exemplo, para "Aguardando aprovação") e olhe de
  novo.
  **Tem que acontecer:** aparece uma segunda linha, de qual etapa para qual,
  com hora e **o seu nome**.
  *Esta é a única parte que meu teste no banco não conseguiu provar: lá não
  existe usuário logado, então o nome saía vazio. Só o seu clique confirma.*

- [ ] **10. Aprovação com hora e nome**
  Ponha um valor no orçamento dessa OS e leve ela até a etapa **Aprovado**.
  Volte na Linha do tempo.
  **Tem que acontecer:** existe a linha da passagem para Aprovado, com hora,
  minuto e o seu nome.
  *É o registro que responde "quando o cliente autorizou este serviço", se ele
  contestar o valor na retirada.*

---

## Parte 3 — Impressão e papel (10 min)

Nada disso pode ser verificado sem olhar o papel (ou a prévia de impressão).

- [ ] **11. Comprovante de venda em folha**
  Abra uma venda no **Histórico**, clique em **Imprimir** e escolha o formato
  de folha.
  **Tem que acontecer:** o comprovante sai completo — cabeçalho com dados da
  loja, itens, total, forma de pagamento. **Não existe** uma coluna "Desconto"
  mostrando R$ 0,00 em todas as linhas.
  *Confira também se a logo da loja aparece, se você já cadastrou uma.*

- [ ] **12. Comprovante térmico**
  Mesmo caminho, escolha o formato **térmica 80mm**.
  **Tem que acontecer:** cabe na largura, não corta texto, e os valores estão
  alinhados.

- [ ] **13. Venda com desconto no papel**
  Faça uma venda **com desconto** e imprima.
  **Tem que acontecer:** o desconto aparece no rodapé, e o total bate com o que
  foi cobrado.

---

## Parte 4 — Interação de verdade (15 min)

- [ ] **14. Arrastar cartão no Kanban**
  Abra **Assistência > Ordens de Serviço** na visão de quadro. Arraste um
  cartão de uma coluna para outra.
  **Tem que acontecer:** o cartão fica na coluna nova e não volta sozinho. Se
  você não tiver permissão para aquela transição, aparece um aviso **antes** de
  o cartão se mover.

- [ ] **15. Criar etapa nova e ver no quadro**
  Em **Configurações > Gerenciar Status**, crie uma etapa chamada
  `Teste 23-08`. Volte ao Kanban.
  **Tem que acontecer:** ela aparece como coluna nova, e aceita receber OS.
  Depois tente **excluir uma etapa fixa** (como "Entregue").
  **Tem que acontecer:** o sistema recusa, com explicação.

- [ ] **16. Filtros que não perdem o que você digitou**
  Em **Venda > Histórico de Vendas**, use o filtro de período e mais um filtro
  (vendedor ou forma de pagamento). Depois clique em **Limpar filtros**.
  **Tem que acontecer:** os filtros somem juntos, a lista volta ao normal, e o
  botão Limpar está sempre visível — não escondido atrás de outro clique.

- [ ] **17. Quando a internet cai**
  Com o PDV aberto, **desligue o wi-fi** (ou tire o cabo) e aperte **F5**.
  Depois religue e recarregue.
  **Tem que acontecer:** aparecem avisos **vermelhos** — "Não consegui carregar
  os produtos", "os clientes", "as formas de pagamento". **Não pode** aparecer
  uma vitrine vazia calada, como se a loja não tivesse produto cadastrado.

- [ ] **18. Passada geral nas telas de configuração**
  Abra, uma por uma, e veja se carregam com dados:
  **Configurações > Logs/Auditoria** (confira se tem a coluna **Quem**),
  **Configurações > Perfis de Acesso**, **Configurações > Preferências**,
  **Configurações > Minha Empresa**.
  *Essas telas usavam um atalho de programação que foi removido. A remoção foi
  verificada, mas é o tipo de mudança que só a tela confirma.*

---

## Uma coisa que você vai notar, e não é bug

Os avisos de sucesso do sistema **não são verdes** — saem em cinza neutro. Isso
foi conferido: hoje o sistema só tem duas cores de aviso, cinza e vermelho de
erro. A cor verde foi criada em 22/08 mas ainda não foi aplicada nos avisos
existentes.

Não anote isso como falha. Se você quiser que os avisos de sucesso fiquem
verdes, é só me dizer que eu aplico.

---

## Se algo falhar

Anote quatro coisas, e siga em frente:

1. **O número e o nome do teste** (ex.: "Teste 2 — Estoque com o Vendedor").
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

# Sisteminha (RPG System.IO) — regras da área

Complementa o `CLAUDE.md` raiz da empresa. As regras gerais de lá continuam
valendo aqui — em especial a de **explicar tudo em linguagem de leigo**,
porque o Felipe não é programador.

## Status do sistema: NÃO está em uso

**O sisteminha está inoperante de propósito.** Ninguém da loja usa ele hoje.
A loja roda num sistema antigo e defasado, e o sisteminha está sendo
construído com calma para substituir aquele — só entra em operação quando
estiver 100% pronto.

O que isso significa na prática, e por que importa:

- **Pode derrubar.** Não existe "cuidado, tem venda acontecendo agora".
  Migration que quebra a tela, deploy no meio do dia, banco fora do ar por
  alguns minutos: nada disso tem custo real neste momento.
- **Não precisa coreografia de ordem** (publicar o front antes de aplicar
  uma migration que o front antigo não aguenta, por exemplo). Faça na ordem
  que for mais simples e mais correta, não na ordem que evita downtime.
- **Prefira fazer certo a fazer compatível.** Não vale a pena inventar
  camada de compatibilidade, migration em duas fases ou coluna duplicada só
  para não quebrar o que está no ar — não tem nada no ar.
- **Isso muda quando a loja migrar.** Quando o sisteminha virar o sistema
  de verdade, esta seção precisa ser reescrita e todo o cuidado volta.

O banco de produção, porém, **tem dados reais** (cadastros, testes, dados
vindos da operação). Migration destrutiva — apagar coluna, apagar tabela,
apagar linha — continua exigindo confirmação do Felipe.

## Como o trabalho anda

- **Nunca commitar direto na `main`.** Criar branch antes, sempre.
- **Migrations vão pelo CLI**: `npx supabase db push`. O login foi feito em
  08/08 e o projeto está vinculado, então acabou a era de colar arquivo no
  SQL Editor à mão. O histórico das 26 primeiras foi acertado com
  `migration repair` na mesma data — hoje local e banco estão iguais.
  - No Windows, use `npx.cmd` no PowerShell: a execução de scripts está
    desabilitada na máquina do Felipe e o `npx` puro é barrado.
  - O CLI só faz login em terminal de verdade. Rodar `supabase login` por
    ferramenta falha com "non-TTY".
- **Para conferir tipos, use `npm run typecheck` — NÃO `npx tsc --noEmit`.**
  Descoberto em 21/08, e é armadilha séria: o `tsconfig.json` da raiz tem
  `"files": []` e delega tudo por `references`. `tsc --noEmit` ignora
  referências, então compila **zero arquivos** e termina em silêncio — parece
  aprovação, é indiferença. Provado na marra: injetei
  `const x: number = "texto"` num arquivo, `tsc --noEmit` não disse nada e
  `tsc --build` acusou na hora.

  Quem vinha segurando o erro de tipo era o `vite build` (esbuild), que
  reclama de coisa grave mas não faz checagem de tipo completa. Os comandos
  certos:

  ```bash
  npm run typecheck   # tsc --build --force — a verificação de verdade
  npm run check       # typecheck + testes + build, tudo de uma vez
  ```

- **Código em `supabase/functions/` NÃO sobe com `db push`.** Desde 22/08 o
  projeto tem uma peça que roda no servidor do Supabase (a criação de usuário).
  Ela é publicada por um comando próprio, e **editar o arquivo não muda nada
  no ar** até rodar:

  ```bash
  npx.cmd supabase functions deploy admin-usuarios --use-api
  ```

  O `--use-api` empacota no servidor e dispensa o Docker — importante, porque
  o Docker da máquina do Felipe fica desligado. Sem a flag, o comando exige
  Docker rodando.

  Cuidado com o modo de falha: o arquivo commitado e o que está no ar podem
  divergir em silêncio, e nada avisa. Mexeu na função, publique na mesma hora.

- **`src/integrations/supabase/types.ts` é gerado de verdade** desde 08/08:
  `npx supabase gen types typescript --project-id ylhxlvqqkifayglqbzre >
  src/integrations/supabase/types.ts`. Não escreva mais nada à mão ali.
- **Conferir no banco, não no registro.** Em 08/08 descobriu-se que a
  migration `20260808130000` (view `vw_movimentos_estoque`) estava anotada
  como aplicada no plano e **não estava no banco** — duas telas liam uma
  view inexistente. Quem achou foi o gerador de tipos, que trouxe 3 views em
  vez de 4. Antes de confiar que algo foi aplicado, pergunte ao banco:
  `npx supabase migration list --linked`, ou uma chamada à API REST na
  view/tabela em questão.

## Regra de custo protegido (Opção B)

Decisão do Felipe em 07/08: **permissão que existe no catálogo tem que valer
no banco também, não só na tela.**

Consequência concreta, que vale para todo código novo:

- **Leitura** de `produtos`, `servicos`, `service_order_items` e
  `movimentos_estoque` passa **sempre** pelas views `vw_produtos`,
  `vw_servicos`, `vw_os_itens` e `vw_movimentos_estoque`. Vale mesmo para
  consulta que não pede custo — a regra é uma só, sem exceção, justamente
  para ninguém precisar lembrar dela.
- **Escrita** (`insert`, `update`, soft-delete) continua indo direto na
  tabela, com as policies de RLS que já existem.
- Em consulta aninhada, usar apelido: `produtos:vw_produtos(...)`, para o
  JSON manter a chave `produtos` e o código da tela não mudar.
- As colunas de custo **não têm SELECT** para `authenticated`. `SELECT *`
  nessas 4 tabelas dá erro de permissão — isso é o comportamento desejado,
  não um bug.
- Cuidado: um `GRANT ALL ON ALL TABLES IN SCHEMA public` desfaz essa
  proteção **em silêncio**. Se alguma ferramenta gerar uma migration assim,
  reconferir os privilégios. Já aconteceu de verdade uma vez (o Lovable
  restaurou os GRANTs padrão dele num rebuild, e a trava ficou caída por
  mais de um dia sem ninguém notar).
- **Exceção conhecida (não é bug): o custo do produto de troca.** Quando um
  aparelho usado entra como parte do pagamento, o valor que a loja deu por ele
  é gravado em `entradas_produto.valor_entrada` e no pagamento `vale_troca` da
  venda — e essas duas tabelas são legíveis por qualquer funcionário logado.
  Ou seja, o custo de um produto que veio por troca **é conhecível** mesmo por
  quem não tem `inventory.cost.view`. Isso é aceito: o valor da troca é
  negociado no balcão, na frente de todo mundo, não é segredo como o custo de
  compra do fornecedor. A auditoria de 15/09 apontou e o Felipe deixou como
  está — registrado aqui para ninguém "corrigir" como se fosse falha.
- **Coluna nova numa dessas 4 tabelas exige uma linha a mais na migration:**

  ```sql
  SELECT public.aplicar_trava_de_custo();
  ```

  A trava funciona revogando o SELECT da tabela e reconcedendo coluna a
  coluna — ou seja, ela congela a lista de colunas no instante em que roda.
  Coluna criada depois nasce **sem** permissão de leitura na tabela crua.
  Isso não quebra nada enquanto todo mundo lê pela view (e a regra acima
  manda ler pela view), mas o dia em que alguém emendar um `.select()`
  direto na tabela, o erro vai ser "permission denied" e ninguém vai
  associar a causa — todo mundo procura RLS primeiro, não GRANT de coluna.
  Aconteceu com 7 colunas de `produtos` entre 09 e 18/08. A função
  (migration `20260818130000`) descobre as colunas do catálogo em vez de
  usar lista digitada, então basta chamá-la: ela se reajusta sozinha.

## Regra da chave mestra (22/08)

O projeto tem duas chaves do Supabase. A **pública** viaja para o navegador de
todo mundo — é assim que tem que ser, e o RLS é quem protege os dados. A
**chave mestra** (`service_role`) ignora RLS, ignora perfil, ignora tudo.

Regra: **a chave mestra nunca entra em `src/`.** Nem em variável de ambiente do
Vite (todo `VITE_*` acaba no navegador), nem "só para um caso". Quem precisa
dela vira função em `supabase/functions/`, e lá:

1. Confere o crachá de quem pediu **antes** de usar a chave, chamando
   `has_permission` com o cliente montado a partir do token da pessoa — nunca
   com a chave mestra, senão a checagem responde sim para qualquer um.
2. Delega a regra ao banco onde já existir uma. `admin-usuarios` cria a conta
   com a chave mestra (só isso exige), mas atribui o perfil chamando
   `trocar_papel_do_usuario` **com o crachá de quem pediu** — assim a exigência
   de `roles.manage` e a proteção do último administrador continuam valendo. Um
   segundo lugar decidindo permissão é como as duas versões divergem sem
   ninguém notar.

## Regra das portas fechadas (14/09)

Véspera de o sistema ir para a internet, a auditoria achou que o padrão de
fábrica do Supabase deixava **tudo aberto por padrão**: quem não fez login
(`anon`) tinha privilégio em toda tabela, e 54 funções com chave de dono
aceitavam chamada de qualquer logado — duas delas abriam caixa e furavam a
numeração de qualquer loja. A migration `20260914100000` fechou e inverteu o
padrão. As regras que ficaram:

- **O `anon` não tem nada em `public`.** Nada no sistema lê o banco antes do
  login (a tela de login não consulta nada), então não há motivo. Coluna,
  tabela ou função que precise ser lida sem login é decisão do Felipe, com
  GRANT explícito e motivo escrito na migration.
- **Função nova nasce sem EXECUTE para quem está logado.** Função que a tela
  chama via `.rpc()` ganha, na própria migration que a cria:

  ```sql
  GRANT EXECUTE ON FUNCTION public.nome_da_funcao(args) TO authenticated;
  ```

  Gatilho não precisa de nada (o banco não confere EXECUTE de quem disparou).
  Ajudante usado em policy, CHECK ou índice (`has_permission`,
  `get_user_tenant_id`, `catalogo_e_do_tipo`, `somente_digitos`...) precisa,
  porque roda como o próprio usuário. Esquecer o GRANT falha alto e na hora
  ("permission denied for function") — é o comportamento desejado: pior era o
  contrário, a função aberta sem ninguém notar.

  **CUIDADO (achado em 15/09): o `ALTER DEFAULT PRIVILEGES` NÃO fecha função
  nova.** A migration de 14/09 confiava nele para "toda função nova nasce
  fechada", mas ele só vale para objetos criados na sessão do papel exato que
  ele nomeia — e o CLI de migration cria as funções por outra sessão. Prova:
  `travas_da_os`, criado pela migration de 15/09 logo depois, nasceu aberto
  para `PUBLIC` mesmo com o `ALTER DEFAULT PRIVILEGES` no lugar. **Fecha na
  marra, na própria migration:** ao criar função de gatilho nova, termine com
  `REVOKE EXECUTE ON FUNCTION public.nome() FROM PUBLIC, anon, authenticated;`
  (ou copie o laço que a migration `20260915110000` roda no fim, que fecha
  todas as funções de gatilho de uma vez). O `REVOKE ... FROM PUBLIC` é o que
  fecha de verdade — `PUBLIC` é "todo mundo", e revogar só do `anon` deixa a
  porta escancarada.
- **Policy sempre com `TO authenticated`.** Sem o `TO`, vale para `public`,
  que inclui o `anon`. A migration de 14/09 tem um bloco que derruba a
  transação se sobrar policy aberta; migration nova com policy nova passa
  pela mesma conferência se copiar o bloco.
- **`aplicar_trava_de_custo()` concede só a `authenticated`** desde 14/09. A
  versão antiga reconcedia ao `anon` a cada chamada.
- **Mudou a `aplicar_trava_de_custo`, criou função com `SECURITY DEFINER`,
  ou mexeu em GRANT? Rode o parecer de segurança do Supabase** (a ferramenta
  `get_advisors` do MCP, tipo `security`, ou o painel em Database > Advisors)
  antes de commitar. Foi ele que apontou o que as revisões anteriores não
  viram — as revisões olhavam o código, ele olha o banco.

As 7 views `vw_*` continuam `SECURITY DEFINER` **de propósito** (Opção B) e o
parecer vai continuar marcando isso em vermelho: cada uma filtra a loja por
`get_user_tenant_id` e esconde o custo por `has_permission`. Conferido em
14/09 — não é achado, é o desenho. (A `vw_auditoria` e a `vw_caixa_resumo_formas`
entraram nessa família em 15/09: a tela de Logs e o resumo do caixa passaram a
ler por elas para esconder custo/dinheiro de quem não pode ver.)

A leva de 15/09 (migrations `20260915100000` e `20260915110000`) fechou o que
sobrou depois que o `anon` foi trancado: venda gravada virou história (não muda
de valor nem some do faturamento pela API), funcionário desativado não se
reativa nem lê nada (`get_user_tenant_id` só responde para conta ativa e com
papel), ninguém entra sem ser criado por um administrador (`handle_new_user`
exige o carimbo `criado_por`, que só a chave mestra escreve), e o rastro
(auditoria, movimento, pagamento) não é mais forjável nem apagável. **Uma
coisa continua na mão do Felipe, no painel:** desligar "Allow new users to
sign up" em Authentication > Sign In / Providers > Email — é a trava de fora
que combina com a de dentro.

## Regra de cliente único (08/08)

Decisão do Felipe: **não pode existir dois cadastros do mesmo cliente.** Se o
cliente já tem cadastro, a equipe usa o que existe e continua a venda.

O que isso significa para código novo:

- A comparação é **só pelos dígitos**, nunca pelo texto digitado. "123.456.789-00"
  e "12345678900" são o mesmo CPF. A regra mora na função
  `public.somente_digitos` — front e banco usam a mesma, de propósito.
- **Documento e telefone recusam** (índice `clientes_documento_unico` e gatilho
  `trg_cliente_telefone_repetido`, migration `20260808150000`).
- **Nome igual TRAVA o cadastro cru** — revisto pelo Felipe em 23/08, depois de
  testar: *"dá para criar quantos quiser com o mesmo nome"*. Até ali nome só
  avisava.

  A trava vale para o cadastro de nome e mais nada. **Informar telefone ou CPF
  libera**, e isso é o ponto da regra, não uma brecha: dois "João Silva" de
  verdade existem, e uma loja que não consegue cadastrar o segundo acaba com
  "Joao Silva 2" no sistema — pior que duas fichas, porque ninguém acha depois
  nem por nome nem por telefone.

  A regra mora em `lib/clienteDuplicado.ts`, com 8 testes. Editar ficha
  existente nunca é travado: sem isso não daria para corrigir o nome de quem já
  está cadastrado.
- Toda porta que cria cliente tem que **procurar antes de gravar**, com
  `buscar_clientes_semelhantes`, e oferecer o cadastro encontrado. Recusar sem
  oferecer saída é tela quebrada para quem está atendendo.
- **O formulário de cliente é um só** (`components/clientes/ClienteFormDialog`).
  O PDV abre exatamente o mesmo — não existe "versão reduzida do balcão".
  Decisão do Felipe em 08/08: *"não adianta ter uma informação de um lado e
  não ter do outro"*. Duas telas parecidas divergem com o tempo, e o cadastro
  feito às pressas nunca é completado depois. Só o nome é obrigatório, então
  quem está com fila continua salvando em dois segundos.
- Cuidado com **gravação em lote**: lote é tudo-ou-nada, então um repetido
  derruba a planilha inteira. `ClientesImportar.tsx` refaz linha a linha quando
  o lote falha — qualquer importação nova precisa do mesmo cuidado.
- `clientes.liberado_venda` desligado = **o banco recusa a venda** (gatilho
  `trg_venda_cliente_bloqueado`, migration `20260808160000`), inclusive a venda
  nova gerada por uma troca. Não tem relação com fiado: a loja não trabalha com
  crediário, e `limite_credito` segue sem uso.

## Regra das listas editáveis (08/08)

Decisão do Felipe: **campo que a loja cadastra em Cadastros > Listas do Sistema
tem que aparecer sozinho na tela que o usa.** Criou uma origem de cliente nova
lá? Ela aparece no cadastro de cliente, sem migration, sem mexer em código.

Consequência para código novo:

- **Nunca criar lista fixa no código** para algo que já tem tipo em
  `src/config/catalogos.ts` (são 16 tipos hoje). Use `useCatalogo(tipo)`.
- Enum do banco só serve para valor que é **regra do sistema** (status de
  venda, papel de usuário), nunca para algo que a loja escolhe. Quando um enum
  desses aparecer no caminho, o certo é ligar no catálogo — foi o que
  `20260808170000` fez com as marcações do cliente.
- Ao **exibir** um item escolhido, incluir o item mesmo se ele estiver
  desativado no catálogo. Senão, editar a ficha apaga em silêncio a escolha
  antiga (o campo vem vazio e o vazio é salvo).
- Catálogo com `permitePadrao` deve **pré-selecionar o item padrão** em
  cadastro novo.
- Cor vinda do banco precisa existir por extenso em `src/lib/cores.ts`: o
  Tailwind só gera CSS do que encontra no código, então classe montada em
  pedaços ou lida só do banco aparece sem cor nenhuma.

### Venda e Assistência têm cadastros SEPARADOS (09/08)

Regra do Felipe, depois de eu errar exatamente nisto: **"os cadastros da ordem
de serviço são diferentes dos cadastros de venda. Lembre-se sempre disso."**

Eu tinha ligado a Nova OS nos catálogos do estoque (`marca`, `modelo`, `cor`,
`memoria`, `grupo_produto`). Está errado, e o motivo é operacional:

- Na bancada entra aparelho de marca que a loja **nunca vendeu** e nunca vai
  vender. Misturado, o cadastro de marcas do estoque enche de fabricante fora
  de linha de venda, e quem cadastra produto garimpa no meio disso.
- "Equipamento" na OS (Celular, Video game, Notebook) **não é** "Grupo de
  Produto" no estoque (Console, Jogo, Peça): uma pergunta é "o que entrou na
  bancada", a outra é "em que prateleira isso fica".

Na prática: a assistência usa `os_equipamento`, `os_marca`, `os_modelo`,
`os_cor`, `os_memoria` (migration `20260809110000`), além de
`checklist_defeito`, `acessorio_entrada` e `condicao_entrada`. Produto e venda
seguem com os seus.

**Ao criar tela nova, pergunte de qual lado ela está** antes de escolher o
catálogo. Se a mesma palavra ("marca", "cor") serve às duas áreas, quase certo
que são dois cadastros, não um.

## Documentos de referência

- `PLANO-DE-ACAO.md` — **o único documento de planejamento, e o primeiro a
  consultar.** O que falta fazer, o que já foi feito e por quê, área por
  área, com prioridade.

Eram cinco documentos até 18/08 (plano de construção, plano de
refinamento, revisão técnica, mapa do financeiro e escopo da revisão de
09/08). Decisão do Felipe naquele dia: *"apaga os antigos e deixa somente
o mais atualizado"*. Os quatro antigos foram apagados depois de conferir
que tudo que ainda era vivo já estava no plano de ação — e continuam
inteiros no histórico do Git, com o comando de leitura registrado no topo
do próprio plano.

**Não crie documento de planejamento novo.** Achado novo, decisão nova ou
mudança de rumo entram no `PLANO-DE-ACAO.md`, na área a que pertencem. Foi
justamente a proliferação de documentos que fez ninguém saber mais qual
valia.

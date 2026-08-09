# Sisteminha (RP System.IO) — regras da área

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
  reconferir os privilégios.

## Regra de cliente único (08/08)

Decisão do Felipe: **não pode existir dois cadastros do mesmo cliente.** Se o
cliente já tem cadastro, a equipe usa o que existe e continua a venda.

O que isso significa para código novo:

- A comparação é **só pelos dígitos**, nunca pelo texto digitado. "123.456.789-00"
  e "12345678900" são o mesmo CPF. A regra mora na função
  `public.somente_digitos` — front e banco usam a mesma, de propósito.
- **Documento e telefone recusam** (índice `clientes_documento_unico` e gatilho
  `trg_cliente_telefone_repetido`, migration `20260808150000`). **Nome igual só
  avisa** — dois "João Silva" podem ser duas pessoas.
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

- `PLANO-DE-REFINAMENTO.md` — o plano de trabalho atual, item por item,
  com o que já foi feito e o que falta. **É o documento a consultar
  primeiro.**
- `REVISAO-TECNICA.md` — a auditoria bruta que originou o plano, com
  citação de arquivo e linha.
- `PLANO-DE-CONSTRUCAO.md` — histórico dos Passos 1 a 6, quando o sistema
  foi construído do zero. Registro, não plano ativo.

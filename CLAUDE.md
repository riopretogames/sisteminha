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
- **Migrations são aplicadas pelo SQL Editor da Supabase**, colando o
  arquivo, porque o CLI ainda não está autenticado (falta o Felipe rodar
  `npx supabase login` uma vez). Quando isso acontecer, passa a ser
  `npx supabase db push` — e aí precisa rodar
  `supabase migration repair --status applied` nas migrations que entraram
  à mão, senão o CLI tenta reaplicar.
- **`src/integrations/supabase/types.ts` é gerado**, mas a seção `Views`
  está escrita à mão hoje (o gerador depende do login acima). Ao regerar,
  conferir que as 4 views continuam lá.

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

## Documentos de referência

- `PLANO-DE-REFINAMENTO.md` — o plano de trabalho atual, item por item,
  com o que já foi feito e o que falta. **É o documento a consultar
  primeiro.**
- `REVISAO-TECNICA.md` — a auditoria bruta que originou o plano, com
  citação de arquivo e linha.
- `PLANO-DE-CONSTRUCAO.md` — histórico dos Passos 1 a 6, quando o sistema
  foi construído do zero. Registro, não plano ativo.

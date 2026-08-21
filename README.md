# Sisteminha — RPG System.IO

O sistema próprio da Rio Preto Games: PDV, Ordens de Serviço, Estoque,
Financeiro e Relatórios num lugar só. Está sendo construído para substituir o
sistema antigo da loja.

> **Ainda não está em uso.** Ninguém da loja opera por ele hoje. A loja roda
> no sistema antigo, e o sisteminha só entra quando estiver pronto. O que isso
> permite e o que continua exigindo cuidado está no [`CLAUDE.md`](CLAUDE.md).

## Por onde começar

| Você quer… | Leia |
|---|---|
| Saber o que falta fazer, o que já foi feito e por quê | [`PLANO-DE-ACAO.md`](PLANO-DE-ACAO.md) — **é o documento principal** |
| Mexer no código sem quebrar as regras da casa | [`CLAUDE.md`](CLAUDE.md) |
| Rodar o sistema na sua máquina | a seção abaixo |

## Rodando na sua máquina

Precisa de Node.js e npm.

```bash
npm install
```

```bash
npm run dev
```

O sistema sobe em `http://localhost:8080`.

Os outros comandos:

| Comando | O que faz |
|---|---|
| `npm run dev` | Sobe o sistema para desenvolvimento |
| `npm run build` | Empacota para publicação |
| `npm run test` | Roda os testes automáticos |
| `npm run lint` | Confere o estilo do código |
| `npm run preview` | Serve o pacote já construído |

### Banco de dados

O banco é Supabase (PostgreSQL). As alterações de estrutura são feitas por
migrations versionadas em `supabase/migrations/`, aplicadas pelo CLI:

```bash
npx.cmd supabase db push
```

No Windows use `npx.cmd`, não `npx` — a execução de scripts está desabilitada
na máquina e o `npx` puro é barrado. O `CLAUDE.md` tem o resto das regras de
migration, incluindo a de conferir no banco em vez de confiar no registro.

## Stack

| Camada | O que usamos |
|---|---|
| Interface | React 18 + TypeScript, componentes shadcn/ui, TailwindCSS |
| Build | Vite 5 |
| Navegação | React Router 6 |
| Dados | React Query (TanStack) |
| Banco e autenticação | Supabase (PostgreSQL com RLS, multi-tenant) |
| Testes | Vitest |

## Como o projeto é desenvolvido

O código é escrito e versionado **localmente**. O projeto começou no Lovable,
mas não é mais desenvolvido lá — a marcação de componentes do editor visual
foi removida em 08/08/2026.

- **Não edite pelo editor do Lovable.** Alteração feita lá volta pelo
  repositório por outro caminho e pode atropelar o que foi feito aqui.
- **Nunca trabalhe direto na `main`.** Crie uma branch antes, sempre.
- **Branch que não sobe é trabalho perdido com aparência de trabalho
  guardado.** Já aconteceu de valer: em 11/08/2026 uma revisão inteira, com 32
  achados e duas correções, ficou dez dias parada numa branch que existia só
  no disco de uma das máquinas — e um dos bugs corrigidos lá continuou
  quebrando o sistema esse tempo todo. Pior: outra sessão reavaliou o mesmo
  item e **rebaixou a gravidade**, porque não tinha o que já se sabia. Suba a
  branch no fim do dia, mesmo sem terminar.

## Histórico

Este README já foi outra coisa: até 21/08/2026 ele guardava o prompt de IA
original que gerou a primeira versão do sistema, escrito para um produto
chamado "OkCells Pro" — um SaaS multi-tenant vendido por assinatura, em
Next.js. Nada disso descreve o que o projeto virou: é um sistema interno, em
Vite, para uma loja só.

O texto original continua no histórico do Git, e os requisitos dele que nunca
foram implementados (termo de aceite assinado pelo cliente, nota fiscal,
PDV offline) foram resgatados para o `PLANO-DE-ACAO.md` antes da troca, em vez
de sumirem junto:

```bash
git show ef36602:README.md
```

# Sisteminha

Projeto: OkCells Pro – ERP para Loja de Celular + Assistência Técnica
CONTEXTO GERAL DO PRODUTO (LEIA COM ATENÇÃO)

Você é um engenheiro de software sênior, arquiteto SaaS e designer de produto, especialista em ERP, PDV, CRM e Assistência Técnica, construindo um SaaS brasileiro, multi-tenant, fiscalmente preparado e mobile-first.

O produto se chama OkCells Pro.

🎯 Objetivo

Criar um sistema web completo para lojas de celular com assistência técnica integrada, substituindo sistemas fragmentados por uma solução única, rápida, simples e extremamente eficiente no uso diário.

👥 Público-alvo

Donos de lojas de celular no Brasil

1 a 5 funcionários

Faturamento médio: R$20k a R$200k/mês

Baixa maturidade técnica → UX precisa ser extremamente intuitiva

💰 Modelo de negócio

SaaS por loja (multi-tenant)

Planos: R$49 a R$149/mês

Trial gratuito de 14 dias

Uma conta = uma loja

PRINCÍPIOS DE PROJETO (OBRIGATÓRIOS)

Mobile-first (PDV e OS devem funcionar 100% no celular)

Velocidade acima de tudo

Poucos cliques

Nada de telas poluídas

Tudo auditável

Pensado para LGPD e fiscal BR

Offline-first no PDV (sync automático)

STACK OBRIGATÓRIA (USE EXATAMENTE ISSO)

Frontend: Next.js 14 + App Router

UI: TailwindCSS + shadcn/ui

Backend: Lovable Cloud (Supabase-like)

Banco: PostgreSQL

Auth: JWT + roles

Storage: Bucket para fotos de OS

Filas/Jobs: Edge Functions (WhatsApp, PDFs, relatórios)

Dark mode automático (system preference)

ARQUITETURA MULTI-TENANT (CRÍTICO)

Toda tabela deve ter tenant_id

Isolamento lógico por tenant

Capacidade futura de multi-loja por usuário

Troca de loja via dropdown no header

MÓDULOS E MODELOS DE DADOS (CRIE AS TABELAS)
1️⃣ TENANTS (LOJAS)

Campos:

id (UUID)

nome_loja

cnpj

inscricao_estadual

endereco_completo

logo

cor_primaria

cor_secundaria

chave_api

webhook_url

config_whatsapp

config_fiscal (JSON – preparar NFC-e/NFS-e)

ativo

data_cadastro

2️⃣ USUÁRIOS

Campos:

id

tenant_id

email

senha_hash

nome_completo

role (admin, atendente, tecnico, vendedor)

permissoes_custom (JSON)

ativo

ultimo_acesso

2fa_enabled

🔐 Permissões rígidas:

Técnico NÃO vê financeiro

Vendedor NÃO altera OS

Atendente NÃO fecha caixa

3️⃣ CLIENTES (CRM COMPLETO)

Campos:

id

tenant_id

nome

cpf_cnpj

email

telefones (array)

data_nascimento

tags (vip, fiel, problema)

origem (instagram, indicação, google)

endereco

observacoes

historico_comunicacoes (JSON)

foto_perfil

data_cadastro

4️⃣ ESTOQUE INTELIGENTE
PRODUTOS

id

tenant_id

nome

codigo_barra

imei_serial (opcional)

marca

modelo

categoria (celular, acessorio, peca)

custo_compra

custo_medio

preco_venda

margem_percent

estoque_atual

estoque_minimo

estoque_maximo

localizacao (vitrine, deposito, bancada, sucata)

garantia_meses

ativo

foto_url

MOVIMENTOS_ESTOQUE (AUDIT TRAIL)

id

tenant_id

product_id

tipo (entrada, saida, ajuste, inventario)

quantidade

custo_unitario

valor_total

motivo

origem (venda:#id, os:#id)

usuario_id

saldo_anterior

saldo_depois

data_hora

5️⃣ PDV / VENDAS
VENDAS

id

tenant_id

cliente_id (opcional)

vendedor_id

data_criacao

status (rascunho, pago, faturado, cancelado)

subtotal

descontos

total

comissao_calculada

PAGAMENTOS_VENDA

venda_id

forma_pagamento (pix, dinheiro, cartão crédito, cartão débito, boleto)

valor

parcelas

gateway_id

⚠️ Suportar:

Múltiplos meios de pagamento

Troco automático

Crediário

Vale-troca

Comissão por lucro líquido

6️⃣ ORDENS DE SERVIÇO (CORE DO SISTEMA)
SERVICE_ORDERS

Campos:

id

tenant_id

numero_os (LOJA-YYYYMM-###)

cliente_id

imei

marca

modelo

cor

memoria

condicao_entrada

acessorios_deixados (JSON)

senha_aparelho (criptografada)

defeito_cliente

diagnostico_tecnico

tipo_os (paga, garantia, cortesia)

prioridade (1-5)

tecnico_responsavel

prazo_previsto

status

total_pecas

total_mao_obra

total_orcamento

valor_final_pago

data_criacao

data_finalizacao

SERVICE_ORDER_HISTORY (TIMELINE)

os_id

usuario_id

status_anterior

status_novo

comentario

sla_tempo

data_hora

SERVICE_ORDER_ITEMS

os_id

product_id

quantidade

custo_unitario

preco_cobrado

horas_mao_obra

garantia_item_meses

TERMO DE ACEITE

os_id

cliente_assinou

data_assinatura

ip

user_agent

hash_documento

TELAS E UX (SIGA ESSE PADRÃO)
🧭 Dashboard Principal

Header com:

Logo da loja

Busca global (OS, IMEI, Cliente)

Notificações

Cards KPI:

Vendas hoje

OS abertas

Caixa atual

Estoque crítico

Gráficos coloridos

Ações rápidas:

Nova Venda

Nova OS

Fechar Caixa

📦 Estoque

Tabela:

Nome

Qtd atual

Mínimo

Custo

Preço

Localização

Filtros avançados

Ações por linha

Inventário rápido

🛠️ OS – Lista

Cards ou tabela

Status com badge colorido

Filtros avançados

Ações em massa

Export CSV

🛠️ OS – Detalhe

Timeline vertical

Seções bem separadas

Upload fotos antes/depois

Botões:

Mudar status

Adicionar peça

Enviar WhatsApp

Gerar PDF

🧾 PDV

Busca rápida (nome, código, IMEI)

Carrinho dinâmico

Cliente rápido

Múltiplos pagamentos

Emissão fiscal (preparar arquitetura)

AUTOMAÇÕES OBRIGATÓRIAS
WhatsApp Business

OS recebida

Orçamento pronto (link aprovar/rejeitar)

OS pronta

Lembrete de garantia

Pesquisa de satisfação

REQUISITOS NÃO FUNCIONAIS

Listas < 500ms com 10k registros

PDV < 2s do scan ao fechamento

Audit trail em tudo

Backup diário criptografado

Dark mode automático

Atalhos de teclado

Onboarding com dados demo

ROADMAP

Implemente seguindo:

Base + Auth

Estoque

OS + PDV

WhatsApp + PDFs

Financeiro

Relatórios

Mobile polish

Deploy produção


armazene 100% dos dados.

---

## Como este projeto é desenvolvido

O projeto **começou** no Lovable, mas não é mais desenvolvido lá: o código é
escrito e versionado localmente, e a marcação de componentes do editor visual
(`lovable-tagger`) foi removida em 08/08/2026.

O que isso significa na prática:

- **Não edite pelo editor do Lovable.** Alteração feita lá volta pro
  repositório por outro caminho e pode atropelar o que foi feito aqui.
- **Publicação:** enquanto o Lovable continuar ligado a este repositório no
  painel deles, subir pra `main` republica `sisteminha.lovable.app`. Desligar
  isso é um passo no painel do Lovable, não tem nada no código que faça.
- **Rodar localmente:** veja abaixo. Hoje é o caminho principal, já que o
  sistema ainda não está em uso pela loja.

## Development

You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```

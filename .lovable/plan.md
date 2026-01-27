

# 🚀 Sisteminha - MVP Desktop-First

## Visão Geral
ERP completo para lojas de celular com assistência técnica. Nome simples, sistema poderoso. Design colorido e vibrante, 100% desktop, com arquitetura preparada para expansões futuras.

---

## 🎨 Design System
- **Paleta vibrante**: Azul (#3B82F6) para vendas, Verde (#10B981) para sucesso, Laranja (#F59E0B) para alertas, Roxo (#8B5CF6) para OS
- **Cards coloridos** com bordas e badges bem visíveis por status
- **Tipografia clara** e espaçamentos generosos
- **Dark mode automático** (preferência do sistema)
- **Atalhos de teclado** nas ações principais

---

## ⚡ Princípios de UX (Velocidade é Rei)
- Máximo **3 cliques** para qualquer ação comum
- **Busca global** com Ctrl+K acessível de qualquer tela
- **Ações em lote** para operações repetitivas
- **Preenchimento inteligente** (dados anteriores, sugestões)
- **Feedback instantâneo** em todas as ações

---

## 📦 Módulos do MVP

### 1. **Estrutura Base + Autenticação**
- Login simples com email/senha
- Roles: admin, atendente, técnico, vendedor
- Perfil do usuário e configurações da loja
- Header: logo, busca global (Ctrl+K), notificações, perfil

### 2. **Dashboard Principal**
- 4 Cards KPI coloridos: Vendas hoje, OS abertas, Caixa, Estoque crítico
- Gráfico de vendas (7 dias)
- Lista rápida: OS pendentes
- **3 botões grandes**: Nova Venda, Nova OS, Novo Cliente

### 3. **Clientes (CRM)**
- Cadastro: nome, CPF/CNPJ, telefone, email
- Tags coloridas (VIP, fiel, problema)
- Origem do cliente
- Histórico unificado (OS + compras)
- Busca instantânea

### 4. **Estoque**
- Produtos: nome, código, IMEI, marca, modelo
- Custo → Preço → Margem (cálculo automático)
- Alertas visuais de estoque baixo
- Localização (vitrine, depósito, bancada)
- Histórico de movimentações

### 5. **Ordens de Serviço**
- Número automático: LOJA-YYYYMM-###
- Cadastro rápido: cliente, IMEI, modelo, defeito
- **Status visual**: badges coloridos com workflow claro
- Timeline vertical com histórico
- Adicionar peças do estoque + mão de obra
- Orçamento calculado automaticamente

### 6. **PDV (Ponto de Venda)**
- Busca por nome/código/IMEI
- Carrinho lateral dinâmico
- Cliente opcional (1 clique para pular)
- Múltiplos pagamentos (PIX, dinheiro, cartão)
- Troco automático
- Fechamento em 2 cliques

### 7. **Relatórios**
- Vendas por período
- OS finalizadas
- Produtos mais vendidos
- Comissões
- Exportação CSV

---

## 🗄️ Banco de Dados (Supabase)

### Tabelas (todas com tenant_id + RLS)

**tenants** - Dados da loja
- id, nome_loja, cnpj, endereco, logo, cores
- config_whatsapp (JSON - preparado)
- config_fiscal (JSON - preparado)

**users** - Usuários do sistema
- id, tenant_id, email, nome, role, permissoes, ativo

**clientes** - CRM
- id, tenant_id, nome, cpf_cnpj, telefones, email, tags, origem

**produtos** - Estoque
- id, tenant_id, nome, codigo_barra, imei, marca, modelo
- custo, preco, margem, estoque_atual, estoque_minimo, localizacao

**movimentos_estoque** - Audit trail
- id, produto_id, tipo, quantidade, motivo, usuario_id, data

**vendas** - PDV
- id, tenant_id, cliente_id, vendedor_id, status, total, data

**pagamentos_venda** - Pagamentos
- id, venda_id, forma, valor, parcelas

**service_orders** - Ordens de Serviço
- id, tenant_id, numero_os, cliente_id, imei, marca, modelo
- defeito, diagnostico, status, prioridade, tecnico_id
- total_pecas, total_mao_obra, total_orcamento

**service_order_history** - Timeline
- id, os_id, usuario_id, status_anterior, status_novo, comentario, data

**service_order_items** - Peças/serviços
- id, os_id, produto_id, quantidade, preco_cobrado

---

## 🔐 Permissões por Role
| Recurso | Admin | Atendente | Técnico | Vendedor |
|---------|-------|-----------|---------|----------|
| Dashboard | ✅ Total | ✅ Parcial | ✅ Parcial | ✅ Parcial |
| Clientes | ✅ | ✅ | 👁️ Ver | ✅ |
| Estoque | ✅ | 👁️ Ver | 👁️ Ver | 👁️ Ver |
| OS | ✅ | ✅ | ✅ | 👁️ Ver |
| PDV | ✅ | ❌ | ❌ | ✅ |
| Relatórios | ✅ | ❌ | ❌ | 📊 Próprios |
| Configurações | ✅ | ❌ | ❌ | ❌ |

---

## 🖥️ Layout Desktop
- **Sidebar fixa** (240px): Logo, navegação, usuário
- **Header**: Busca global (Ctrl+K), notificações, perfil
- **Área principal**: Breadcrumbs + conteúdo
- **Modais**: Ações rápidas sem sair da página

---

## 🔮 Arquitetura Preparada (Sem Implementar)
- **WhatsApp**: Campos config_whatsapp no tenant, webhook_url pronto
- **Fiscal**: Campos config_fiscal, estrutura para NFC-e/NFS-e
- **Mobile**: Componentes responsivos, mas otimizados para desktop
- **Offline**: Estrutura de sync preparada para PWA futuro

---

## 📋 Ordem de Implementação
1. Backend Supabase (tabelas, RLS, auth)
2. Layout base (sidebar, header, busca global)
3. Dashboard com KPIs
4. CRUD Clientes
5. CRUD Estoque + movimentações
6. Sistema de OS completo
7. PDV funcional
8. Relatórios básicos


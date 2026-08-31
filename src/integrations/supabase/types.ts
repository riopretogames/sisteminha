export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      auditoria: {
        Row: {
          acao: string
          created_at: string
          dados_antes: Json | null
          dados_depois: Json | null
          id: string
          registro_id: string | null
          tabela: string
          tenant_id: string | null
          usuario_id: string | null
        }
        Insert: {
          acao: string
          created_at?: string
          dados_antes?: Json | null
          dados_depois?: Json | null
          id?: string
          registro_id?: string | null
          tabela: string
          tenant_id?: string | null
          usuario_id?: string | null
        }
        Update: {
          acao?: string
          created_at?: string
          dados_antes?: Json | null
          dados_depois?: Json | null
          id?: string
          registro_id?: string | null
          tabela?: string
          tenant_id?: string | null
          usuario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "auditoria_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      automacao_eventos: {
        Row: {
          criado_em: string
          dados: Json
          entidade: string
          entidade_id: string
          erro: string | null
          evento: string
          id: number
          processado_em: string | null
          tenant_id: string
        }
        Insert: {
          criado_em?: string
          dados?: Json
          entidade: string
          entidade_id: string
          erro?: string | null
          evento: string
          id?: number
          processado_em?: string | null
          tenant_id: string
        }
        Update: {
          criado_em?: string
          dados?: Json
          entidade?: string
          entidade_id?: string
          erro?: string | null
          evento?: string
          id?: number
          processado_em?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "automacao_eventos_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      bootstrap_administradores: {
        Row: {
          created_at: string
          email: string
          motivo: string | null
        }
        Insert: {
          created_at?: string
          email: string
          motivo?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          motivo?: string | null
        }
        Relationships: []
      }
      caixa_movimentos: {
        Row: {
          created_at: string
          descricao: string
          devolucao_id: string | null
          forma_pagamento_id: string | null
          id: string
          sessao_id: string
          tipo: Database["public"]["Enums"]["tipo_mov_caixa"]
          titulo_id: string | null
          usuario_id: string | null
          valor: number
          venda_id: string | null
        }
        Insert: {
          created_at?: string
          descricao: string
          devolucao_id?: string | null
          forma_pagamento_id?: string | null
          id?: string
          sessao_id: string
          tipo: Database["public"]["Enums"]["tipo_mov_caixa"]
          titulo_id?: string | null
          usuario_id?: string | null
          valor: number
          venda_id?: string | null
        }
        Update: {
          created_at?: string
          descricao?: string
          devolucao_id?: string | null
          forma_pagamento_id?: string | null
          id?: string
          sessao_id?: string
          tipo?: Database["public"]["Enums"]["tipo_mov_caixa"]
          titulo_id?: string | null
          usuario_id?: string | null
          valor?: number
          venda_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "caixa_movimentos_devolucao_id_fkey"
            columns: ["devolucao_id"]
            isOneToOne: false
            referencedRelation: "devolucoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "caixa_movimentos_forma_pagamento_id_fkey"
            columns: ["forma_pagamento_id"]
            isOneToOne: false
            referencedRelation: "formas_pagamento"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "caixa_movimentos_forma_pagamento_id_fkey"
            columns: ["forma_pagamento_id"]
            isOneToOne: false
            referencedRelation: "vw_caixa_resumo_formas"
            referencedColumns: ["forma_pagamento_id"]
          },
          {
            foreignKeyName: "caixa_movimentos_sessao_id_fkey"
            columns: ["sessao_id"]
            isOneToOne: false
            referencedRelation: "caixa_sessoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "caixa_movimentos_sessao_id_fkey"
            columns: ["sessao_id"]
            isOneToOne: false
            referencedRelation: "vw_caixa_resumo_formas"
            referencedColumns: ["sessao_id"]
          },
          {
            foreignKeyName: "caixa_movimentos_titulo_id_fkey"
            columns: ["titulo_id"]
            isOneToOne: false
            referencedRelation: "titulos_financeiros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "caixa_movimentos_venda_id_fkey"
            columns: ["venda_id"]
            isOneToOne: false
            referencedRelation: "vendas"
            referencedColumns: ["id"]
          },
        ]
      }
      caixa_sessoes: {
        Row: {
          aberto_em: string
          aberto_por: string
          created_at: string
          diferenca: number | null
          fechado_em: string | null
          fechado_por: string | null
          id: string
          observacoes: string | null
          status: Database["public"]["Enums"]["status_caixa"]
          tenant_id: string
          valor_abertura: number
          valor_calculado: number | null
          valor_informado: number | null
        }
        Insert: {
          aberto_em?: string
          aberto_por: string
          created_at?: string
          diferenca?: number | null
          fechado_em?: string | null
          fechado_por?: string | null
          id?: string
          observacoes?: string | null
          status?: Database["public"]["Enums"]["status_caixa"]
          tenant_id: string
          valor_abertura?: number
          valor_calculado?: number | null
          valor_informado?: number | null
        }
        Update: {
          aberto_em?: string
          aberto_por?: string
          created_at?: string
          diferenca?: number | null
          fechado_em?: string | null
          fechado_por?: string | null
          id?: string
          observacoes?: string | null
          status?: Database["public"]["Enums"]["status_caixa"]
          tenant_id?: string
          valor_abertura?: number
          valor_calculado?: number | null
          valor_informado?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "caixa_sessoes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      campos_obrigatorios: {
        Row: {
          campo: string
          created_at: string
          definido_por: string | null
          formulario: string
          motivo: string | null
          obrigatorio: boolean
          tenant_id: string
          updated_at: string
        }
        Insert: {
          campo: string
          created_at?: string
          definido_por?: string | null
          formulario: string
          motivo?: string | null
          obrigatorio: boolean
          tenant_id: string
          updated_at?: string
        }
        Update: {
          campo?: string
          created_at?: string
          definido_por?: string | null
          formulario?: string
          motivo?: string | null
          obrigatorio?: boolean
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campos_obrigatorios_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      catalogos: {
        Row: {
          ativo: boolean
          cor: string | null
          created_at: string
          descricao: string
          id: string
          ordem: number
          padrao: boolean
          tenant_id: string
          tipo: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          cor?: string | null
          created_at?: string
          descricao: string
          id?: string
          ordem?: number
          padrao?: boolean
          tenant_id: string
          tipo: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          cor?: string | null
          created_at?: string
          descricao?: string
          id?: string
          ordem?: number
          padrao?: boolean
          tenant_id?: string
          tipo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "catalogos_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      categorias_financeiras: {
        Row: {
          ativo: boolean
          created_at: string
          id: string
          natureza: Database["public"]["Enums"]["natureza_financeira"]
          nome: string
          ordem: number
          tenant_id: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          id?: string
          natureza: Database["public"]["Enums"]["natureza_financeira"]
          nome: string
          ordem?: number
          tenant_id: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          id?: string
          natureza?: Database["public"]["Enums"]["natureza_financeira"]
          nome?: string
          ordem?: number
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "categorias_financeiras_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      cliente_tags: {
        Row: {
          catalogo_id: string
          cliente_id: string
          created_at: string
          tenant_id: string
        }
        Insert: {
          catalogo_id: string
          cliente_id: string
          created_at?: string
          tenant_id: string
        }
        Update: {
          catalogo_id?: string
          cliente_id?: string
          created_at?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cliente_tags_catalogo_id_fkey"
            columns: ["catalogo_id"]
            isOneToOne: false
            referencedRelation: "catalogos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cliente_tags_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cliente_tags_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      clientes: {
        Row: {
          ativo: boolean | null
          bairro: string | null
          cep: string | null
          complemento: string | null
          cpf_cnpj: string | null
          created_at: string | null
          data_nascimento: string | null
          email: string | null
          endereco: string | null
          estado: string | null
          foto_url: string | null
          genero: string | null
          id: string
          inscricao_estadual: string | null
          instagram: string | null
          liberado_venda: boolean
          limite_credito: number | null
          logradouro: string | null
          motivo_compra_id: string | null
          municipio: string | null
          nome: string
          numero: string | null
          observacoes: string | null
          origem: Database["public"]["Enums"]["cliente_origem"] | null
          origem_id: string | null
          rg: string | null
          site: string | null
          tags: Database["public"]["Enums"]["cliente_tag"][] | null
          telefones: string[] | null
          tenant_id: string
          tipo_pessoa: string
          updated_at: string | null
        }
        Insert: {
          ativo?: boolean | null
          bairro?: string | null
          cep?: string | null
          complemento?: string | null
          cpf_cnpj?: string | null
          created_at?: string | null
          data_nascimento?: string | null
          email?: string | null
          endereco?: string | null
          estado?: string | null
          foto_url?: string | null
          genero?: string | null
          id?: string
          inscricao_estadual?: string | null
          instagram?: string | null
          liberado_venda?: boolean
          limite_credito?: number | null
          logradouro?: string | null
          motivo_compra_id?: string | null
          municipio?: string | null
          nome: string
          numero?: string | null
          observacoes?: string | null
          origem?: Database["public"]["Enums"]["cliente_origem"] | null
          origem_id?: string | null
          rg?: string | null
          site?: string | null
          tags?: Database["public"]["Enums"]["cliente_tag"][] | null
          telefones?: string[] | null
          tenant_id: string
          tipo_pessoa?: string
          updated_at?: string | null
        }
        Update: {
          ativo?: boolean | null
          bairro?: string | null
          cep?: string | null
          complemento?: string | null
          cpf_cnpj?: string | null
          created_at?: string | null
          data_nascimento?: string | null
          email?: string | null
          endereco?: string | null
          estado?: string | null
          foto_url?: string | null
          genero?: string | null
          id?: string
          inscricao_estadual?: string | null
          instagram?: string | null
          liberado_venda?: boolean
          limite_credito?: number | null
          logradouro?: string | null
          motivo_compra_id?: string | null
          municipio?: string | null
          nome?: string
          numero?: string | null
          observacoes?: string | null
          origem?: Database["public"]["Enums"]["cliente_origem"] | null
          origem_id?: string | null
          rg?: string | null
          site?: string | null
          tags?: Database["public"]["Enums"]["cliente_tag"][] | null
          telefones?: string[] | null
          tenant_id?: string
          tipo_pessoa?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clientes_motivo_compra_id_fkey"
            columns: ["motivo_compra_id"]
            isOneToOne: false
            referencedRelation: "catalogos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clientes_origem_id_fkey"
            columns: ["origem_id"]
            isOneToOne: false
            referencedRelation: "catalogos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clientes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      devolucao_itens: {
        Row: {
          devolucao_id: string
          id: string
          preco_unitario: number
          produto_id: string
          quantidade: number
        }
        Insert: {
          devolucao_id: string
          id?: string
          preco_unitario: number
          produto_id: string
          quantidade: number
        }
        Update: {
          devolucao_id?: string
          id?: string
          preco_unitario?: number
          produto_id?: string
          quantidade?: number
        }
        Relationships: [
          {
            foreignKeyName: "devolucao_itens_devolucao_id_fkey"
            columns: ["devolucao_id"]
            isOneToOne: false
            referencedRelation: "devolucoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "devolucao_itens_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "devolucao_itens_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "vw_produtos"
            referencedColumns: ["id"]
          },
        ]
      }
      devolucoes: {
        Row: {
          created_at: string
          forma_pagamento_id: string | null
          id: string
          motivo: string | null
          numero_devolucao: string | null
          tenant_id: string
          usuario_id: string | null
          valor_cliente_pagou_a_mais: number
          valor_devolvido_cliente: number
          venda_nova_id: string | null
          venda_original_id: string
        }
        Insert: {
          created_at?: string
          forma_pagamento_id?: string | null
          id?: string
          motivo?: string | null
          numero_devolucao?: string | null
          tenant_id: string
          usuario_id?: string | null
          valor_cliente_pagou_a_mais?: number
          valor_devolvido_cliente?: number
          venda_nova_id?: string | null
          venda_original_id: string
        }
        Update: {
          created_at?: string
          forma_pagamento_id?: string | null
          id?: string
          motivo?: string | null
          numero_devolucao?: string | null
          tenant_id?: string
          usuario_id?: string | null
          valor_cliente_pagou_a_mais?: number
          valor_devolvido_cliente?: number
          venda_nova_id?: string | null
          venda_original_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "devolucoes_forma_pagamento_id_fkey"
            columns: ["forma_pagamento_id"]
            isOneToOne: false
            referencedRelation: "formas_pagamento"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "devolucoes_forma_pagamento_id_fkey"
            columns: ["forma_pagamento_id"]
            isOneToOne: false
            referencedRelation: "vw_caixa_resumo_formas"
            referencedColumns: ["forma_pagamento_id"]
          },
          {
            foreignKeyName: "devolucoes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "devolucoes_venda_nova_id_fkey"
            columns: ["venda_nova_id"]
            isOneToOne: false
            referencedRelation: "vendas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "devolucoes_venda_original_id_fkey"
            columns: ["venda_original_id"]
            isOneToOne: false
            referencedRelation: "vendas"
            referencedColumns: ["id"]
          },
        ]
      }
      documento_sequencias: {
        Row: {
          ano_mes: string
          documento: string
          tenant_id: string
          ultimo: number
        }
        Insert: {
          ano_mes: string
          documento: string
          tenant_id: string
          ultimo?: number
        }
        Update: {
          ano_mes?: string
          documento?: string
          tenant_id?: string
          ultimo?: number
        }
        Relationships: [
          {
            foreignKeyName: "documento_sequencias_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      entradas_mercadoria: {
        Row: {
          created_at: string
          data_entrada: string
          fornecedor_id: string
          id: string
          numero: string
          numero_nota: string | null
          observacao: string | null
          tem_divergencia: boolean
          tenant_id: string
          titulo_id: string | null
          total: number
          usuario_id: string | null
        }
        Insert: {
          created_at?: string
          data_entrada?: string
          fornecedor_id: string
          id?: string
          numero: string
          numero_nota?: string | null
          observacao?: string | null
          tem_divergencia?: boolean
          tenant_id: string
          titulo_id?: string | null
          total?: number
          usuario_id?: string | null
        }
        Update: {
          created_at?: string
          data_entrada?: string
          fornecedor_id?: string
          id?: string
          numero?: string
          numero_nota?: string | null
          observacao?: string | null
          tem_divergencia?: boolean
          tenant_id?: string
          titulo_id?: string | null
          total?: number
          usuario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "entradas_mercadoria_fornecedor_id_fkey"
            columns: ["fornecedor_id"]
            isOneToOne: false
            referencedRelation: "fornecedores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entradas_mercadoria_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entradas_mercadoria_titulo_id_fkey"
            columns: ["titulo_id"]
            isOneToOne: false
            referencedRelation: "titulos_financeiros"
            referencedColumns: ["id"]
          },
        ]
      }
      entradas_mercadoria_itens: {
        Row: {
          created_at: string
          custo_unitario: number
          divergencia: string | null
          entrada_id: string
          id: string
          produto_id: string
          quantidade: number
        }
        Insert: {
          created_at?: string
          custo_unitario: number
          divergencia?: string | null
          entrada_id: string
          id?: string
          produto_id: string
          quantidade: number
        }
        Update: {
          created_at?: string
          custo_unitario?: number
          divergencia?: string | null
          entrada_id?: string
          id?: string
          produto_id?: string
          quantidade?: number
        }
        Relationships: [
          {
            foreignKeyName: "entradas_mercadoria_itens_entrada_id_fkey"
            columns: ["entrada_id"]
            isOneToOne: false
            referencedRelation: "entradas_mercadoria"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entradas_mercadoria_itens_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entradas_mercadoria_itens_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "vw_produtos"
            referencedColumns: ["id"]
          },
        ]
      }
      entradas_produto: {
        Row: {
          created_at: string | null
          id: string
          observacoes: string | null
          pagamento_venda_id: string | null
          produto_id: string
          tenant_id: string
          usuario_id: string
          valor_entrada: number
          venda_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          observacoes?: string | null
          pagamento_venda_id?: string | null
          produto_id: string
          tenant_id: string
          usuario_id: string
          valor_entrada: number
          venda_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          observacoes?: string | null
          pagamento_venda_id?: string | null
          produto_id?: string
          tenant_id?: string
          usuario_id?: string
          valor_entrada?: number
          venda_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "entradas_produto_pagamento_venda_id_fkey"
            columns: ["pagamento_venda_id"]
            isOneToOne: false
            referencedRelation: "pagamentos_venda"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entradas_produto_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entradas_produto_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "vw_produtos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entradas_produto_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entradas_produto_venda_id_fkey"
            columns: ["venda_id"]
            isOneToOne: false
            referencedRelation: "vendas"
            referencedColumns: ["id"]
          },
        ]
      }
      formas_pagamento: {
        Row: {
          ativo: boolean
          contem_taxa: boolean
          created_at: string
          descricao: string
          entra_no_caixa: boolean
          forma_enum: Database["public"]["Enums"]["forma_pagamento"]
          grupo: string | null
          id: string
          juros: Database["public"]["Enums"]["tipo_juros"]
          juros_percent: number
          max_parcelas: number
          ordem: number
          taxa_percent: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          contem_taxa?: boolean
          created_at?: string
          descricao: string
          entra_no_caixa?: boolean
          forma_enum?: Database["public"]["Enums"]["forma_pagamento"]
          grupo?: string | null
          id?: string
          juros?: Database["public"]["Enums"]["tipo_juros"]
          juros_percent?: number
          max_parcelas?: number
          ordem?: number
          taxa_percent?: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          contem_taxa?: boolean
          created_at?: string
          descricao?: string
          entra_no_caixa?: boolean
          forma_enum?: Database["public"]["Enums"]["forma_pagamento"]
          grupo?: string | null
          id?: string
          juros?: Database["public"]["Enums"]["tipo_juros"]
          juros_percent?: number
          max_parcelas?: number
          ordem?: number
          taxa_percent?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "formas_pagamento_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      formas_pagamento_parcelas: {
        Row: {
          forma_pagamento_id: string
          id: string
          parcela: number
          taxa_percent: number
        }
        Insert: {
          forma_pagamento_id: string
          id?: string
          parcela: number
          taxa_percent?: number
        }
        Update: {
          forma_pagamento_id?: string
          id?: string
          parcela?: number
          taxa_percent?: number
        }
        Relationships: [
          {
            foreignKeyName: "formas_pagamento_parcelas_forma_pagamento_id_fkey"
            columns: ["forma_pagamento_id"]
            isOneToOne: false
            referencedRelation: "formas_pagamento"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "formas_pagamento_parcelas_forma_pagamento_id_fkey"
            columns: ["forma_pagamento_id"]
            isOneToOne: false
            referencedRelation: "vw_caixa_resumo_formas"
            referencedColumns: ["forma_pagamento_id"]
          },
        ]
      }
      fornecedores: {
        Row: {
          ativo: boolean
          bairro: string | null
          cep: string | null
          complemento: string | null
          contato_nome: string | null
          cpf_cnpj: string | null
          created_at: string
          email: string | null
          estado: string | null
          id: string
          inscricao_estadual: string | null
          logradouro: string | null
          municipio: string | null
          nome: string
          numero: string | null
          observacoes: string | null
          prazo_entrega_dias: number | null
          razao_social: string | null
          site: string | null
          telefones: string[]
          tenant_id: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          bairro?: string | null
          cep?: string | null
          complemento?: string | null
          contato_nome?: string | null
          cpf_cnpj?: string | null
          created_at?: string
          email?: string | null
          estado?: string | null
          id?: string
          inscricao_estadual?: string | null
          logradouro?: string | null
          municipio?: string | null
          nome: string
          numero?: string | null
          observacoes?: string | null
          prazo_entrega_dias?: number | null
          razao_social?: string | null
          site?: string | null
          telefones?: string[]
          tenant_id: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          bairro?: string | null
          cep?: string | null
          complemento?: string | null
          contato_nome?: string | null
          cpf_cnpj?: string | null
          created_at?: string
          email?: string | null
          estado?: string | null
          id?: string
          inscricao_estadual?: string | null
          logradouro?: string | null
          municipio?: string | null
          nome?: string
          numero?: string | null
          observacoes?: string | null
          prazo_entrega_dias?: number | null
          razao_social?: string | null
          site?: string | null
          telefones?: string[]
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fornecedores_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      itens_venda: {
        Row: {
          created_at: string | null
          defeito_declarado: boolean
          desconto: number | null
          id: string
          preco_unitario: number
          produto_id: string
          quantidade: number
          total: number
          venda_id: string
        }
        Insert: {
          created_at?: string | null
          defeito_declarado?: boolean
          desconto?: number | null
          id?: string
          preco_unitario: number
          produto_id: string
          quantidade?: number
          total: number
          venda_id: string
        }
        Update: {
          created_at?: string | null
          defeito_declarado?: boolean
          desconto?: number | null
          id?: string
          preco_unitario?: number
          produto_id?: string
          quantidade?: number
          total?: number
          venda_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "itens_venda_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "itens_venda_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "vw_produtos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "itens_venda_venda_id_fkey"
            columns: ["venda_id"]
            isOneToOne: false
            referencedRelation: "vendas"
            referencedColumns: ["id"]
          },
        ]
      }
      metas_faturamento: {
        Row: {
          ano: number
          created_at: string
          faixa: Database["public"]["Enums"]["faixa_premiacao"]
          id: string
          mes: number
          tenant_id: string
          updated_at: string
          valor_meta: number
        }
        Insert: {
          ano: number
          created_at?: string
          faixa: Database["public"]["Enums"]["faixa_premiacao"]
          id?: string
          mes: number
          tenant_id: string
          updated_at?: string
          valor_meta: number
        }
        Update: {
          ano?: number
          created_at?: string
          faixa?: Database["public"]["Enums"]["faixa_premiacao"]
          id?: string
          mes?: number
          tenant_id?: string
          updated_at?: string
          valor_meta?: number
        }
        Relationships: [
          {
            foreignKeyName: "metas_faturamento_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      movimentos_estoque: {
        Row: {
          created_at: string | null
          custo_unitario: number | null
          id: string
          motivo: string | null
          origem: string | null
          produto_id: string
          quantidade: number
          saldo_anterior: number | null
          saldo_depois: number | null
          tenant_id: string
          tipo: Database["public"]["Enums"]["movimento_tipo"]
          usuario_id: string | null
          valor_total: number | null
        }
        Insert: {
          created_at?: string | null
          custo_unitario?: number | null
          id?: string
          motivo?: string | null
          origem?: string | null
          produto_id: string
          quantidade: number
          saldo_anterior?: number | null
          saldo_depois?: number | null
          tenant_id: string
          tipo: Database["public"]["Enums"]["movimento_tipo"]
          usuario_id?: string | null
          valor_total?: number | null
        }
        Update: {
          created_at?: string | null
          custo_unitario?: number | null
          id?: string
          motivo?: string | null
          origem?: string | null
          produto_id?: string
          quantidade?: number
          saldo_anterior?: number | null
          saldo_depois?: number | null
          tenant_id?: string
          tipo?: Database["public"]["Enums"]["movimento_tipo"]
          usuario_id?: string | null
          valor_total?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "movimentos_estoque_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimentos_estoque_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "vw_produtos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimentos_estoque_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      os_checklist: {
        Row: {
          catalogo_id: string
          created_at: string
          observacao: string | null
          os_id: string
          tenant_id: string
        }
        Insert: {
          catalogo_id: string
          created_at?: string
          observacao?: string | null
          os_id: string
          tenant_id: string
        }
        Update: {
          catalogo_id?: string
          created_at?: string
          observacao?: string | null
          os_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "os_checklist_catalogo_id_fkey"
            columns: ["catalogo_id"]
            isOneToOne: false
            referencedRelation: "catalogos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "os_checklist_os_id_fkey"
            columns: ["os_id"]
            isOneToOne: false
            referencedRelation: "service_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "os_checklist_os_id_fkey"
            columns: ["os_id"]
            isOneToOne: false
            referencedRelation: "vw_os_aguardando_retirada"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "os_checklist_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      os_pagamentos: {
        Row: {
          created_at: string
          forma: Database["public"]["Enums"]["forma_pagamento"]
          forma_pagamento_id: string
          id: string
          os_id: string
          parcelas: number
          usuario_id: string | null
          valor: number
        }
        Insert: {
          created_at?: string
          forma: Database["public"]["Enums"]["forma_pagamento"]
          forma_pagamento_id: string
          id?: string
          os_id: string
          parcelas?: number
          usuario_id?: string | null
          valor: number
        }
        Update: {
          created_at?: string
          forma?: Database["public"]["Enums"]["forma_pagamento"]
          forma_pagamento_id?: string
          id?: string
          os_id?: string
          parcelas?: number
          usuario_id?: string | null
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "os_pagamentos_forma_pagamento_id_fkey"
            columns: ["forma_pagamento_id"]
            isOneToOne: false
            referencedRelation: "formas_pagamento"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "os_pagamentos_forma_pagamento_id_fkey"
            columns: ["forma_pagamento_id"]
            isOneToOne: false
            referencedRelation: "vw_caixa_resumo_formas"
            referencedColumns: ["forma_pagamento_id"]
          },
          {
            foreignKeyName: "os_pagamentos_os_id_fkey"
            columns: ["os_id"]
            isOneToOne: false
            referencedRelation: "service_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "os_pagamentos_os_id_fkey"
            columns: ["os_id"]
            isOneToOne: false
            referencedRelation: "vw_os_aguardando_retirada"
            referencedColumns: ["id"]
          },
        ]
      }
      os_status_config: {
        Row: {
          ativo: boolean | null
          color: string
          created_at: string | null
          etapa: number | null
          icon: string | null
          id: string
          key: string
          label: string
          numero: string | null
          ordem: number
          sistema: boolean
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          ativo?: boolean | null
          color?: string
          created_at?: string | null
          etapa?: number | null
          icon?: string | null
          id?: string
          key: string
          label: string
          numero?: string | null
          ordem?: number
          sistema?: boolean
          tenant_id: string
          updated_at?: string | null
        }
        Update: {
          ativo?: boolean | null
          color?: string
          created_at?: string | null
          etapa?: number | null
          icon?: string | null
          id?: string
          key?: string
          label?: string
          numero?: string | null
          ordem?: number
          sistema?: boolean
          tenant_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "os_status_config_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      pagamentos_venda: {
        Row: {
          created_at: string | null
          forma: Database["public"]["Enums"]["forma_pagamento"]
          forma_pagamento_id: string | null
          gateway_id: string | null
          id: string
          parcelas: number | null
          valor: number
          venda_id: string
        }
        Insert: {
          created_at?: string | null
          forma: Database["public"]["Enums"]["forma_pagamento"]
          forma_pagamento_id?: string | null
          gateway_id?: string | null
          id?: string
          parcelas?: number | null
          valor: number
          venda_id: string
        }
        Update: {
          created_at?: string | null
          forma?: Database["public"]["Enums"]["forma_pagamento"]
          forma_pagamento_id?: string | null
          gateway_id?: string | null
          id?: string
          parcelas?: number | null
          valor?: number
          venda_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pagamentos_venda_forma_pagamento_id_fkey"
            columns: ["forma_pagamento_id"]
            isOneToOne: false
            referencedRelation: "formas_pagamento"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pagamentos_venda_forma_pagamento_id_fkey"
            columns: ["forma_pagamento_id"]
            isOneToOne: false
            referencedRelation: "vw_caixa_resumo_formas"
            referencedColumns: ["forma_pagamento_id"]
          },
          {
            foreignKeyName: "pagamentos_venda_venda_id_fkey"
            columns: ["venda_id"]
            isOneToOne: false
            referencedRelation: "vendas"
            referencedColumns: ["id"]
          },
        ]
      }
      permissions: {
        Row: {
          descricao: string
          key: string
          modulo: string
        }
        Insert: {
          descricao: string
          key: string
          modulo: string
        }
        Update: {
          descricao?: string
          key?: string
          modulo?: string
        }
        Relationships: []
      }
      produtos: {
        Row: {
          ativo: boolean | null
          categoria: Database["public"]["Enums"]["produto_categoria"] | null
          codigo_barra: string | null
          condicao_id: string | null
          cor_id: string | null
          created_at: string | null
          custo: number | null
          estoque_atual: number | null
          estoque_maximo: number | null
          estoque_minimo: number | null
          foto_url: string | null
          garantia_meses: number | null
          grupo_produto_id: string | null
          id: string
          imei_serial: string | null
          localizacao: Database["public"]["Enums"]["produto_localizacao"] | null
          marca: string | null
          marca_id: string | null
          margem_percent: number | null
          memoria_id: string | null
          modelo: string | null
          modelo_id: string | null
          nome: string
          observacoes: string | null
          preco: number | null
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          ativo?: boolean | null
          categoria?: Database["public"]["Enums"]["produto_categoria"] | null
          codigo_barra?: string | null
          condicao_id?: string | null
          cor_id?: string | null
          created_at?: string | null
          custo?: number | null
          estoque_atual?: number | null
          estoque_maximo?: number | null
          estoque_minimo?: number | null
          foto_url?: string | null
          garantia_meses?: number | null
          grupo_produto_id?: string | null
          id?: string
          imei_serial?: string | null
          localizacao?:
            | Database["public"]["Enums"]["produto_localizacao"]
            | null
          marca?: string | null
          marca_id?: string | null
          margem_percent?: number | null
          memoria_id?: string | null
          modelo?: string | null
          modelo_id?: string | null
          nome: string
          observacoes?: string | null
          preco?: number | null
          tenant_id: string
          updated_at?: string | null
        }
        Update: {
          ativo?: boolean | null
          categoria?: Database["public"]["Enums"]["produto_categoria"] | null
          codigo_barra?: string | null
          condicao_id?: string | null
          cor_id?: string | null
          created_at?: string | null
          custo?: number | null
          estoque_atual?: number | null
          estoque_maximo?: number | null
          estoque_minimo?: number | null
          foto_url?: string | null
          garantia_meses?: number | null
          grupo_produto_id?: string | null
          id?: string
          imei_serial?: string | null
          localizacao?:
            | Database["public"]["Enums"]["produto_localizacao"]
            | null
          marca?: string | null
          marca_id?: string | null
          margem_percent?: number | null
          memoria_id?: string | null
          modelo?: string | null
          modelo_id?: string | null
          nome?: string
          observacoes?: string | null
          preco?: number | null
          tenant_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "produtos_condicao_id_fkey"
            columns: ["condicao_id"]
            isOneToOne: false
            referencedRelation: "catalogos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "produtos_cor_id_fkey"
            columns: ["cor_id"]
            isOneToOne: false
            referencedRelation: "catalogos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "produtos_grupo_produto_id_fkey"
            columns: ["grupo_produto_id"]
            isOneToOne: false
            referencedRelation: "catalogos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "produtos_marca_id_fkey"
            columns: ["marca_id"]
            isOneToOne: false
            referencedRelation: "catalogos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "produtos_memoria_id_fkey"
            columns: ["memoria_id"]
            isOneToOne: false
            referencedRelation: "catalogos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "produtos_modelo_id_fkey"
            columns: ["modelo_id"]
            isOneToOne: false
            referencedRelation: "catalogos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "produtos_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          arquivado_em: string | null
          ativo: boolean | null
          avatar_url: string | null
          created_at: string | null
          email: string | null
          id: string
          nome: string
          telefone: string | null
          tenant_id: string | null
          ultimo_acesso: string | null
          updated_at: string | null
        }
        Insert: {
          arquivado_em?: string | null
          ativo?: boolean | null
          avatar_url?: string | null
          created_at?: string | null
          email?: string | null
          id: string
          nome: string
          telefone?: string | null
          tenant_id?: string | null
          ultimo_acesso?: string | null
          updated_at?: string | null
        }
        Update: {
          arquivado_em?: string | null
          ativo?: boolean | null
          avatar_url?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          nome?: string
          telefone?: string | null
          tenant_id?: string | null
          ultimo_acesso?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      role_permissions: {
        Row: {
          permission_key: string
          role: Database["public"]["Enums"]["app_role"]
        }
        Insert: {
          permission_key: string
          role: Database["public"]["Enums"]["app_role"]
        }
        Update: {
          permission_key?: string
          role?: Database["public"]["Enums"]["app_role"]
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_permission_key_fkey"
            columns: ["permission_key"]
            isOneToOne: false
            referencedRelation: "permissions"
            referencedColumns: ["key"]
          },
        ]
      }
      service_order_history: {
        Row: {
          comentario: string | null
          created_at: string | null
          id: string
          os_id: string
          sla_tempo: number | null
          status_anterior: string | null
          status_novo: string
          usuario_id: string | null
        }
        Insert: {
          comentario?: string | null
          created_at?: string | null
          id?: string
          os_id: string
          sla_tempo?: number | null
          status_anterior?: string | null
          status_novo: string
          usuario_id?: string | null
        }
        Update: {
          comentario?: string | null
          created_at?: string | null
          id?: string
          os_id?: string
          sla_tempo?: number | null
          status_anterior?: string | null
          status_novo?: string
          usuario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "service_order_history_os_id_fkey"
            columns: ["os_id"]
            isOneToOne: false
            referencedRelation: "service_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_order_history_os_id_fkey"
            columns: ["os_id"]
            isOneToOne: false
            referencedRelation: "vw_os_aguardando_retirada"
            referencedColumns: ["id"]
          },
        ]
      }
      service_order_items: {
        Row: {
          created_at: string | null
          custo_unitario: number | null
          descricao: string | null
          garantia_item_meses: number | null
          horas_mao_obra: number | null
          id: string
          os_id: string
          preco_cobrado: number
          produto_id: string | null
          quantidade: number | null
        }
        Insert: {
          created_at?: string | null
          custo_unitario?: number | null
          descricao?: string | null
          garantia_item_meses?: number | null
          horas_mao_obra?: number | null
          id?: string
          os_id: string
          preco_cobrado: number
          produto_id?: string | null
          quantidade?: number | null
        }
        Update: {
          created_at?: string | null
          custo_unitario?: number | null
          descricao?: string | null
          garantia_item_meses?: number | null
          horas_mao_obra?: number | null
          id?: string
          os_id?: string
          preco_cobrado?: number
          produto_id?: string | null
          quantidade?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "service_order_items_os_id_fkey"
            columns: ["os_id"]
            isOneToOne: false
            referencedRelation: "service_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_order_items_os_id_fkey"
            columns: ["os_id"]
            isOneToOne: false
            referencedRelation: "vw_os_aguardando_retirada"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_order_items_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_order_items_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "vw_produtos"
            referencedColumns: ["id"]
          },
        ]
      }
      service_orders: {
        Row: {
          acessorios_deixados: Json | null
          anotacoes_checkin: string | null
          cliente_id: string
          condicao_entrada: string | null
          constatacao_tecnica: string | null
          cor: string | null
          cor_id: string | null
          created_at: string | null
          data_finalizacao: string | null
          defeito_cliente: string
          diagnostico_tecnico: string | null
          equipamento_id: string | null
          execucao_iniciada_em: string | null
          execucao_iniciada_por: string | null
          garantia_dias: number
          garantia_meses: number
          id: string
          laudo_eletronico: boolean
          marca: string | null
          marca_id: string | null
          memoria: string | null
          memoria_id: string | null
          modelo: string | null
          modelo_id: string | null
          numero_os: string
          numero_serie: string | null
          observacoes: string | null
          prazo_previsto: string | null
          prioridade: Database["public"]["Enums"]["os_prioridade"] | null
          reparo_iniciado_em: string | null
          reparo_iniciado_por: string | null
          reparo_inviavel: boolean
          risco_informado_em: string | null
          senha_aparelho: string | null
          senha_padrao: string | null
          status: string | null
          suspeita_tecnica: string | null
          tecnico_id: string | null
          tem_senha: boolean | null
          tenant_id: string
          tipo: Database["public"]["Enums"]["os_tipo"] | null
          total_mao_obra: number | null
          total_orcamento: number | null
          total_pecas: number | null
          updated_at: string | null
          valor_final_pago: number | null
          vendedor_id: string | null
        }
        Insert: {
          acessorios_deixados?: Json | null
          anotacoes_checkin?: string | null
          cliente_id: string
          condicao_entrada?: string | null
          constatacao_tecnica?: string | null
          cor?: string | null
          cor_id?: string | null
          created_at?: string | null
          data_finalizacao?: string | null
          defeito_cliente: string
          diagnostico_tecnico?: string | null
          equipamento_id?: string | null
          execucao_iniciada_em?: string | null
          execucao_iniciada_por?: string | null
          garantia_dias?: number
          garantia_meses?: number
          id?: string
          laudo_eletronico?: boolean
          marca?: string | null
          marca_id?: string | null
          memoria?: string | null
          memoria_id?: string | null
          modelo?: string | null
          modelo_id?: string | null
          numero_os: string
          numero_serie?: string | null
          observacoes?: string | null
          prazo_previsto?: string | null
          prioridade?: Database["public"]["Enums"]["os_prioridade"] | null
          reparo_iniciado_em?: string | null
          reparo_iniciado_por?: string | null
          reparo_inviavel?: boolean
          risco_informado_em?: string | null
          senha_aparelho?: string | null
          senha_padrao?: string | null
          status?: string | null
          suspeita_tecnica?: string | null
          tecnico_id?: string | null
          tem_senha?: boolean | null
          tenant_id: string
          tipo?: Database["public"]["Enums"]["os_tipo"] | null
          total_mao_obra?: number | null
          total_orcamento?: number | null
          total_pecas?: number | null
          updated_at?: string | null
          valor_final_pago?: number | null
          vendedor_id?: string | null
        }
        Update: {
          acessorios_deixados?: Json | null
          anotacoes_checkin?: string | null
          cliente_id?: string
          condicao_entrada?: string | null
          constatacao_tecnica?: string | null
          cor?: string | null
          cor_id?: string | null
          created_at?: string | null
          data_finalizacao?: string | null
          defeito_cliente?: string
          diagnostico_tecnico?: string | null
          equipamento_id?: string | null
          execucao_iniciada_em?: string | null
          execucao_iniciada_por?: string | null
          garantia_dias?: number
          garantia_meses?: number
          id?: string
          laudo_eletronico?: boolean
          marca?: string | null
          marca_id?: string | null
          memoria?: string | null
          memoria_id?: string | null
          modelo?: string | null
          modelo_id?: string | null
          numero_os?: string
          numero_serie?: string | null
          observacoes?: string | null
          prazo_previsto?: string | null
          prioridade?: Database["public"]["Enums"]["os_prioridade"] | null
          reparo_iniciado_em?: string | null
          reparo_iniciado_por?: string | null
          reparo_inviavel?: boolean
          risco_informado_em?: string | null
          senha_aparelho?: string | null
          senha_padrao?: string | null
          status?: string | null
          suspeita_tecnica?: string | null
          tecnico_id?: string | null
          tem_senha?: boolean | null
          tenant_id?: string
          tipo?: Database["public"]["Enums"]["os_tipo"] | null
          total_mao_obra?: number | null
          total_orcamento?: number | null
          total_pecas?: number | null
          updated_at?: string | null
          valor_final_pago?: number | null
          vendedor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "service_orders_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_orders_cor_id_fkey"
            columns: ["cor_id"]
            isOneToOne: false
            referencedRelation: "catalogos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_orders_equipamento_id_fkey"
            columns: ["equipamento_id"]
            isOneToOne: false
            referencedRelation: "catalogos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_orders_marca_id_fkey"
            columns: ["marca_id"]
            isOneToOne: false
            referencedRelation: "catalogos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_orders_memoria_id_fkey"
            columns: ["memoria_id"]
            isOneToOne: false
            referencedRelation: "catalogos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_orders_modelo_id_fkey"
            columns: ["modelo_id"]
            isOneToOne: false
            referencedRelation: "catalogos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_orders_tecnico_id_fkey"
            columns: ["tecnico_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_orders_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_orders_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      servicos: {
        Row: {
          ativo: boolean
          created_at: string
          custo_estimado: number
          descricao: string | null
          exige_aviso_risco: boolean
          garantia_meses: number
          grupo_id: string | null
          id: string
          nome: string
          preco_referencia: number
          tempo_estimado_horas: number | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          custo_estimado?: number
          descricao?: string | null
          exige_aviso_risco?: boolean
          garantia_meses?: number
          grupo_id?: string | null
          id?: string
          nome: string
          preco_referencia?: number
          tempo_estimado_horas?: number | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          custo_estimado?: number
          descricao?: string | null
          exige_aviso_risco?: boolean
          garantia_meses?: number
          grupo_id?: string | null
          id?: string
          nome?: string
          preco_referencia?: number
          tempo_estimado_horas?: number | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "servicos_grupo_id_fkey"
            columns: ["grupo_id"]
            isOneToOne: false
            referencedRelation: "catalogos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "servicos_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          ativo: boolean | null
          cnpj: string | null
          config_fiscal: Json | null
          config_whatsapp: Json | null
          cor_primaria: string | null
          cor_secundaria: string | null
          created_at: string | null
          email: string | null
          endereco: string | null
          id: string
          inscricao_estadual: string | null
          logo_url: string | null
          nome_loja: string
          telefone: string | null
          updated_at: string | null
          webhook_url: string | null
        }
        Insert: {
          ativo?: boolean | null
          cnpj?: string | null
          config_fiscal?: Json | null
          config_whatsapp?: Json | null
          cor_primaria?: string | null
          cor_secundaria?: string | null
          created_at?: string | null
          email?: string | null
          endereco?: string | null
          id?: string
          inscricao_estadual?: string | null
          logo_url?: string | null
          nome_loja: string
          telefone?: string | null
          updated_at?: string | null
          webhook_url?: string | null
        }
        Update: {
          ativo?: boolean | null
          cnpj?: string | null
          config_fiscal?: Json | null
          config_whatsapp?: Json | null
          cor_primaria?: string | null
          cor_secundaria?: string | null
          created_at?: string | null
          email?: string | null
          endereco?: string | null
          id?: string
          inscricao_estadual?: string | null
          logo_url?: string | null
          nome_loja?: string
          telefone?: string | null
          updated_at?: string | null
          webhook_url?: string | null
        }
        Relationships: []
      }
      titulos_financeiros: {
        Row: {
          categoria_id: string | null
          cliente_id: string | null
          competencia: string | null
          created_at: string
          criado_por: string | null
          descricao: string
          forma_pagamento_id: string | null
          fornecedor_id: string | null
          id: string
          natureza: Database["public"]["Enums"]["natureza_titulo"]
          observacoes: string | null
          os_id: string | null
          pago_em: string | null
          status: Database["public"]["Enums"]["status_titulo"]
          tenant_id: string
          updated_at: string
          valor: number
          valor_pago: number
          vencimento: string
          venda_id: string | null
        }
        Insert: {
          categoria_id?: string | null
          cliente_id?: string | null
          competencia?: string | null
          created_at?: string
          criado_por?: string | null
          descricao: string
          forma_pagamento_id?: string | null
          fornecedor_id?: string | null
          id?: string
          natureza: Database["public"]["Enums"]["natureza_titulo"]
          observacoes?: string | null
          os_id?: string | null
          pago_em?: string | null
          status?: Database["public"]["Enums"]["status_titulo"]
          tenant_id: string
          updated_at?: string
          valor: number
          valor_pago?: number
          vencimento: string
          venda_id?: string | null
        }
        Update: {
          categoria_id?: string | null
          cliente_id?: string | null
          competencia?: string | null
          created_at?: string
          criado_por?: string | null
          descricao?: string
          forma_pagamento_id?: string | null
          fornecedor_id?: string | null
          id?: string
          natureza?: Database["public"]["Enums"]["natureza_titulo"]
          observacoes?: string | null
          os_id?: string | null
          pago_em?: string | null
          status?: Database["public"]["Enums"]["status_titulo"]
          tenant_id?: string
          updated_at?: string
          valor?: number
          valor_pago?: number
          vencimento?: string
          venda_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "titulos_financeiros_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "categorias_financeiras"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "titulos_financeiros_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "titulos_financeiros_forma_pagamento_id_fkey"
            columns: ["forma_pagamento_id"]
            isOneToOne: false
            referencedRelation: "formas_pagamento"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "titulos_financeiros_forma_pagamento_id_fkey"
            columns: ["forma_pagamento_id"]
            isOneToOne: false
            referencedRelation: "vw_caixa_resumo_formas"
            referencedColumns: ["forma_pagamento_id"]
          },
          {
            foreignKeyName: "titulos_financeiros_fornecedor_id_fkey"
            columns: ["fornecedor_id"]
            isOneToOne: false
            referencedRelation: "fornecedores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "titulos_financeiros_os_id_fkey"
            columns: ["os_id"]
            isOneToOne: false
            referencedRelation: "service_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "titulos_financeiros_os_id_fkey"
            columns: ["os_id"]
            isOneToOne: false
            referencedRelation: "vw_os_aguardando_retirada"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "titulos_financeiros_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "titulos_financeiros_venda_id_fkey"
            columns: ["venda_id"]
            isOneToOne: false
            referencedRelation: "vendas"
            referencedColumns: ["id"]
          },
        ]
      }
      transportadoras: {
        Row: {
          ativo: boolean
          cpf_cnpj: string | null
          created_at: string
          email: string | null
          id: string
          nome: string
          observacoes: string | null
          site_rastreio: string | null
          telefones: string[]
          tenant_id: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          cpf_cnpj?: string | null
          created_at?: string
          email?: string | null
          id?: string
          nome: string
          observacoes?: string | null
          site_rastreio?: string | null
          telefones?: string[]
          tenant_id: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          cpf_cnpj?: string | null
          created_at?: string
          email?: string | null
          id?: string
          nome?: string
          observacoes?: string | null
          site_rastreio?: string | null
          telefones?: string[]
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "transportadoras_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      user_permissions: {
        Row: {
          concedida: boolean
          created_at: string
          definida_por: string | null
          motivo: string | null
          permission_key: string
          user_id: string
        }
        Insert: {
          concedida: boolean
          created_at?: string
          definida_por?: string | null
          motivo?: string | null
          permission_key: string
          user_id: string
        }
        Update: {
          concedida?: boolean
          created_at?: string
          definida_por?: string | null
          motivo?: string | null
          permission_key?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_permissions_permission_key_fkey"
            columns: ["permission_key"]
            isOneToOne: false
            referencedRelation: "permissions"
            referencedColumns: ["key"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      venda_status_historico: {
        Row: {
          created_at: string
          id: string
          status_anterior: Database["public"]["Enums"]["venda_status"] | null
          status_novo: Database["public"]["Enums"]["venda_status"]
          usuario_id: string | null
          venda_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          status_anterior?: Database["public"]["Enums"]["venda_status"] | null
          status_novo: Database["public"]["Enums"]["venda_status"]
          usuario_id?: string | null
          venda_id: string
        }
        Update: {
          created_at?: string
          id?: string
          status_anterior?: Database["public"]["Enums"]["venda_status"] | null
          status_novo?: Database["public"]["Enums"]["venda_status"]
          usuario_id?: string | null
          venda_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "venda_status_historico_venda_id_fkey"
            columns: ["venda_id"]
            isOneToOne: false
            referencedRelation: "vendas"
            referencedColumns: ["id"]
          },
        ]
      }
      vendas: {
        Row: {
          cliente_id: string | null
          comissao_calculada: number | null
          created_at: string | null
          descontos: number | null
          id: string
          numero_venda: string | null
          observacoes: string | null
          origem_venda_id: string | null
          status: Database["public"]["Enums"]["venda_status"] | null
          subtotal: number | null
          tenant_id: string
          total: number | null
          updated_at: string | null
          valor_faturamento_real: number | null
          vendedor_id: string | null
        }
        Insert: {
          cliente_id?: string | null
          comissao_calculada?: number | null
          created_at?: string | null
          descontos?: number | null
          id?: string
          numero_venda?: string | null
          observacoes?: string | null
          origem_venda_id?: string | null
          status?: Database["public"]["Enums"]["venda_status"] | null
          subtotal?: number | null
          tenant_id: string
          total?: number | null
          updated_at?: string | null
          valor_faturamento_real?: number | null
          vendedor_id?: string | null
        }
        Update: {
          cliente_id?: string | null
          comissao_calculada?: number | null
          created_at?: string | null
          descontos?: number | null
          id?: string
          numero_venda?: string | null
          observacoes?: string | null
          origem_venda_id?: string | null
          status?: Database["public"]["Enums"]["venda_status"] | null
          subtotal?: number | null
          tenant_id?: string
          total?: number | null
          updated_at?: string | null
          valor_faturamento_real?: number | null
          vendedor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vendas_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendas_origem_venda_id_fkey"
            columns: ["origem_venda_id"]
            isOneToOne: false
            referencedRelation: "catalogos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendas_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendas_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      vw_caixa_resumo_formas: {
        Row: {
          entra_no_caixa: boolean | null
          forma_descricao: string | null
          forma_pagamento_id: string | null
          sessao_id: string | null
          total: number | null
        }
        Relationships: []
      }
      vw_movimentos_estoque: {
        Row: {
          created_at: string | null
          custo_unitario: number | null
          id: string | null
          motivo: string | null
          origem: string | null
          produto_id: string | null
          quantidade: number | null
          saldo_anterior: number | null
          saldo_depois: number | null
          tenant_id: string | null
          tipo: Database["public"]["Enums"]["movimento_tipo"] | null
          usuario_id: string | null
          valor_total: number | null
        }
        Insert: {
          created_at?: string | null
          custo_unitario?: never
          id?: string | null
          motivo?: string | null
          origem?: string | null
          produto_id?: string | null
          quantidade?: number | null
          saldo_anterior?: number | null
          saldo_depois?: number | null
          tenant_id?: string | null
          tipo?: Database["public"]["Enums"]["movimento_tipo"] | null
          usuario_id?: string | null
          valor_total?: never
        }
        Update: {
          created_at?: string | null
          custo_unitario?: never
          id?: string | null
          motivo?: string | null
          origem?: string | null
          produto_id?: string | null
          quantidade?: number | null
          saldo_anterior?: number | null
          saldo_depois?: number | null
          tenant_id?: string | null
          tipo?: Database["public"]["Enums"]["movimento_tipo"] | null
          usuario_id?: string | null
          valor_total?: never
        }
        Relationships: [
          {
            foreignKeyName: "movimentos_estoque_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimentos_estoque_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "vw_produtos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimentos_estoque_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      vw_os_aguardando_retirada: {
        Row: {
          cliente_id: string | null
          cliente_nome: string | null
          cliente_telefone: string | null
          dias_parado: number | null
          faixa: string | null
          id: string | null
          marca: string | null
          modelo: string | null
          numero_os: string | null
          numero_serie: string | null
          pronto_desde: string | null
          status: string | null
          tenant_id: string | null
          total_orcamento: number | null
        }
        Relationships: [
          {
            foreignKeyName: "service_orders_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_orders_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      vw_os_itens: {
        Row: {
          created_at: string | null
          custo_unitario: number | null
          descricao: string | null
          garantia_item_meses: number | null
          horas_mao_obra: number | null
          id: string | null
          os_id: string | null
          preco_cobrado: number | null
          produto_id: string | null
          quantidade: number | null
        }
        Insert: {
          created_at?: string | null
          custo_unitario?: never
          descricao?: string | null
          garantia_item_meses?: number | null
          horas_mao_obra?: number | null
          id?: string | null
          os_id?: string | null
          preco_cobrado?: number | null
          produto_id?: string | null
          quantidade?: number | null
        }
        Update: {
          created_at?: string | null
          custo_unitario?: never
          descricao?: string | null
          garantia_item_meses?: number | null
          horas_mao_obra?: number | null
          id?: string | null
          os_id?: string | null
          preco_cobrado?: number | null
          produto_id?: string | null
          quantidade?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "service_order_items_os_id_fkey"
            columns: ["os_id"]
            isOneToOne: false
            referencedRelation: "service_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_order_items_os_id_fkey"
            columns: ["os_id"]
            isOneToOne: false
            referencedRelation: "vw_os_aguardando_retirada"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_order_items_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_order_items_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "vw_produtos"
            referencedColumns: ["id"]
          },
        ]
      }
      vw_produtos: {
        Row: {
          ativo: boolean | null
          categoria: Database["public"]["Enums"]["produto_categoria"] | null
          codigo_barra: string | null
          condicao_id: string | null
          cor_id: string | null
          created_at: string | null
          custo: number | null
          estoque_atual: number | null
          estoque_maximo: number | null
          estoque_minimo: number | null
          foto_url: string | null
          garantia_meses: number | null
          grupo_produto_id: string | null
          id: string | null
          imei_serial: string | null
          localizacao: Database["public"]["Enums"]["produto_localizacao"] | null
          marca: string | null
          marca_id: string | null
          margem_percent: number | null
          memoria_id: string | null
          modelo: string | null
          modelo_id: string | null
          nome: string | null
          observacoes: string | null
          preco: number | null
          tenant_id: string | null
          updated_at: string | null
        }
        Insert: {
          ativo?: boolean | null
          categoria?: Database["public"]["Enums"]["produto_categoria"] | null
          codigo_barra?: string | null
          condicao_id?: string | null
          cor_id?: string | null
          created_at?: string | null
          custo?: never
          estoque_atual?: number | null
          estoque_maximo?: number | null
          estoque_minimo?: number | null
          foto_url?: string | null
          garantia_meses?: number | null
          grupo_produto_id?: string | null
          id?: string | null
          imei_serial?: string | null
          localizacao?:
            | Database["public"]["Enums"]["produto_localizacao"]
            | null
          marca?: string | null
          marca_id?: string | null
          margem_percent?: never
          memoria_id?: string | null
          modelo?: string | null
          modelo_id?: string | null
          nome?: string | null
          observacoes?: string | null
          preco?: number | null
          tenant_id?: string | null
          updated_at?: string | null
        }
        Update: {
          ativo?: boolean | null
          categoria?: Database["public"]["Enums"]["produto_categoria"] | null
          codigo_barra?: string | null
          condicao_id?: string | null
          cor_id?: string | null
          created_at?: string | null
          custo?: never
          estoque_atual?: number | null
          estoque_maximo?: number | null
          estoque_minimo?: number | null
          foto_url?: string | null
          garantia_meses?: number | null
          grupo_produto_id?: string | null
          id?: string | null
          imei_serial?: string | null
          localizacao?:
            | Database["public"]["Enums"]["produto_localizacao"]
            | null
          marca?: string | null
          marca_id?: string | null
          margem_percent?: never
          memoria_id?: string | null
          modelo?: string | null
          modelo_id?: string | null
          nome?: string | null
          observacoes?: string | null
          preco?: number | null
          tenant_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "produtos_condicao_id_fkey"
            columns: ["condicao_id"]
            isOneToOne: false
            referencedRelation: "catalogos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "produtos_cor_id_fkey"
            columns: ["cor_id"]
            isOneToOne: false
            referencedRelation: "catalogos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "produtos_grupo_produto_id_fkey"
            columns: ["grupo_produto_id"]
            isOneToOne: false
            referencedRelation: "catalogos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "produtos_marca_id_fkey"
            columns: ["marca_id"]
            isOneToOne: false
            referencedRelation: "catalogos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "produtos_memoria_id_fkey"
            columns: ["memoria_id"]
            isOneToOne: false
            referencedRelation: "catalogos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "produtos_modelo_id_fkey"
            columns: ["modelo_id"]
            isOneToOne: false
            referencedRelation: "catalogos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "produtos_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      vw_servicos: {
        Row: {
          ativo: boolean | null
          created_at: string | null
          custo_estimado: number | null
          descricao: string | null
          exige_aviso_risco: boolean | null
          garantia_meses: number | null
          grupo_id: string | null
          id: string | null
          nome: string | null
          preco_referencia: number | null
          tempo_estimado_horas: number | null
          tenant_id: string | null
          updated_at: string | null
        }
        Insert: {
          ativo?: boolean | null
          created_at?: string | null
          custo_estimado?: never
          descricao?: string | null
          exige_aviso_risco?: boolean | null
          garantia_meses?: number | null
          grupo_id?: string | null
          id?: string | null
          nome?: string | null
          preco_referencia?: number | null
          tempo_estimado_horas?: number | null
          tenant_id?: string | null
          updated_at?: string | null
        }
        Update: {
          ativo?: boolean | null
          created_at?: string | null
          custo_estimado?: never
          descricao?: string | null
          exige_aviso_risco?: boolean | null
          garantia_meses?: number | null
          grupo_id?: string | null
          id?: string | null
          nome?: string | null
          preco_referencia?: number | null
          tempo_estimado_horas?: number | null
          tenant_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "servicos_grupo_id_fkey"
            columns: ["grupo_id"]
            isOneToOne: false
            referencedRelation: "catalogos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "servicos_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      ajustar_estoque_produto: {
        Args: {
          _motivo?: string
          _nova_quantidade: number
          _produto_id: string
        }
        Returns: undefined
      }
      aplicar_trava_de_custo: { Args: never; Returns: string }
      buscar_clientes_semelhantes: {
        Args: { _documento?: string; _nome?: string; _telefone?: string }
        Returns: {
          cpf_cnpj: string
          id: string
          liberado_venda: boolean
          motivo: string
          nome: string
          telefones: string[]
        }[]
      }
      catalogo_e_do_tipo: {
        Args: { _id: string; _tipo: string }
        Returns: boolean
      }
      garantir_caixa_aberto: {
        Args: { _tenant: string; _usuario: string }
        Returns: string
      }
      get_user_tenant_id: { Args: { _user_id: string }; Returns: string }
      has_permission: {
        Args: { _permission: string; _user_id: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      historico_do_usuario: { Args: { _user_id: string }; Returns: Json }
      iniciar_execucao_os: { Args: { _os_id: string }; Returns: string }
      iniciar_reparo_os: { Args: { _os_id: string }; Returns: string }
      minhas_permissoes: { Args: never; Returns: string[] }
      proximo_numero_documento: {
        Args: { _documento: string; _tenant: string }
        Returns: string
      }
      proximo_numero_entrada: { Args: { _tenant: string }; Returns: string }
      proximo_numero_os: { Args: { _tenant: string }; Returns: string }
      proximo_numero_venda: { Args: { _tenant: string }; Returns: string }
      registrar_entrada_mercadoria: {
        Args: {
          _categoria_id?: string
          _data_entrada?: string
          _fornecedor_id: string
          _itens: Json
          _numero_nota?: string
          _observacao?: string
        }
        Returns: string
      }
      registrar_entrada_produto_troca: {
        Args: {
          _condicao_id: string
          _cor_id: string
          _grupo_produto_id: string
          _imei_serial: string
          _marca_id: string
          _memoria_id: string
          _modelo_id: string
          _nome: string
          _observacoes?: string
          _preco_venda?: number
          _valor_entrada: number
          _venda_id: string
        }
        Returns: string
      }
      somente_digitos: { Args: { _texto: string }; Returns: string }
      trocar_papel_do_usuario: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: undefined
      }
      user_belongs_to_tenant: {
        Args: { _tenant_id: string; _user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role:
        | "admin"
        | "atendente"
        | "tecnico"
        | "vendedor"
        | "administrador"
        | "gerente"
        | "gerente_tecnico"
      cliente_origem:
        | "instagram"
        | "indicacao"
        | "google"
        | "facebook"
        | "whatsapp"
        | "loja"
        | "outro"
      cliente_tag: "vip" | "fiel" | "problema"
      faixa_premiacao: "bronze" | "prata" | "ouro" | "diamante"
      forma_pagamento:
        | "pix"
        | "dinheiro"
        | "cartao_credito"
        | "cartao_debito"
        | "boleto"
        | "crediario"
        | "vale_troca"
      movimento_tipo: "entrada" | "saida" | "ajuste" | "inventario"
      natureza_financeira: "receita" | "despesa"
      natureza_titulo: "pagar" | "receber"
      os_prioridade: "baixa" | "normal" | "alta" | "urgente"
      os_status:
        | "recebido"
        | "diagnostico"
        | "aguardando_peca"
        | "aguardando_aprovacao"
        | "em_reparo"
        | "pronto"
        | "entregue"
        | "cancelado"
      os_tipo: "paga" | "garantia" | "cortesia"
      produto_categoria: "celular" | "acessorio" | "peca" | "servico"
      produto_localizacao: "vitrine" | "deposito" | "bancada" | "sucata"
      status_caixa: "aberto" | "fechado"
      status_titulo: "aberto" | "pago" | "cancelado"
      tipo_juros: "sem_juros" | "simples" | "composto"
      tipo_mov_caixa:
        | "venda"
        | "recebimento"
        | "pagamento"
        | "sangria"
        | "suprimento"
        | "ajuste"
        | "devolucao"
      venda_status: "rascunho" | "pago" | "faturado" | "cancelado"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      app_role: [
        "admin",
        "atendente",
        "tecnico",
        "vendedor",
        "administrador",
        "gerente",
        "gerente_tecnico",
      ],
      cliente_origem: [
        "instagram",
        "indicacao",
        "google",
        "facebook",
        "whatsapp",
        "loja",
        "outro",
      ],
      cliente_tag: ["vip", "fiel", "problema"],
      faixa_premiacao: ["bronze", "prata", "ouro", "diamante"],
      forma_pagamento: [
        "pix",
        "dinheiro",
        "cartao_credito",
        "cartao_debito",
        "boleto",
        "crediario",
        "vale_troca",
      ],
      movimento_tipo: ["entrada", "saida", "ajuste", "inventario"],
      natureza_financeira: ["receita", "despesa"],
      natureza_titulo: ["pagar", "receber"],
      os_prioridade: ["baixa", "normal", "alta", "urgente"],
      os_status: [
        "recebido",
        "diagnostico",
        "aguardando_peca",
        "aguardando_aprovacao",
        "em_reparo",
        "pronto",
        "entregue",
        "cancelado",
      ],
      os_tipo: ["paga", "garantia", "cortesia"],
      produto_categoria: ["celular", "acessorio", "peca", "servico"],
      produto_localizacao: ["vitrine", "deposito", "bancada", "sucata"],
      status_caixa: ["aberto", "fechado"],
      status_titulo: ["aberto", "pago", "cancelado"],
      tipo_juros: ["sem_juros", "simples", "composto"],
      tipo_mov_caixa: [
        "venda",
        "recebimento",
        "pagamento",
        "sangria",
        "suprimento",
        "ajuste",
        "devolucao",
      ],
      venda_status: ["rascunho", "pago", "faturado", "cancelado"],
    },
  },
} as const

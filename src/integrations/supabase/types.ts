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
    PostgrestVersion: "14.15"
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
            foreignKeyName: "caixa_movimentos_forma_pagamento_id_fkey"
            columns: ["forma_pagamento_id"]
            isOneToOne: false
            referencedRelation: "formas_pagamento"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "caixa_movimentos_sessao_id_fkey"
            columns: ["sessao_id"]
            isOneToOne: false
            referencedRelation: "caixa_sessoes"
            referencedColumns: ["id"]
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
      formas_pagamento: {
        Row: {
          ativo: boolean
          contem_taxa: boolean
          created_at: string
          descricao: string
          entra_no_caixa: boolean
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
            foreignKeyName: "itens_venda_venda_id_fkey"
            columns: ["venda_id"]
            isOneToOne: false
            referencedRelation: "vendas"
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
            foreignKeyName: "movimentos_estoque_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      os_status_config: {
        Row: {
          ativo: boolean | null
          color: string
          created_at: string | null
          icon: string | null
          id: string
          key: string
          label: string
          ordem: number
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          ativo?: boolean | null
          color?: string
          created_at?: string | null
          icon?: string | null
          id?: string
          key: string
          label: string
          ordem?: number
          tenant_id: string
          updated_at?: string | null
        }
        Update: {
          ativo?: boolean | null
          color?: string
          created_at?: string | null
          icon?: string | null
          id?: string
          key?: string
          label?: string
          ordem?: number
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
          gateway_id: string | null
          id: string
          parcelas: number | null
          valor: number
          venda_id: string
        }
        Insert: {
          created_at?: string | null
          forma: Database["public"]["Enums"]["forma_pagamento"]
          gateway_id?: string | null
          id?: string
          parcelas?: number | null
          valor: number
          venda_id: string
        }
        Update: {
          created_at?: string | null
          forma?: Database["public"]["Enums"]["forma_pagamento"]
          gateway_id?: string | null
          id?: string
          parcelas?: number | null
          valor?: number
          venda_id?: string
        }
        Relationships: [
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
          created_at: string | null
          custo: number | null
          estoque_atual: number | null
          estoque_maximo: number | null
          estoque_minimo: number | null
          foto_url: string | null
          garantia_meses: number | null
          id: string
          imei_serial: string | null
          localizacao: Database["public"]["Enums"]["produto_localizacao"] | null
          marca: string | null
          margem_percent: number | null
          modelo: string | null
          nome: string
          preco: number | null
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          ativo?: boolean | null
          categoria?: Database["public"]["Enums"]["produto_categoria"] | null
          codigo_barra?: string | null
          created_at?: string | null
          custo?: number | null
          estoque_atual?: number | null
          estoque_maximo?: number | null
          estoque_minimo?: number | null
          foto_url?: string | null
          garantia_meses?: number | null
          id?: string
          imei_serial?: string | null
          localizacao?:
            | Database["public"]["Enums"]["produto_localizacao"]
            | null
          marca?: string | null
          margem_percent?: number | null
          modelo?: string | null
          nome: string
          preco?: number | null
          tenant_id: string
          updated_at?: string | null
        }
        Update: {
          ativo?: boolean | null
          categoria?: Database["public"]["Enums"]["produto_categoria"] | null
          codigo_barra?: string | null
          created_at?: string | null
          custo?: number | null
          estoque_atual?: number | null
          estoque_maximo?: number | null
          estoque_minimo?: number | null
          foto_url?: string | null
          garantia_meses?: number | null
          id?: string
          imei_serial?: string | null
          localizacao?:
            | Database["public"]["Enums"]["produto_localizacao"]
            | null
          marca?: string | null
          margem_percent?: number | null
          modelo?: string | null
          nome?: string
          preco?: number | null
          tenant_id?: string
          updated_at?: string | null
        }
        Relationships: [
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
          status_anterior: Database["public"]["Enums"]["os_status"] | null
          status_novo: Database["public"]["Enums"]["os_status"]
          usuario_id: string | null
        }
        Insert: {
          comentario?: string | null
          created_at?: string | null
          id?: string
          os_id: string
          sla_tempo?: number | null
          status_anterior?: Database["public"]["Enums"]["os_status"] | null
          status_novo: Database["public"]["Enums"]["os_status"]
          usuario_id?: string | null
        }
        Update: {
          comentario?: string | null
          created_at?: string | null
          id?: string
          os_id?: string
          sla_tempo?: number | null
          status_anterior?: Database["public"]["Enums"]["os_status"] | null
          status_novo?: Database["public"]["Enums"]["os_status"]
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
            foreignKeyName: "service_order_items_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
        ]
      }
      service_orders: {
        Row: {
          acessorios_deixados: Json | null
          cliente_id: string
          condicao_entrada: string | null
          constatacao_tecnica: string | null
          cor: string | null
          created_at: string | null
          data_finalizacao: string | null
          defeito_cliente: string
          diagnostico_tecnico: string | null
          garantia_meses: number
          id: string
          marca: string | null
          memoria: string | null
          modelo: string | null
          numero_os: string
          numero_serie: string | null
          observacoes: string | null
          prazo_previsto: string | null
          prioridade: Database["public"]["Enums"]["os_prioridade"] | null
          reparo_inviavel: boolean
          risco_informado_em: string | null
          senha_aparelho: string | null
          status: string | null
          suspeita_tecnica: string | null
          tecnico_id: string | null
          tenant_id: string
          tipo: Database["public"]["Enums"]["os_tipo"] | null
          total_mao_obra: number | null
          total_orcamento: number | null
          total_pecas: number | null
          updated_at: string | null
          valor_final_pago: number | null
        }
        Insert: {
          acessorios_deixados?: Json | null
          cliente_id: string
          condicao_entrada?: string | null
          constatacao_tecnica?: string | null
          cor?: string | null
          created_at?: string | null
          data_finalizacao?: string | null
          defeito_cliente: string
          diagnostico_tecnico?: string | null
          garantia_meses?: number
          id?: string
          marca?: string | null
          memoria?: string | null
          modelo?: string | null
          numero_os: string
          numero_serie?: string | null
          observacoes?: string | null
          prazo_previsto?: string | null
          prioridade?: Database["public"]["Enums"]["os_prioridade"] | null
          reparo_inviavel?: boolean
          risco_informado_em?: string | null
          senha_aparelho?: string | null
          status?: string | null
          suspeita_tecnica?: string | null
          tecnico_id?: string | null
          tenant_id: string
          tipo?: Database["public"]["Enums"]["os_tipo"] | null
          total_mao_obra?: number | null
          total_orcamento?: number | null
          total_pecas?: number | null
          updated_at?: string | null
          valor_final_pago?: number | null
        }
        Update: {
          acessorios_deixados?: Json | null
          cliente_id?: string
          condicao_entrada?: string | null
          constatacao_tecnica?: string | null
          cor?: string | null
          created_at?: string | null
          data_finalizacao?: string | null
          defeito_cliente?: string
          diagnostico_tecnico?: string | null
          garantia_meses?: number
          id?: string
          marca?: string | null
          memoria?: string | null
          modelo?: string | null
          numero_os?: string
          numero_serie?: string | null
          observacoes?: string | null
          prazo_previsto?: string | null
          prioridade?: Database["public"]["Enums"]["os_prioridade"] | null
          reparo_inviavel?: boolean
          risco_informado_em?: string | null
          senha_aparelho?: string | null
          status?: string | null
          suspeita_tecnica?: string | null
          tecnico_id?: string | null
          tenant_id?: string
          tipo?: Database["public"]["Enums"]["os_tipo"] | null
          total_mao_obra?: number | null
          total_orcamento?: number | null
          total_pecas?: number | null
          updated_at?: string | null
          valor_final_pago?: number | null
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
      vendas: {
        Row: {
          cliente_id: string | null
          comissao_calculada: number | null
          created_at: string | null
          descontos: number | null
          id: string
          numero_venda: string | null
          observacoes: string | null
          status: Database["public"]["Enums"]["venda_status"] | null
          subtotal: number | null
          tenant_id: string
          total: number | null
          updated_at: string | null
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
          status?: Database["public"]["Enums"]["venda_status"] | null
          subtotal?: number | null
          tenant_id: string
          total?: number | null
          updated_at?: string | null
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
          status?: Database["public"]["Enums"]["venda_status"] | null
          subtotal?: number | null
          tenant_id?: string
          total?: number | null
          updated_at?: string | null
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
            foreignKeyName: "vendas_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      catalogo_e_do_tipo: {
        Args: { _id: string; _tipo: string }
        Returns: boolean
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
      minhas_permissoes: { Args: never; Returns: string[] }
      proximo_numero_documento: {
        Args: { _documento: string; _tenant: string }
        Returns: string
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
      ],
      venda_status: ["rascunho", "pago", "faturado", "cancelado"],
    },
  },
} as const

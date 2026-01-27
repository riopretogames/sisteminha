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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      clientes: {
        Row: {
          ativo: boolean | null
          cpf_cnpj: string | null
          created_at: string | null
          data_nascimento: string | null
          email: string | null
          endereco: string | null
          foto_url: string | null
          id: string
          nome: string
          observacoes: string | null
          origem: Database["public"]["Enums"]["cliente_origem"] | null
          tags: Database["public"]["Enums"]["cliente_tag"][] | null
          telefones: string[] | null
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          ativo?: boolean | null
          cpf_cnpj?: string | null
          created_at?: string | null
          data_nascimento?: string | null
          email?: string | null
          endereco?: string | null
          foto_url?: string | null
          id?: string
          nome: string
          observacoes?: string | null
          origem?: Database["public"]["Enums"]["cliente_origem"] | null
          tags?: Database["public"]["Enums"]["cliente_tag"][] | null
          telefones?: string[] | null
          tenant_id: string
          updated_at?: string | null
        }
        Update: {
          ativo?: boolean | null
          cpf_cnpj?: string | null
          created_at?: string | null
          data_nascimento?: string | null
          email?: string | null
          endereco?: string | null
          foto_url?: string | null
          id?: string
          nome?: string
          observacoes?: string | null
          origem?: Database["public"]["Enums"]["cliente_origem"] | null
          tags?: Database["public"]["Enums"]["cliente_tag"][] | null
          telefones?: string[] | null
          tenant_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clientes_tenant_id_fkey"
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
          cor: string | null
          created_at: string | null
          data_finalizacao: string | null
          defeito_cliente: string
          diagnostico_tecnico: string | null
          id: string
          imei: string | null
          marca: string | null
          memoria: string | null
          modelo: string | null
          numero_os: string
          prazo_previsto: string | null
          prioridade: Database["public"]["Enums"]["os_prioridade"] | null
          senha_aparelho: string | null
          status: Database["public"]["Enums"]["os_status"] | null
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
          cor?: string | null
          created_at?: string | null
          data_finalizacao?: string | null
          defeito_cliente: string
          diagnostico_tecnico?: string | null
          id?: string
          imei?: string | null
          marca?: string | null
          memoria?: string | null
          modelo?: string | null
          numero_os: string
          prazo_previsto?: string | null
          prioridade?: Database["public"]["Enums"]["os_prioridade"] | null
          senha_aparelho?: string | null
          status?: Database["public"]["Enums"]["os_status"] | null
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
          cor?: string | null
          created_at?: string | null
          data_finalizacao?: string | null
          defeito_cliente?: string
          diagnostico_tecnico?: string | null
          id?: string
          imei?: string | null
          marca?: string | null
          memoria?: string | null
          modelo?: string | null
          numero_os?: string
          prazo_previsto?: string | null
          prioridade?: Database["public"]["Enums"]["os_prioridade"] | null
          senha_aparelho?: string | null
          status?: Database["public"]["Enums"]["os_status"] | null
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
      get_user_tenant_id: { Args: { _user_id: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      user_belongs_to_tenant: {
        Args: { _tenant_id: string; _user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "atendente" | "tecnico" | "vendedor"
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
  public: {
    Enums: {
      app_role: ["admin", "atendente", "tecnico", "vendedor"],
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
      venda_status: ["rascunho", "pago", "faturado", "cancelado"],
    },
  },
} as const

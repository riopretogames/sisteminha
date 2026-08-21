-- =============================================================================
-- Sisteminha (RPG System.IO) — massa de teste pedida pelo Felipe em 21/08
-- =============================================================================
--
-- Cria 10 clientes, 10 produtos, 10 vendas e 10 OS (em etapas diferentes) para
-- exercitar o sistema com volume parecido com o de um dia de loja.
--
-- POR QUE VIA MIGRATION, E NÃO PELA TELA: quem está escrevendo isto não tem
-- login no sistema, e não deve manusear senha de ninguém. Rodar pelo banco tem
-- uma vantagem real além da conveniência — os gatilhos disparam exatamente
-- como disparariam pela tela (estoque desconta, título nasce, caixa lança,
-- auditoria grava), então o que este seed testa é a REGRA, que é onde moram os
-- erros caros. O que ele NÃO testa é a tela: layout, validação de formulário e
-- mensagem de erro continuam sem cobertura.
--
-- TUDO É IDENTIFICÁVEL E REVERSÍVEL: todo registro leva a marca
-- '[SEED-TESTE-21-08]' em observacoes. Para apagar, remover por essa marca.
--
-- A numeração de documento é replicada aqui em vez de chamar
-- `proximo_numero_documento`: aquela função (endurecida em 18/08) exige que o
-- tenant seja o do usuário logado, e numa migration não há usuário logado.
-- Replicar mantém a sequência real, sem furar a proteção.
-- =============================================================================

DO $$
DECLARE
  v_tenant     UUID;
  v_perfil     UUID;
  v_forma      UUID;
  v_forma_enum public.forma_pagamento;
  v_ano_mes    TEXT := to_char(now(), 'YYYYMM');
  v_seq        INTEGER;
  v_num        TEXT;
  v_cliente    UUID;
  v_produto    UUID;
  v_venda      UUID;
  v_clientes   UUID[] := ARRAY[]::UUID[];
  v_produtos   UUID[] := ARRAY[]::UUID[];
  v_status     TEXT[];
  i            INTEGER;
  v_preco      NUMERIC;
  v_qtd        INTEGER;

  NOMES  TEXT[] := ARRAY['Adriana Prado','Bruno Tavares','Carla Menezes','Diego Faria',
                         'Elaine Souza','Fabio Rocha','Gisele Amaral','Heitor Lima',
                         'Isabela Nunes','Joao Vitor Passos'];
  PRODS  TEXT[] := ARRAY['PlayStation 5 Slim 1TB','Xbox Series S 512GB','Nintendo Switch OLED',
                         'Controle DualSense Branco','Headset HyperX Cloud II',
                         'Cabo HDMI 2.1 2m','SSD NVMe 1TB','Echo Dot 5a Geracao',
                         'Teclado Mecanico RGB','Mouse Gamer 16000 DPI'];
  MARCAS TEXT[] := ARRAY['Sony','Microsoft','Nintendo','Sony','HyperX',
                         'Generico','Kingston','Amazon','Redragon','Logitech'];
  PRECOS NUMERIC[] := ARRAY[3799.00, 2299.00, 2499.00, 429.90, 549.00,
                            59.90, 489.00, 349.00, 279.90, 199.90];
  CUSTOS NUMERIC[] := ARRAY[3100.00, 1850.00, 2050.00, 310.00, 390.00,
                            22.00, 340.00, 240.00, 180.00, 120.00];
  APAR   TEXT[] := ARRAY['PlayStation 4','Xbox One S','Nintendo Switch','iPhone 11',
                         'Notebook Dell','PlayStation 3','Xbox 360','Motorola Moto G',
                         'PlayStation 5','Notebook Acer'];
  MARCAP TEXT[] := ARRAY['Sony','Microsoft','Nintendo','Apple','Dell',
                         'Sony','Microsoft','Motorola','Sony','Acer'];
  DEFEITOS TEXT[] := ARRAY['Nao liga','Superaquecendo','Nao le disco','Tela quebrada',
                           'Nao carrega','Travando em jogos','Luz vermelha',
                           'Sem audio pelo HDMI','Controle com drift','Ventoinha barulhenta'];
BEGIN
  SELECT id INTO v_tenant FROM public.tenants ORDER BY created_at LIMIT 1;
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'Nenhuma loja cadastrada — nada a semear.';
  END IF;

  SELECT id INTO v_perfil FROM public.profiles WHERE tenant_id = v_tenant ORDER BY created_at LIMIT 1;

  SELECT id, forma_enum INTO v_forma, v_forma_enum
    FROM public.formas_pagamento
   WHERE tenant_id = v_tenant AND ativo = true
   ORDER BY ordem NULLS LAST, descricao
   LIMIT 1;

  IF v_forma IS NULL THEN
    RAISE EXCEPTION 'Nenhuma forma de pagamento ativa — venda de teste nao fecharia.';
  END IF;

  RAISE NOTICE 'Loja %, perfil %, forma de pagamento %', v_tenant, v_perfil, v_forma_enum;

  -- ── 10 CLIENTES ───────────────────────────────────────────────────────────
  -- Documento e telefone distintos de propósito: a regra de cliente único
  -- (índice + gatilho) recusaria repetido, e o seed tem que passar por ela
  -- como um cadastro de verdade passaria.
  FOR i IN 1..10 LOOP
    INSERT INTO public.clientes (
      tenant_id, nome, cpf_cnpj, telefones, email, ativo, liberado_venda, observacoes
    ) VALUES (
      v_tenant,
      NOMES[i],
      lpad((91000000000 + i)::text, 11, '0'),
      ARRAY[ '179' || lpad((10000000 + i)::text, 8, '0') ],
      lower(split_part(NOMES[i], ' ', 1)) || i || '@teste.local',
      true,
      -- O cliente 10 nasce BLOQUEADO pra venda: é o caso que exercita a
      -- trava do banco e o aviso novo da Nova OS.
      (i < 10),
      '[SEED-TESTE-21-08] cliente de teste'
    ) RETURNING id INTO v_cliente;
    v_clientes := v_clientes || v_cliente;
  END LOOP;
  RAISE NOTICE '10 clientes criados (o 10o bloqueado pra venda, de proposito)';

  -- ── 10 PRODUTOS ───────────────────────────────────────────────────────────
  FOR i IN 1..10 LOOP
    INSERT INTO public.produtos (
      tenant_id, nome, marca, categoria, localizacao, codigo_barra,
      preco, custo, estoque_atual, estoque_minimo, ativo, observacoes
    ) VALUES (
      v_tenant,
      PRODS[i],
      MARCAS[i],
      'acessorio'::public.produto_categoria,
      'vitrine'::public.produto_localizacao,
      '789' || lpad((1000000 + i)::text, 10, '0'),
      PRECOS[i],
      CUSTOS[i],
      20,
      -- Produtos 9 e 10 já nascem no limite, pra a tela de Estoque Crítico
      -- ter o que mostrar sem precisar esperar venda.
      CASE WHEN i >= 9 THEN 20 ELSE 3 END,
      true,
      '[SEED-TESTE-21-08] produto de teste'
    ) RETURNING id INTO v_produto;
    v_produtos := v_produtos || v_produto;
  END LOOP;
  RAISE NOTICE '10 produtos criados, estoque 20 cada (2 ja em nivel critico)';

  -- ── 10 VENDAS ─────────────────────────────────────────────────────────────
  FOR i IN 1..10 LOOP
    INSERT INTO public.documento_sequencias (tenant_id, documento, ano_mes, ultimo)
    VALUES (v_tenant, 'VD', v_ano_mes, 1)
    ON CONFLICT (tenant_id, documento, ano_mes)
    DO UPDATE SET ultimo = public.documento_sequencias.ultimo + 1
    RETURNING ultimo INTO v_seq;
    v_num := 'VD-' || v_ano_mes || '-' || lpad(v_seq::text, 4, '0');

    v_qtd   := 1 + (i % 3);
    v_preco := PRECOS[i];

    INSERT INTO public.vendas (
      tenant_id, numero_venda, cliente_id, vendedor_id, status,
      subtotal, descontos, total, observacoes, created_at
    ) VALUES (
      v_tenant, v_num,
      -- Cliente 10 está bloqueado: as vendas usam só os 9 liberados.
      v_clientes[1 + ((i - 1) % 9)],
      v_perfil,
      'pago'::public.venda_status,
      v_preco * v_qtd,
      0,
      v_preco * v_qtd,
      '[SEED-TESTE-21-08] venda de teste',
      -- Espalha ao longo do mês corrente pra os relatórios por período
      -- terem o que agrupar.
      date_trunc('month', now()) + ((i - 1) || ' days')::interval + '10 hours'::interval
    ) RETURNING id INTO v_venda;

    INSERT INTO public.itens_venda (venda_id, produto_id, quantidade, preco_unitario, total)
    VALUES (v_venda, v_produtos[i], v_qtd, v_preco, v_preco * v_qtd);

    INSERT INTO public.pagamentos_venda (venda_id, forma, valor, parcelas)
    VALUES (v_venda, v_forma_enum, v_preco * v_qtd, 1);
  END LOOP;
  RAISE NOTICE '10 vendas criadas, cada uma com item e pagamento';

  -- ── 10 ORDENS DE SERVIÇO, EM ETAPAS DIFERENTES ────────────────────────────
  SELECT array_agg(key ORDER BY ordem)
    INTO v_status
    FROM public.os_status_config
   WHERE tenant_id = v_tenant AND ativo = true;

  IF v_status IS NULL OR array_length(v_status, 1) = 0 THEN
    RAISE EXCEPTION 'Nenhuma etapa de OS cadastrada.';
  END IF;

  FOR i IN 1..10 LOOP
    INSERT INTO public.documento_sequencias (tenant_id, documento, ano_mes, ultimo)
    VALUES (v_tenant, 'OS', v_ano_mes, 1)
    ON CONFLICT (tenant_id, documento, ano_mes)
    DO UPDATE SET ultimo = public.documento_sequencias.ultimo + 1
    RETURNING ultimo INTO v_seq;
    v_num := 'OS-' || v_ano_mes || '-' || lpad(v_seq::text, 4, '0');

    INSERT INTO public.service_orders (
      tenant_id, numero_os, cliente_id, vendedor_id, tecnico_id,
      marca, modelo, defeito_cliente, status, tipo, prioridade,
      total_orcamento, garantia_dias, observacoes, created_at, prazo_previsto
    ) VALUES (
      v_tenant, v_num,
      v_clientes[i],
      v_perfil, v_perfil,
      MARCAP[i], APAR[i], DEFEITOS[i],
      -- Distribui pelas etapas ativas, dando a volta na lista.
      v_status[1 + ((i - 1) % array_length(v_status, 1))],
      'paga'::public.os_tipo,
      (ARRAY['baixa','normal','alta','urgente'])[1 + ((i - 1) % 4)]::public.os_prioridade,
      150.00 * i,
      90,
      '[SEED-TESTE-21-08] OS de teste',
      date_trunc('month', now()) + ((i - 1) || ' days')::interval + '14 hours'::interval,
      -- Algumas nascem com prazo já vencido, pra exercitar o "atrasada".
      CASE WHEN i <= 3 THEN (now() - '2 days'::interval)::date
           ELSE (now() + (i || ' days')::interval)::date END
    );
  END LOOP;

  RAISE NOTICE '10 OS criadas, espalhadas por % etapas ativas, 3 com prazo vencido',
    array_length(v_status, 1);
END $$;

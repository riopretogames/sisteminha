/**
 * Robô da planilha "Metas RPG" → sisteminha (RPG System.IO)
 * ==========================================================
 *
 * O QUE FAZ
 * Toda vez que alguém edita a aba METAS DA LOJA ou a aba CAMPANHAS, este robô
 * lê a planilha e manda os números para o sisteminha. Lá, eles viram as metas
 * que aparecem em Cadastros > Metas e no Dashboard de Metas.
 *
 * A planilha manda; o sisteminha copia. Decisão do Felipe em 23/09/2026.
 *
 * ONDE ESTE ARQUIVO MORA
 * Dentro da própria planilha, em Extensões > Apps Script. A cópia guardada no
 * sisteminha (integracoes/planilha-de-metas/Codigo.gs) é a referência: se um
 * dia precisar reinstalar, é daqui que se copia.
 *
 * COMO INSTALAR (uma vez só) — o passo a passo com figuras está no LEIA-ME.md
 * 1. Na planilha: Extensões > Apps Script.
 * 2. Apague o que estiver lá, cole este arquivo inteiro, salve (Ctrl+S).
 * 3. Volte na planilha e recarregue a página (F5). Aparece o menu "Sisteminha".
 * 4. Sisteminha > Configurar conexão > cole o código de acesso.
 *    (O Google vai pedir autorização na primeira vez — é o robô pedindo
 *    permissão para ler a planilha e falar com o sisteminha.)
 *
 * O QUE ELE LÊ
 * - METAS DA LOJA: procura a linha de cabeçalho que tem "MÊS" e "Bronze", e
 *   acha cada coluna PELO NOME (Bronze, Prata, Ouro, Diamante, Vendedores,
 *   Apuração, Ano passado). Inserir coluna ou linha não quebra nada.
 * - CAMPANHAS: todo bloco que tem cabeçalho "Faixa" + "Meta…" + "Prêmio" vira
 *   uma campanha (hoje: Acessórios e Jogos). Blocos sem meta em reais —
 *   Película e Grip (conta por unidade), Monday, Gerente (suspenso) — ficam de
 *   fora de propósito: o sisteminha ainda não acompanha esses.
 *
 * O CÓDIGO DE ACESSO
 * Fica guardado nas "propriedades do script" (não aparece neste arquivo nem
 * na planilha). Só o menu Configurar conexão escreve nele.
 */

var URL_SISTEMINHA = 'https://ylhxlvqqkifayglqbzre.supabase.co/functions/v1/sincronizar-metas';
var ABA_LOJA = 'METAS DA LOJA';
var ABA_CAMPANHAS = 'CAMPANHAS';
var PROP_CODIGO = 'CODIGO_DE_ACESSO';
var PROP_ULTIMO = 'ULTIMO_ENVIO';
// A planilha foi criada com o fuso de Los Angeles; o horário dos avisos é o da loja.
var FUSO = 'America/Sao_Paulo';

var MESES = ['janeiro', 'fevereiro', 'marco', 'abril', 'maio', 'junho',
             'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
var FAIXAS = ['bronze', 'prata', 'ouro', 'diamante'];


// ─── Menu ────────────────────────────────────────────────────────────────────

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Sisteminha')
    .addItem('Enviar metas agora', 'enviarMetasAgora')
    .addItem('Ver último envio', 'verUltimoEnvio')
    .addSeparator()
    .addItem('Configurar conexão', 'configurarConexao')
    .addToUi();
}

function configurarConexao() {
  var ui = SpreadsheetApp.getUi();
  var resposta = ui.prompt(
    'Conectar ao sisteminha',
    'Cole o código de acesso.\n\nEle está no arquivo ".env.planilha-metas", dentro da pasta ' +
    'do sisteminha no computador da loja (a linha que começa com CODIGO=).',
    ui.ButtonSet.OK_CANCEL
  );
  if (resposta.getSelectedButton() !== ui.Button.OK) return;

  var codigo = resposta.getResponseText().trim().replace(/^CODIGO=/i, '');
  if (!/^[0-9a-f]{64}$/i.test(codigo)) {
    ui.alert('Esse código não parece o certo: ele tem 64 letras e números, sem espaço. ' +
             'Confira se copiou a linha inteira.');
    return;
  }

  PropertiesService.getScriptProperties().setProperty(PROP_CODIGO, codigo);
  instalarGatilhos_();

  var resultado = enviar_('configuração');
  ui.alert(resultado.ok
    ? 'Pronto! A planilha está conectada ao sisteminha e as metas já foram enviadas.\n\n' +
      'Daqui para frente, toda edição nas abas METAS DA LOJA e CAMPANHAS vai sozinha ' +
      'para o sistema. E uma vez por dia, às 6h, o robô reenvia tudo por garantia.'
    : 'A conexão foi salva, mas o primeiro envio falhou:\n\n' + resultado.mensagem);
}

function enviarMetasAgora() {
  var resultado = enviar_('envio manual');
  SpreadsheetApp.getUi().alert(resultado.ok
    ? 'Metas enviadas ao sisteminha ✓'
    : 'Não foi possível enviar:\n\n' + resultado.mensagem);
}

function verUltimoEnvio() {
  var ultimo = PropertiesService.getScriptProperties().getProperty(PROP_ULTIMO);
  SpreadsheetApp.getUi().alert(ultimo || 'Nenhum envio registrado ainda.');
}


// ─── Gatilhos ────────────────────────────────────────────────────────────────

/**
 * Cria os dois gatilhos do robô: um que roda a cada edição e um diário, às 6h.
 *
 * O diário existe por garantia: se um envio falhar (internet caiu, sisteminha
 * fora do ar), no dia seguinte a planilha inteira vai de novo, e ninguém
 * precisa lembrar de reenviar.
 *
 * Apaga antes os gatilhos que já existirem com esses nomes — rodar
 * "Configurar conexão" duas vezes não pode criar envio em dobro.
 */
function instalarGatilhos_() {
  var planilha = SpreadsheetApp.getActive();
  ScriptApp.getProjectTriggers().forEach(function (g) {
    var funcao = g.getHandlerFunction();
    if (funcao === 'aoEditar' || funcao === 'envioDiario') ScriptApp.deleteTrigger(g);
  });
  ScriptApp.newTrigger('aoEditar').forSpreadsheet(planilha).onEdit().create();
  ScriptApp.newTrigger('envioDiario').timeBased().everyDays(1).atHour(6).inTimezone(FUSO).create();
}

function aoEditar(e) {
  // Só as duas abas de onde sai meta disparam envio: editar COMO USAR não
  // precisa acordar o sisteminha.
  try {
    var aba = e && e.range ? e.range.getSheet().getName() : '';
    if (aba !== ABA_LOJA && aba !== ABA_CAMPANHAS) return;
  } catch (erroIgnorado) {
    // Se não deu para saber a aba, envia mesmo assim — é inofensivo.
  }
  var resultado = enviar_('edição na planilha');
  SpreadsheetApp.getActive().toast(
    resultado.ok ? 'Metas enviadas ao sisteminha ✓' : 'Não enviou: ' + resultado.mensagem,
    'Sisteminha',
    resultado.ok ? 5 : 20
  );
}

function envioDiario() {
  enviar_('envio diário');
}


// ─── Envio ───────────────────────────────────────────────────────────────────

function enviar_(motivo) {
  var codigo = PropertiesService.getScriptProperties().getProperty(PROP_CODIGO);
  if (!codigo) {
    return { ok: false, mensagem: 'A conexão ainda não foi configurada. Use o menu Sisteminha > Configurar conexão.' };
  }

  // Duas edições seguidas disparam dois envios; a trava faz o segundo esperar
  // o primeiro terminar, em vez de os dois brigarem.
  var trava = LockService.getScriptLock();
  if (!trava.tryLock(30000)) {
    return registrar_(false, 'Outro envio estava em andamento. Tente de novo em instantes.', motivo);
  }

  try {
    var pedido;
    try {
      pedido = montarPedido_();
    } catch (erroLeitura) {
      return registrar_(false, 'Não consegui ler a planilha: ' + erroLeitura.message, motivo);
    }

    var resposta = UrlFetchApp.fetch(URL_SISTEMINHA, {
      method: 'post',
      contentType: 'application/json',
      headers: { 'x-segredo-metas': codigo },
      payload: JSON.stringify(pedido),
      muteHttpExceptions: true
    });

    var corpo = {};
    try { corpo = JSON.parse(resposta.getContentText()); } catch (erroIgnorado) {}

    if (resposta.getResponseCode() === 200 && corpo.ok) {
      return registrar_(true, 'ok', motivo);
    }
    if (resposta.getResponseCode() === 401) {
      return registrar_(false, 'O sisteminha recusou o código de acesso. Rode de novo o menu ' +
        'Sisteminha > Configurar conexão e cole o código atual.', motivo);
    }
    // As mensagens de recusa do sisteminha já vêm em português e dizem o mês e
    // a faixa com problema ("Em outubro, a faixa Prata é menor que a anterior").
    return registrar_(false, corpo.erro || ('O sisteminha respondeu com erro ' + resposta.getResponseCode() + '.'), motivo);
  } catch (erroConexao) {
    return registrar_(false, 'Não consegui falar com o sisteminha: ' + erroConexao.message, motivo);
  } finally {
    trava.releaseLock();
  }
}

function registrar_(ok, mensagem, motivo) {
  var quando = Utilities.formatDate(new Date(), FUSO, 'dd/MM/yyyy HH:mm');
  PropertiesService.getScriptProperties().setProperty(
    PROP_ULTIMO,
    (ok ? '✓ Enviado' : '✗ Falhou') + ' em ' + quando + ' (' + motivo + ')' + (ok ? '' : '\n\n' + mensagem)
  );
  return { ok: ok, mensagem: mensagem };
}


// ─── Leitura da planilha ─────────────────────────────────────────────────────

function montarPedido_() {
  var planilha = SpreadsheetApp.getActive();

  var abaLoja = planilha.getSheetByName(ABA_LOJA);
  if (!abaLoja) throw new Error('não achei a aba "' + ABA_LOJA + '".');
  var dados = abaLoja.getDataRange().getValues();

  var ano = acharAno_(dados, planilha.getName());
  var cab = acharCabecalhoDaLoja_(dados);

  var meses = [];
  for (var i = cab.linha + 1; i < dados.length; i++) {
    var linha = dados[i];
    var numero = MESES.indexOf(normalizar_(linha[cab.col.mes])) + 1;
    if (!numero) continue; // pula "TOTAL DO ANO", linhas de texto, vazias
    var nomeMes = String(linha[cab.col.mes]).trim();

    var mes = {
      mes: numero,
      vendedores: inteiro_(linha[cab.col.vendedores], nomeMes),
      apuracao: apuracao_(linha[cab.col.apuracao], nomeMes)
    };
    FAIXAS.forEach(function (f) { mes[f] = dinheiro_(linha[cab.col[f]], nomeMes, f); });
    if (cab.col.anoPassado !== undefined) {
      mes.ano_passado = dinheiro_(linha[cab.col.anoPassado], nomeMes, 'ano passado');
    }
    meses.push(mes);
  }

  var abaCampanhas = planilha.getSheetByName(ABA_CAMPANHAS);
  var campanhas = abaCampanhas ? lerCampanhas_(abaCampanhas.getDataRange().getValues()) : [];

  return {
    ano: ano,
    meses: meses,
    campanhas: campanhas,
    planilha: { id: planilha.getId(), nome: planilha.getName(), url: planilha.getUrl() },
    enviado_por: quemEnviou_()
  };
}

/** O ano vem do título da aba ("… — 2026") ou, na falta, do nome da planilha. */
function acharAno_(dados, nomeDaPlanilha) {
  for (var i = 0; i < Math.min(3, dados.length); i++) {
    var achado = String(dados[i].join(' ')).match(/20\d\d/);
    if (achado) return Number(achado[0]);
  }
  var doNome = String(nomeDaPlanilha).match(/20\d\d/);
  if (doNome) return Number(doNome[0]);
  throw new Error('não achei o ano (esperava algo como "2026" no título da aba ou no nome da planilha).');
}

function acharCabecalhoDaLoja_(dados) {
  for (var i = 0; i < dados.length; i++) {
    var celulas = dados[i].map(normalizar_);
    var colMes = celulas.indexOf('mes');
    if (colMes < 0) continue;
    var col = { mes: colMes };
    celulas.forEach(function (c, k) {
      FAIXAS.forEach(function (f) { if (c.indexOf(f) >= 0) col[f] = k; });
      if (c.indexOf('vendedor') >= 0) col.vendedores = k;
      if (c.indexOf('apuracao') >= 0) col.apuracao = k;
      if (c.indexOf('ano passado') >= 0) col.anoPassado = k;
    });
    var faltando = FAIXAS.concat(['vendedores', 'apuracao']).filter(function (n) { return col[n] === undefined; });
    if (faltando.length) {
      throw new Error('na aba "' + ABA_LOJA + '" faltam as colunas: ' + faltando.join(', ') + '.');
    }
    return { linha: i, col: col };
  }
  throw new Error('não achei o cabeçalho (MÊS, Bronze, Prata, Ouro, Diamante…) na aba "' + ABA_LOJA + '".');
}

/**
 * Cada bloco da aba CAMPANHAS com cabeçalho "Faixa" + "Meta…" + "Prêmio" vira
 * uma campanha. O título do bloco (a linha preenchida logo acima do
 * cabeçalho) dá o nome e diz se é por quinzena.
 */
function lerCampanhas_(dados) {
  var campanhas = [];
  for (var i = 0; i < dados.length; i++) {
    var cab = dados[i].map(normalizar_);
    var colFaixa = cab.indexOf('faixa');
    if (colFaixa < 0) continue;
    var colMeta = -1, colPremio = -1;
    cab.forEach(function (c, k) {
      if (colMeta < 0 && /^meta\b/.test(c)) colMeta = k;
      if (colPremio < 0 && c.indexOf('premio') >= 0) colPremio = k;
    });
    if (colMeta < 0 || colPremio < 0) continue; // Gerente (valor fixo), Película e Grip, Monday

    var titulo = '';
    for (var t = i - 1; t >= 0; t--) {
      var texto = String(dados[t][colFaixa] || '').trim();
      if (texto) { titulo = texto; break; }
    }
    var tituloNorm = normalizar_(titulo);
    if (!titulo || tituloNorm.indexOf('suspenso') >= 0) continue;

    var nome = nomeDaCampanha_(titulo);
    var faixas = [];
    for (var k = i + 1; k < dados.length && faixas.length < 4; k++) {
      var celula = normalizar_(dados[k][colFaixa]);
      var faixa = FAIXAS.filter(function (f) { return celula.indexOf(f) >= 0; })[0];
      if (!faixa) break;
      faixas.push({
        faixa: faixa,
        meta: dinheiro_(dados[k][colMeta], nome, faixa),
        premio: dinheiro_(dados[k][colPremio], nome, 'prêmio ' + faixa)
      });
    }
    if (!faixas.length) continue;

    campanhas.push({
      chave: normalizar_(nome).replace(/ /g, '_'),
      nome: nome,
      grupo: nome,
      periodicidade: tituloNorm.indexOf('quinzen') >= 0 ? 'quinzenal'
                   : (/\bmes\b|mensal/.test(tituloNorm) ? 'mensal' : 'quinzenal'),
      faixas: faixas
    });
  }
  return campanhas;
}

/** "🎧 ACESSÓRIOS (por quinzena, por vendedor)" → "Acessórios". */
function nomeDaCampanha_(titulo) {
  var limpo = String(titulo).replace(/\(.*\)/, '').replace(/[^\p{L}\p{N} ]/gu, '').replace(/\s+/g, ' ').trim();
  if (!limpo) return 'Campanha';
  return limpo.charAt(0).toUpperCase() + limpo.slice(1).toLowerCase();
}


// ─── Conversões ──────────────────────────────────────────────────────────────

/** Sem acento, sem emoji, minúsculo: "🥉 Bronze" → "bronze", "MÊS" → "mes". */
function normalizar_(valor) {
  return String(valor === null || valor === undefined ? '' : valor)
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9% ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Valor em reais. Célula vazia = "não vale" (vai como vazio, e o sisteminha
 * apaga aquela faixa). Célula com texto ("R$ 1.500,00" digitado como texto)
 * também é entendida — é o formato brasileiro, ponto de milhar e vírgula.
 */
function dinheiro_(valor, onde, oque) {
  if (valor === null || valor === undefined || valor === '') return null;
  if (typeof valor === 'number') return Math.round(valor * 100) / 100;
  var texto = String(valor).replace(/[^\d,.-]/g, '');
  if (!texto) return null;
  var numero = Number(texto.replace(/\./g, '').replace(',', '.'));
  if (!isFinite(numero)) throw new Error('em ' + onde + ', "' + valor + '" (' + oque + ') não é um valor em reais.');
  return Math.round(numero * 100) / 100;
}

function inteiro_(valor, onde) {
  var numero = typeof valor === 'number' ? valor : Number(String(valor).replace(/[^\d]/g, ''));
  if (valor === '' || valor === null || !isFinite(numero)) {
    throw new Error('em ' + onde + ', o número de vendedores está vazio ou não é número.');
  }
  return Math.round(numero);
}

function apuracao_(valor, onde) {
  var t = normalizar_(valor);
  if (t.indexOf('quinzen') >= 0) return 'quinzenal';
  if (t.indexOf('periodo') >= 0) return 'quatro_periodos';
  throw new Error('em ' + onde + ', a apuração "' + valor + '" não é "Quinzenal" nem "4 períodos".');
}

function quemEnviou_() {
  try {
    return Session.getActiveUser().getEmail() || Session.getEffectiveUser().getEmail() || '';
  } catch (erroIgnorado) {
    return '';
  }
}

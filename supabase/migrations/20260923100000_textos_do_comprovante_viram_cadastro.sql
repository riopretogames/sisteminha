-- =============================================================================
-- Sisteminha (RPG System.IO) — os textos do comprovante saem do código e viram
-- cadastro em Minha Empresa
-- =============================================================================
--
-- Pedido do Felipe em 23/09/2026: "os dados todos eles têm que estar
-- cadastrados na parte da Minha Empresa. O comprovante puxará os dados de lá".
--
-- O QUE ESTAVA ERRADO
--
-- Nome da loja, CNPJ, endereço, telefone e logo já vinham do cadastro. Mas as
-- duas partes MAIS escritas do comprovante não vinham: os oito itens de
-- garantia e a frase de despedida estavam digitados dentro do programa. Na
-- prática isso quer dizer que mudar "90 dias de garantia" para "180 dias"
-- exigia um programador e uma nova publicação do sistema — para um texto que é
-- decisão comercial da loja e muda por conta própria.
--
-- AS DUAS COLUNAS
--
-- `termos_comprovante`  — os itens de garantia, UM POR LINHA. A tela numera
--                         sozinha (1 -, 2 -, 3 -...), então quem escreve não
--                         precisa se preocupar com a numeração nem renumerar
--                         tudo à mão ao apagar um item do meio.
-- `mensagem_comprovante`— a frase de despedida no pé do comprovante.
--
-- O padrão é o texto que já estava no programa, igualzinho: quem não mexer em
-- nada continua imprimindo exatamente o mesmo comprovante de antes.
--
-- Não é migration destrutiva: só acrescenta coluna, com valor de partida.
-- =============================================================================

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS termos_comprovante text
    DEFAULT 'Aparelhos novos possuem 1 ano de garantia pelo fabricante.
Aparelhos da marca Xiaomi possuem 90 dias de garantia.
Aparelhos seminovos possuem 90 dias de garantia com nossa loja.
Não é dada garantia para aparelhos que apresentem sinal de queda, molhado ou riscados.
Não é dada garantia para aparelhos que tenham sido aberto por técnicos terceiros.
Não cobrimos mau uso do usuário.
Cliente declara estar ciente de que a empresa é uma revendedora, e por isto, revende os produtos conforme a fabricante envia.
Cliente declara estar ciente dos termos acima.',
  ADD COLUMN IF NOT EXISTS mensagem_comprovante text
    DEFAULT 'AGRADECEMOS A PREFERÊNCIA, VOLTE SEMPRE!';

-- As lojas que já existem nasceram antes da coluna: recebem o mesmo texto de
-- partida. Só quem ainda está com o campo vazio — mexer aqui em quem já
-- escreveu os próprios termos seria apagar o trabalho da loja.
UPDATE public.tenants
   SET termos_comprovante = COALESCE(termos_comprovante,
         'Aparelhos novos possuem 1 ano de garantia pelo fabricante.
Aparelhos da marca Xiaomi possuem 90 dias de garantia.
Aparelhos seminovos possuem 90 dias de garantia com nossa loja.
Não é dada garantia para aparelhos que apresentem sinal de queda, molhado ou riscados.
Não é dada garantia para aparelhos que tenham sido aberto por técnicos terceiros.
Não cobrimos mau uso do usuário.
Cliente declara estar ciente de que a empresa é uma revendedora, e por isto, revende os produtos conforme a fabricante envia.
Cliente declara estar ciente dos termos acima.'),
       mensagem_comprovante = COALESCE(mensagem_comprovante,
         'AGRADECEMOS A PREFERÊNCIA, VOLTE SEMPRE!')
 WHERE termos_comprovante IS NULL
    OR mensagem_comprovante IS NULL;

COMMENT ON COLUMN public.tenants.termos_comprovante IS
  'Itens de garantia impressos no comprovante, um por linha. A tela numera sozinha.';
COMMENT ON COLUMN public.tenants.mensagem_comprovante IS
  'Frase de despedida no pé do comprovante.';

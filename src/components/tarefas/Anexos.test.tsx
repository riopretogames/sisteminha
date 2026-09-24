import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { renderizarTela, silenciarConsole } from '@/test/apoio';
import { Anexos, type PropsAnexos } from '@/components/tarefas/Anexos';
import type { Anexo } from '@/types/tarefas';

/**
 * Os anexos da tarefa (v2, pedido do Felipe em 24/09: "tem que anexar
 * arquivos").
 *
 * O que estes testes seguram:
 * - foto vira miniatura (com link pedido ao cofre) e o resto vira linha com
 *   ícone, tamanho de gente ("1,2 MB"), quem mandou e quando;
 * - arquivo acima de 20 MB é barrado NO NAVEGADOR, com o aviso em português,
 *   antes de a pessoa esperar o upload inteiro para ouvir "não";
 * - quem não pode anexar não vê botão de anexar; quem não edita só remove o
 *   que ele mesmo enviou — as mesmas portas que o banco dá.
 *
 * O hook de dados (useAnexos) é trocado por um dublê: aqui se testa a tela,
 * e o caminho até o banco já tem teste próprio (useAnexos.test.tsx).
 */

const AGORA = new Date('2026-09-24T10:00:00');

const mocks = vi.hoisted(() => ({
  toast: vi.fn(),
  estado: {
    anexos: [] as Anexo[],
    carregando: false,
    enviando: false,
    enviar: vi.fn(),
    remover: vi.fn(),
    urlDe: vi.fn(),
  },
}));

vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: mocks.toast }), toast: mocks.toast }));
vi.mock('@/hooks/useAnexos', () => ({ useAnexos: () => mocks.estado }));
vi.mock('@/hooks/usePessoasDaLoja', () => ({
  usePessoasDaLoja: () => ({
    data: [
      { id: 'u-felipe', nome: 'Felipe Bottaro', avatar_url: null },
      { id: 'u-pedro', nome: 'Pedro Henrique', avatar_url: null },
    ],
  }),
}));

const FOTO: Anexo = {
  id: 'a-foto',
  tarefa_id: 't1',
  nome: 'vitrine arrumada.jpg',
  caminho: 'loja-1/t1/uuid-1-vitrine-arrumada.jpg',
  tipo: 'image/jpeg',
  tamanho: Math.round(1.2 * 1024 * 1024),
  enviado_por: 'u-pedro',
  created_at: '2026-09-24T09:55:00',
};

const PDF: Anexo = {
  id: 'a-pdf',
  tarefa_id: 't1',
  nome: 'nota-fiscal.pdf',
  caminho: 'loja-1/t1/uuid-2-nota-fiscal.pdf',
  tipo: 'application/pdf',
  tamanho: 820 * 1024,
  enviado_por: 'u-felipe',
  created_at: '2026-09-24T09:30:00',
};

/** Arquivo com o tamanho que o teste quiser, sem alocar os megabytes de verdade. */
function arquivo(nome: string, tamanho: number, tipo = 'image/jpeg'): File {
  const f = new File(['x'], nome, { type: tipo });
  Object.defineProperty(f, 'size', { value: tamanho });
  return f;
}

function abrir(props: Partial<PropsAnexos> = {}, estado: Partial<typeof mocks.estado> = {}) {
  Object.assign(mocks.estado, { anexos: [], carregando: false, enviando: false, ...estado });
  renderizarTela(
    <Anexos tarefaId="t1" podeAnexar podeRemoverQualquer={false} euId="u-felipe" {...props} />,
  );
}

describe('Anexos da tarefa', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    silenciarConsole();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(AGORA);
    mocks.estado.enviar = vi.fn().mockResolvedValue(undefined);
    mocks.estado.remover = vi.fn().mockResolvedValue(undefined);
    mocks.estado.urlDe = vi.fn(async (a: Anexo) => `https://arquivo.falso/${a.caminho}`);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('foto em miniatura (link pedido ao cofre) e PDF em linha, com tamanho, quem enviou e quando', async () => {
    abrir({}, { anexos: [FOTO, PDF] });

    const fotos = screen.getByRole('list', { name: 'Fotos anexadas' });
    const img = await within(fotos).findByRole('img', { name: 'vitrine arrumada.jpg' });
    expect(img).toHaveAttribute('src', 'https://arquivo.falso/loja-1/t1/uuid-1-vitrine-arrumada.jpg');
    expect(img).toHaveAttribute('loading', 'lazy');
    expect(mocks.estado.urlDe).toHaveBeenCalledWith(FOTO);
    expect(within(fotos).getByText('1,2 MB · Pedro Henrique')).toBeInTheDocument();

    // O PDF não vira miniatura: linha com ícone, e "você" quando fui eu.
    const arquivos = screen.getByRole('list', { name: 'Arquivos anexados' });
    expect(within(arquivos).getByText('nota-fiscal.pdf')).toBeInTheDocument();
    expect(within(arquivos).getByText('PDF · 820 KB · você · há 30 min')).toBeInTheDocument();
    expect(within(arquivos).queryByRole('img')).not.toBeInTheDocument();
    expect(mocks.estado.urlDe).not.toHaveBeenCalledWith(PDF);
  });

  it('link vencido (ficha aberta há mais de 10 min): pede um link novo uma vez antes de desistir', async () => {
    mocks.estado.urlDe = vi
      .fn()
      .mockResolvedValueOnce('https://arquivo.falso/link-velho')
      .mockResolvedValueOnce('https://arquivo.falso/link-novo')
      .mockResolvedValue('https://arquivo.falso/link-mais-novo');
    abrir({}, { anexos: [FOTO] });

    const fotos = screen.getByRole('list', { name: 'Fotos anexadas' });
    const img = await within(fotos).findByRole('img', { name: 'vitrine arrumada.jpg' });
    expect(img).toHaveAttribute('src', 'https://arquivo.falso/link-velho');

    fireEvent.error(img);
    await waitFor(() => expect(img).toHaveAttribute('src', 'https://arquivo.falso/link-novo'));
    expect(within(fotos).queryByText('Sem prévia')).not.toBeInTheDocument();

    // O link novo também falhou: aí sim o arquivo não tem prévia.
    fireEvent.error(img);
    expect(await within(fotos).findByText('Sem prévia')).toBeInTheDocument();
    expect(mocks.estado.urlDe).toHaveBeenCalledTimes(2);
  });

  it('sem poder anexar: nada de botão nem de área de arrastar', () => {
    abrir({ podeAnexar: false });

    expect(screen.getByText('Nenhum arquivo anexado.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /anexar arquivo/i })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Escolher arquivos para anexar')).not.toBeInTheDocument();
    expect(screen.queryByText(/arraste/i)).not.toBeInTheDocument();
  });

  it('podendo anexar e sem nada ainda: convida a arrastar ou escolher', () => {
    abrir();
    expect(screen.getByText('Arraste fotos e arquivos para cá')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Anexar arquivo' })).toBeInTheDocument();
    expect(screen.getByText(/até 20 MB cada/)).toBeInTheDocument();
  });

  it('arquivo acima de 20 MB: avisa em português e NÃO envia', () => {
    abrir();

    fireEvent.change(screen.getByLabelText('Escolher arquivos para anexar'), {
      target: { files: [arquivo('video-da-bancada.mp4', 25 * 1024 * 1024, 'video/mp4')] },
    });

    expect(mocks.estado.enviar).not.toHaveBeenCalled();
    expect(mocks.toast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: '"video-da-bancada.mp4" não foi anexado',
        description: expect.stringContaining('Arquivo grande demais: o limite é 20 MB'),
        variant: 'destructive',
      }),
    );
  });

  it('no meio de vários, os que cabem seguem e o grande fica de fora', () => {
    abrir();
    const pequeno = arquivo('balcao.jpg', 300 * 1024);
    const grande = arquivo('video.mp4', 21 * 1024 * 1024, 'video/mp4');

    fireEvent.change(screen.getByLabelText('Escolher arquivos para anexar'), {
      target: { files: [pequeno, grande] },
    });

    expect(mocks.estado.enviar).toHaveBeenCalledWith([pequeno]);
    expect(mocks.toast).toHaveBeenCalledWith(
      expect.objectContaining({ description: expect.stringContaining('Arquivo grande demais: o limite é 20 MB') }),
    );
  });

  it('arrastar um arquivo para a área mostra "Solte para anexar", e soltar envia', () => {
    abrir();
    const area = screen.getByTestId('area-de-anexos');
    const foto = arquivo('prateleira.png', 500 * 1024, 'image/png');

    fireEvent.dragOver(area, { dataTransfer: { types: ['Files'], files: [foto], dropEffect: 'none' } });
    expect(screen.getByText('Solte para anexar')).toBeInTheDocument();

    fireEvent.drop(area, { dataTransfer: { types: ['Files'], files: [foto] } });
    expect(mocks.estado.enviar).toHaveBeenCalledWith([foto]);
    expect(screen.queryByText('Solte para anexar')).not.toBeInTheDocument();
  });

  it('enviando: o botão avisa e não deixa mandar de novo no meio', () => {
    abrir({}, { anexos: [PDF], enviando: true });
    expect(screen.getByRole('button', { name: /Enviando/ })).toBeDisabled();
    expect(screen.getByText(/pode continuar mexendo na tarefa/)).toBeInTheDocument();
  });

  it('sem tasks.edit: remove só o que a própria pessoa enviou, e pede confirmação', async () => {
    abrir({ podeRemoverQualquer: false, euId: 'u-felipe' }, { anexos: [FOTO, PDF] });

    // A foto é do Pedro: o banco recusaria, então a tela nem oferece.
    expect(screen.queryByRole('button', { name: 'Remover vitrine arrumada.jpg' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Remover nota-fiscal.pdf' }));
    const confirmacao = await screen.findByRole('alertdialog');
    expect(within(confirmacao).getByText(/não tem como trazer de volta/)).toBeInTheDocument();
    expect(mocks.estado.remover).not.toHaveBeenCalled();

    fireEvent.click(within(confirmacao).getByRole('button', { name: 'Remover anexo' }));
    expect(mocks.estado.remover).toHaveBeenCalledWith(PDF);
  });

  it('com tasks.edit: remove o anexo de qualquer um', () => {
    abrir({ podeRemoverQualquer: true }, { anexos: [FOTO, PDF] });
    expect(screen.getByRole('button', { name: 'Remover vitrine arrumada.jpg' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remover nota-fiscal.pdf' })).toBeInTheDocument();
  });

  it('"Abrir" pede o link na hora do clique e abre numa aba nova', async () => {
    const janela = { location: { href: '' }, opener: {} as unknown, close: vi.fn() };
    const abrirJanela = vi.spyOn(window, 'open').mockReturnValue(janela as unknown as Window);
    abrir({}, { anexos: [PDF] });

    fireEvent.click(screen.getByRole('button', { name: 'Abrir nota-fiscal.pdf' }));

    // A aba abre no clique (antes da espera), senão o navegador bloqueia.
    expect(abrirJanela).toHaveBeenCalledWith('', '_blank');
    await waitFor(() => expect(janela.location.href).toBe('https://arquivo.falso/loja-1/t1/uuid-2-nota-fiscal.pdf'));
    expect(janela.opener).toBeNull();
    expect(mocks.estado.urlDe).toHaveBeenCalledWith(PDF);
  });

  it('se o link não vier, fecha a aba vazia e avisa', async () => {
    const janela = { location: { href: '' }, opener: null, close: vi.fn() };
    vi.spyOn(window, 'open').mockReturnValue(janela as unknown as Window);
    mocks.estado.urlDe = vi.fn().mockResolvedValue(null);
    abrir({}, { anexos: [PDF] });

    fireEvent.click(screen.getByRole('button', { name: 'Abrir nota-fiscal.pdf' }));

    await waitFor(() => expect(janela.close).toHaveBeenCalled());
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Não foi possível abrir o arquivo' }));
  });

  it('foto que não dá para mostrar (HEIC do iPhone) vira linha com ícone, não miniatura quebrada', () => {
    abrir({}, { anexos: [{ ...FOTO, id: 'a-heic', nome: 'IMG_0001.HEIC', tipo: 'image/heic' }] });
    expect(screen.queryByRole('list', { name: 'Fotos anexadas' })).not.toBeInTheDocument();
    expect(within(screen.getByRole('list', { name: 'Arquivos anexados' })).getByText('IMG_0001.HEIC')).toBeInTheDocument();
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { bancoFalso, silenciarConsole } from '@/test/apoio';
import { LIMITE_DO_ANEXO } from '@/lib/tarefas';
import type { Anexo } from '@/types/tarefas';
import { avisoDoEnvio, useAnexos } from './useAnexos';

/**
 * Os anexos da tarefa (v2). O que estes testes seguram:
 * - arquivo acima de 20 MB é barrado ANTES de subir, com frase leiga;
 * - o caminho no bucket começa pela loja e leva o nome limpo (é o que a
 *   regra do Storage confere);
 * - a ficha do anexo vai sem tenant_id e sem enviado_por (o banco carimba);
 * - se a ficha não gravar, o arquivo que subiu é apagado do bucket;
 * - remover que o banco barrou em silêncio (zero linhas) NÃO apaga o arquivo.
 */

const mockToast = vi.fn();
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: mockToast }), toast: vi.fn() }));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'u-pedro', profile: { id: 'u-pedro', nome: 'Pedro', tenant_id: 'loja-1' } },
    can: () => true,
  }),
}));

const mockSupabase = vi.hoisted(() => ({ atual: null as unknown }));
vi.mock('@/integrations/supabase/client', () => ({
  get supabase() {
    return mockSupabase.atual;
  },
}));

const ANEXO: Anexo = {
  id: 'a1',
  tarefa_id: 't1',
  nome: 'vitrine.jpg',
  caminho: 'loja-1/t1/x-vitrine.jpg',
  tipo: 'image/jpeg',
  tamanho: 1000,
  enviado_por: 'u-pedro',
  created_at: '2026-09-24T10:00:00Z',
};

/** Banco falso com o Storage espionado e a gravação da ficha controlável. */
function montar(opcoes: { insertFalha?: boolean; deleteApaga?: boolean; erroUpload?: unknown } = {}) {
  const banco = bancoFalso({ tarefas_anexos: [ANEXO] });
  const upload = vi.fn((caminho: string) =>
    Promise.resolve(opcoes.erroUpload ? { data: null, error: opcoes.erroUpload } : { data: { path: caminho }, error: null }),
  );
  const remove = vi.fn(() => Promise.resolve({ data: [], error: null }));
  const createSignedUrl = vi.fn((caminho: string) =>
    Promise.resolve({ data: { signedUrl: `https://assinado/${caminho}` }, error: null }),
  );
  const insert = vi.fn(() =>
    Promise.resolve({ data: null, error: opcoes.insertFalha ? { message: 'new row violates row-level security policy' } : null }),
  );
  const del = vi.fn(() => ({
    eq: () => ({
      select: () => Promise.resolve({ data: opcoes.deleteApaga === false ? [] : [{ id: 'a1' }], error: null }),
    }),
  }));
  mockSupabase.atual = {
    ...banco,
    from: (tabela: string) => {
      const consulta = banco.from(tabela) as Record<string, unknown>;
      if (tabela !== 'tarefas_anexos') return consulta;
      return { ...consulta, insert, delete: del };
    },
    storage: { from: () => ({ upload, remove, createSignedUrl }) },
  };
  const cliente = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={cliente}>{children}</QueryClientProvider>
  );
  const r = renderHook(() => useAnexos('t1'), { wrapper });
  return { ...r, upload, remove, insert, createSignedUrl };
}

const arquivo = (nome: string, tamanho: number, tipo = 'image/jpeg') => {
  const f = new File(['x'], nome, { type: tipo });
  Object.defineProperty(f, 'size', { value: tamanho });
  return f;
};

describe('useAnexos', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    silenciarConsole();
  });

  it('lista os anexos da tarefa', async () => {
    const { result } = montar();
    await waitFor(() => expect(result.current.anexos).toHaveLength(1));
    expect(result.current.anexos[0].nome).toBe('vitrine.jpg');
  });

  it('arquivo acima de 20 MB não sobe e o aviso diz o limite', async () => {
    const { result, upload } = montar();
    await act(() => result.current.enviar([arquivo('video.mp4', LIMITE_DO_ANEXO + 1, 'video/mp4')]));
    expect(upload).not.toHaveBeenCalled();
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ description: expect.stringContaining('Arquivo grande demais: o limite é 20 MB') }),
    );
  });

  it('sobe no caminho da loja com o nome limpo e grava a ficha sem tenant nem autor', async () => {
    const { result, upload, insert } = montar();
    await act(() => result.current.enviar([arquivo('Foto da vitrine.JPG', 2048)]));

    expect(upload).toHaveBeenCalledTimes(1);
    const caminho = upload.mock.calls[0][0] as string;
    expect(caminho).toMatch(/^loja-1\/t1\/.+-Foto-da-vitrine\.JPG$/);

    expect(insert).toHaveBeenCalledWith({
      tarefa_id: 't1',
      nome: 'Foto da vitrine.JPG',
      caminho,
      tipo: 'image/jpeg',
      tamanho: 2048,
    });
    expect(result.current.enviando).toBe(false);
  });

  it('ficha recusada: o arquivo que subiu é apagado do bucket e o aviso sai leigo', async () => {
    const { result, upload, remove } = montar({ insertFalha: true });
    await act(() => result.current.enviar([arquivo('nota.pdf', 100, 'application/pdf')]));
    expect(upload).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledWith([upload.mock.calls[0][0]]);
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ description: 'Seu perfil de acesso não permite isso.' }),
    );
  });

  it('remover apaga a ficha e depois o arquivo', async () => {
    const { result, remove } = montar();
    await waitFor(() => expect(result.current.anexos).toHaveLength(1));
    await act(() => result.current.remover(ANEXO));
    expect(remove).toHaveBeenCalledWith([ANEXO.caminho]);
  });

  it('remover barrado em silêncio (zero linhas) NÃO apaga o arquivo e avisa', async () => {
    const { result, remove } = montar({ deleteApaga: false });
    await waitFor(() => expect(result.current.anexos).toHaveLength(1));
    await act(() => result.current.remover(ANEXO));
    expect(remove).not.toHaveBeenCalled();
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Não foi possível remover o anexo', variant: 'destructive' }),
    );
  });

  it('envio recusado pelo cofre: o aviso sai em português, nunca o inglês do servidor', async () => {
    // O erro do Storage não traz `code`, só o número da resposta.
    const { result, insert } = montar({
      erroUpload: { name: 'StorageApiError', message: 'The object exceeded the maximum allowed size', statusCode: '413' },
    });
    await act(() => result.current.enviar([arquivo('video.mp4', 100, 'video/mp4')]));
    expect(insert).not.toHaveBeenCalled();
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ title: '"video.mp4" não foi anexado', description: 'Arquivo grande demais: o limite é 20 MB.' }),
    );
  });

  it('urlDe devolve o link assinado de 10 minutos', async () => {
    const { result, createSignedUrl } = montar();
    await expect(result.current.urlDe(ANEXO)).resolves.toBe(`https://assinado/${ANEXO.caminho}`);
    expect(createSignedUrl).toHaveBeenCalledWith(ANEXO.caminho, 600);
  });
});

describe('avisoDoEnvio', () => {
  it('traduz pelo número da resposta, já que o erro do cofre não traz código', () => {
    expect(avisoDoEnvio({ message: 'The object exceeded the maximum allowed size', statusCode: '413' })).toBe(
      'Arquivo grande demais: o limite é 20 MB.',
    );
    expect(avisoDoEnvio({ message: 'new row violates row-level security policy', statusCode: '403' })).toBe(
      'Seu perfil de acesso não permite isso.',
    );
    expect(avisoDoEnvio({ message: 'Forbidden', statusCode: '403' })).toBe('Seu perfil de acesso não permite isso.');
    expect(avisoDoEnvio({ message: 'Unauthorized', status: 401 })).toBe('Sua sessão expirou. Entre de novo no sistema.');
    expect(avisoDoEnvio(new TypeError('Failed to fetch'))).toBe(
      'Sem conexão com o sistema. Confira a internet e tente de novo.',
    );
  });

  it('o que não reconhece vira frase genérica, nunca o inglês cru', () => {
    for (const erro of [
      { message: 'Internal Server Error', statusCode: '500' },
      { message: 'Bad Gateway', statusCode: '502' },
      { message: 'Something odd' },
    ]) {
      expect(avisoDoEnvio(erro)).toBe('Não foi possível enviar o arquivo. Tente de novo; se continuar, avise o Felipe.');
    }
  });
});

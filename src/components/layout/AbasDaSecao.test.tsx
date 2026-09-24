import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { montarCan, silenciarConsole } from '@/test/apoio';
import { AbasDaSecao } from './AbasDaSecao';

/**
 * A barra de botões da seção (Cadastros, Tarefas).
 *
 * O que importa é o botão aceso dizer onde a pessoa está. Dentro de um quadro
 * de tarefas (/tarefas/<id>) nenhum botão tem aquele endereço exato, e a
 * barra ficava toda apagada; e em Importação de Clientes acendiam dois botões
 * ao mesmo tempo. A regra agora é uma só: acende o caminho mais específico
 * que contém o endereço atual.
 */

const mockCan = vi.fn();
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'u1' }, can: (p: string) => mockCan(p) }),
}));

function abrirEm(caminho: string, secaoId: string) {
  render(
    <MemoryRouter initialEntries={[caminho]}>
      <AbasDaSecao secaoId={secaoId} />
    </MemoryRouter>,
  );
}

/** Os botões acesos (a barra usa a cor principal no botão marcado). */
const acesos = () =>
  screen
    .getAllByRole('link')
    .filter((a) => a.className.includes('bg-primary'))
    .map((a) => a.textContent);

describe('Barra de botões da seção', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    silenciarConsole();
    mockCan.mockImplementation(montarCan({ perfil: 'administrador' }));
  });

  it('dentro de um quadro de tarefas, acende "Quadros"', () => {
    abrirEm('/tarefas/7f1c-quadro-da-loja', 'tarefas');
    expect(acesos()).toEqual(['Quadros']);
  });

  it('em Minhas Tarefas, acende só "Minhas Tarefas" (e não Quadros junto)', () => {
    abrirEm('/tarefas/minhas', 'tarefas');
    expect(acesos()).toEqual(['Minhas Tarefas']);
  });

  it('na lista de quadros, acende "Quadros"', () => {
    abrirEm('/tarefas', 'tarefas');
    expect(acesos()).toEqual(['Quadros']);
  });

  it('em Importação de Clientes, acende só ela — não Clientes junto', () => {
    abrirEm('/cadastros/clientes/importar', 'cadastros');
    expect(acesos()).toEqual(['Importação de Clientes']);
  });

  it('na visão geral de Cadastros, acende só a visão geral', () => {
    abrirEm('/cadastros', 'cadastros');
    expect(acesos()).toHaveLength(1);
  });

  it('o Vendedor vê os dois botões de Tarefas (a equipe inteira usa)', () => {
    mockCan.mockImplementation(montarCan({ perfil: 'vendedor' }));
    abrirEm('/tarefas/minhas', 'tarefas');
    expect(screen.getByRole('link', { name: /Minhas Tarefas/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Quadros/ })).toBeInTheDocument();
  });
});

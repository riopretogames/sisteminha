import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { FiltrosTarefas } from '@/components/tarefas/FiltrosTarefas';
import { FILTROS_TAREFAS_VAZIO, type FiltrosTarefasValores } from '@/types/tarefas';

/**
 * A barra de filtros do quadro. Os chips de dia são as abas do Monday; o
 * filtro de pessoa tem que listar o CADASTRO inteiro, inclusive quem ainda
 * não tem tarefa nenhuma (a lição da Luana).
 */

const HOJE = new Date('2026-09-23T10:00:00'); // quarta-feira

const PESSOAS = [
  { id: 'u-pedro', nome: 'Pedro Henrique', avatar_url: null },
  // Recém-contratada, sem tarefa nenhuma ainda.
  { id: 'u-luana', nome: 'Luana', avatar_url: null },
];

function abrir(valores: Partial<FiltrosTarefasValores> = {}, resultados?: number) {
  const onChange = vi.fn();
  render(
    <FiltrosTarefas
      valores={{ ...FILTROS_TAREFAS_VAZIO, ...valores }}
      onChange={onChange}
      pessoas={PESSOAS}
      etiquetas={[{ id: 'e1', descricao: 'Rotina', cor: 'bg-emerald-500 text-white' }]}
      resultados={resultados}
    />,
  );
  return onChange;
}

describe('Filtros do quadro', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(HOJE);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('os chips de dia trocam o dia do filtro', () => {
    const onChange = abrir();
    fireEvent.click(screen.getByRole('button', { name: 'Hoje' }));
    expect(onChange).toHaveBeenLastCalledWith({ ...FILTROS_TAREFAS_VAZIO, dia: 'hoje' });

    fireEvent.click(screen.getByRole('button', { name: /^Sex/ }));
    expect(onChange).toHaveBeenLastCalledWith({ ...FILTROS_TAREFAS_VAZIO, dia: 5 });
  });

  it('vai de Seg a Sáb: Domingo não tem chip (ninguém trabalha)', () => {
    abrir();
    expect(screen.getByRole('button', { name: /^Seg/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Sáb/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Dom/ })).not.toBeInTheDocument();
  });

  it('o chip ativo fica marcado, e o dia de hoje é identificado', () => {
    abrir({ dia: 3 });
    expect(screen.getByRole('button', { name: /^Qua/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Todas' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: /^Qua/ })).toHaveAttribute('title', 'Quarta (hoje)');
  });

  it('"Limpar filtros" só aparece com filtro, e volta tudo ao começo', () => {
    abrir();
    expect(screen.queryByRole('button', { name: /limpar filtros/i })).not.toBeInTheDocument();

    const onChange = abrir({ busca: 'caixa', dia: 'hoje' });
    fireEvent.click(screen.getByRole('button', { name: /limpar filtros/i }));
    expect(onChange).toHaveBeenCalledWith(FILTROS_TAREFAS_VAZIO);
  });

  it('o filtro de pessoa lista o cadastro, inclusive quem ainda não tem tarefa', async () => {
    abrir();
    fireEvent.keyDown(screen.getByRole('combobox', { name: 'Filtrar por pessoa' }), { key: 'ArrowDown' });
    const nomes = (await screen.findAllByRole('option')).map((o) => o.textContent);
    expect(nomes.some((n) => n?.includes('Luana'))).toBe(true);
  });

  it('o filtro de status oferece "Atrasada", que não existe no banco', async () => {
    const onChange = abrir();
    fireEvent.keyDown(screen.getByRole('combobox', { name: 'Filtrar por status' }), { key: 'ArrowDown' });
    const atrasada = (await screen.findAllByRole('option')).find((o) => o.textContent === 'Atrasada');
    fireEvent.click(atrasada!);
    expect(onChange).toHaveBeenCalledWith({ ...FILTROS_TAREFAS_VAZIO, status: 'atrasada' });
  });

  it('mostra quantas tarefas passaram no filtro', () => {
    abrir({}, 12);
    expect(screen.getByText('12').parentElement).toHaveTextContent('12 tarefas');
  });
});

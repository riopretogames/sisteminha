import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { NovoQuadroDialog } from '@/components/tarefas/NovoQuadroDialog';
import type { DadosNovoQuadro } from '@/types/tarefas';

/**
 * O "Novo quadro". O que importa aqui é o que chega em `onCriar`: renomear
 * uma lista não pode descolar as tarefas dela, e tirar uma lista tem que tirar
 * as tarefas dela junto — senão o quadro nasce com cartão na coluna errada.
 */

function abrir(onCriar = vi.fn().mockResolvedValue('q-novo'), extras: { modeloInicial?: 'loja' } = {}) {
  const onClose = vi.fn();
  render(<NovoQuadroDialog aberto onClose={onClose} onCriar={onCriar} {...extras} />);
  return { onCriar, onClose };
}

const dadosEnviados = (onCriar: ReturnType<typeof vi.fn>) => onCriar.mock.calls[0][0] as DadosNovoQuadro;

describe('Novo quadro', () => {
  it('oferece os três modelos com o tamanho de cada um', () => {
    abrir();
    const dialogo = screen.getByRole('dialog');
    expect(within(dialogo).getByRole('button', { name: /modelo Em branco/ })).toHaveTextContent('3 colunas · sem tarefas');
    expect(within(dialogo).getByRole('button', { name: /modelo Loja/ })).toHaveTextContent('5 colunas · 43 tarefas');
    expect(within(dialogo).getByRole('button', { name: /modelo Assistência/ })).toHaveTextContent('6 colunas · 22 tarefas');
  });

  it('cria a Loja com a lista renomeada, sem descolar as tarefas dela', async () => {
    const { onCriar, onClose } = abrir();
    fireEvent.click(screen.getByRole('button', { name: /modelo Loja/ }));

    expect(screen.getByLabelText('Nome do quadro')).toHaveValue('Loja');
    fireEvent.change(screen.getByLabelText('Nome da coluna 1'), { target: { value: 'Pedro' } });
    fireEvent.click(screen.getByRole('button', { name: 'Criar quadro' }));

    await waitFor(() => expect(onCriar).toHaveBeenCalledTimes(1));
    const dados = dadosEnviados(onCriar);
    expect(dados.nome).toBe('Loja');
    expect(dados.cor).toBe('bg-blue-500 text-white');
    expect(dados.listas[0].nome).toBe('Pedro');
    expect(dados.tarefas).toHaveLength(43);
    expect(dados.tarefas.filter((t) => t.lista === 0)).toHaveLength(11);
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('tirar uma lista tira as tarefas dela; lista nova nasce vazia', async () => {
    const { onCriar } = abrir();
    fireEvent.click(screen.getByRole('button', { name: /modelo Loja/ }));

    fireEvent.click(screen.getByRole('button', { name: 'Remover a coluna Vendedor sênior' }));
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar coluna' }));
    fireEvent.change(screen.getByLabelText('Nome da coluna 5'), { target: { value: 'Marketing' } });
    fireEvent.click(screen.getByRole('button', { name: 'Criar quadro' }));

    await waitFor(() => expect(onCriar).toHaveBeenCalledTimes(1));
    const dados = dadosEnviados(onCriar);
    expect(dados.listas.map((l) => l.nome)).toEqual(['Vendedor júnior', 'Gerente', 'Dono', 'Anúncios OLX', 'Marketing']);
    expect(dados.tarefas).toHaveLength(43 - 11);
    // "Conferência do caixa" era da lista 2 (Gerente); agora o Gerente é a 1.
    expect(dados.tarefas.find((t) => t.titulo === 'Conferência do caixa')!.lista).toBe(1);
    expect(dados.tarefas.some((t) => t.lista === 4)).toBe(false);
  });

  it('tirou a lista sem querer: "Desfazer" devolve a lista e as tarefas dela, no mesmo lugar', async () => {
    const { onCriar } = abrir();
    fireEvent.click(screen.getByRole('button', { name: /modelo Loja/ }));

    fireEvent.click(screen.getByRole('button', { name: 'Remover a coluna Vendedor sênior' }));
    expect(screen.getByText(/removida com 11 tarefas/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Desfazer' }));
    fireEvent.click(screen.getByRole('button', { name: 'Criar quadro' }));

    await waitFor(() => expect(onCriar).toHaveBeenCalledTimes(1));
    const dados = dadosEnviados(onCriar);
    expect(dados.listas[0].nome).toBe('Vendedor sênior');
    expect(dados.tarefas).toHaveLength(43);
  });

  it('o quadro em branco só cria depois de ter nome', () => {
    abrir();
    fireEvent.click(screen.getByRole('button', { name: /modelo Em branco/ }));

    const criar = screen.getByRole('button', { name: 'Criar quadro' });
    expect(criar).toBeDisabled();
    expect(screen.getByText(/dê um nome ao quadro/i)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Nome do quadro'), { target: { value: 'Limpeza' } });
    expect(criar).not.toBeDisabled();
  });

  it('lista sem nome trava a criação, com o motivo escrito', () => {
    abrir(undefined, { modeloInicial: 'loja' });
    fireEvent.change(screen.getByLabelText('Nome da coluna 2'), { target: { value: '   ' } });
    expect(screen.getByRole('button', { name: 'Criar quadro' })).toBeDisabled();
    expect(screen.getByText(/dê um nome para cada coluna/i)).toBeInTheDocument();
  });

  it('se a gravação falhar, a ficha continua aberta com o que foi escrito', async () => {
    const onCriar = vi.fn().mockRejectedValue(new Error('sem conexão'));
    const { onClose } = abrir(onCriar, { modeloInicial: 'loja' });
    fireEvent.change(screen.getByLabelText('Nome do quadro'), { target: { value: 'Loja Centro' } });
    fireEvent.click(screen.getByRole('button', { name: 'Criar quadro' }));

    await waitFor(() => expect(onCriar).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByRole('button', { name: 'Criar quadro' })).not.toBeDisabled());
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Nome do quadro')).toHaveValue('Loja Centro');
  });
});

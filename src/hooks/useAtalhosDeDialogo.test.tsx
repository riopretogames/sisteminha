import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { useAtalhosDeDialogo } from './useAtalhosDeDialogo';
import { Dialog, DialogContent } from '@/components/ui/dialog';

/**
 * O atalho Enter, com o diálogo abrindo DEPOIS do componente montar.
 *
 * Este teste existe por causa de um defeito que passou pela revisão da tela e
 * pelo `npm run check`: a primeira versão do hook lia o elemento uma vez, no
 * mount, e desistia se ele ainda não existisse. Nos diálogos escritos como
 * `<Dialog open={estado}>` — que são a maioria — o conteúdo só entra no DOM
 * quando a pessoa abre, e aí o efeito já tinha desistido.
 *
 * O atalho ficava morto em 5 das 7 telas, e nada denunciava: não há erro, não
 * há aviso no console. A tecla simplesmente não fazia nada, e quem estivesse
 * usando concluiria que "o Enter não funciona neste sistema".
 */

const confirmar = vi.fn();

/** Um diálogo como os do sistema: montado fechado, aberto por um botão. */
function TelaDeTeste({ podeConfirmar = true }: { podeConfirmar?: boolean }) {
  const [aberto, setAberto] = useState(false);
  const refAtalhos = useAtalhosDeDialogo({ podeConfirmar, onConfirmar: confirmar });

  return (
    <>
      <button onClick={() => setAberto(true)}>Abrir</button>
      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent ref={refAtalhos}>
          <input aria-label="nome" />
          <textarea aria-label="observacao" />
          <button>Salvar</button>
        </DialogContent>
      </Dialog>
    </>
  );
}

const campo = () => screen.getByLabelText('nome');

describe('Enter em diálogo que abre depois', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('confirma mesmo o diálogo tendo montado FECHADO — era o defeito', async () => {
    render(<TelaDeTeste />);
    // Antes de abrir, o conteúdo nem existe no DOM.
    expect(screen.queryByLabelText('nome')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('Abrir'));
    fireEvent.keyDown(await screen.findByLabelText('nome'), { key: 'Enter' });

    expect(confirmar).toHaveBeenCalledTimes(1);
  });

  it('continua funcionando se o diálogo for fechado e aberto de novo', async () => {
    render(<TelaDeTeste />);
    fireEvent.click(screen.getByText('Abrir'));
    fireEvent.keyDown(await screen.findByLabelText('nome'), { key: 'Enter' });
    expect(confirmar).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(document.body, { key: 'Escape' });
    fireEvent.click(screen.getByText('Abrir'));
    fireEvent.keyDown(await screen.findByLabelText('nome'), { key: 'Enter' });
    expect(confirmar).toHaveBeenCalledTimes(2);
  });

  it('NÃO confirma dentro de texto de várias linhas', async () => {
    render(<TelaDeTeste />);
    fireEvent.click(screen.getByText('Abrir'));
    fireEvent.keyDown(await screen.findByLabelText('observacao'), { key: 'Enter' });
    expect(confirmar).not.toHaveBeenCalled();
  });

  it('NÃO confirma com o botão de salvar desabilitado', async () => {
    render(<TelaDeTeste podeConfirmar={false} />);
    fireEvent.click(screen.getByText('Abrir'));
    fireEvent.keyDown(await screen.findByLabelText('nome'), { key: 'Enter' });
    expect(confirmar).not.toHaveBeenCalled();
  });

  it('NÃO confirma com Shift+Enter — ali é quebra de linha', async () => {
    render(<TelaDeTeste />);
    fireEvent.click(screen.getByText('Abrir'));
    fireEvent.keyDown(campo(), { key: 'Enter', shiftKey: true });
    expect(confirmar).not.toHaveBeenCalled();
  });

  it('NÃO confirma com a tecla segurada (repeat)', async () => {
    render(<TelaDeTeste />);
    fireEvent.click(screen.getByText('Abrir'));
    fireEvent.keyDown(campo(), { key: 'Enter', repeat: true });
    expect(confirmar).not.toHaveBeenCalled();
  });
});

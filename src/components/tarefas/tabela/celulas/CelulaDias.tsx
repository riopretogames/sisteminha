import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ChipDia } from '@/components/tarefas/ChipDia';
import { SeletorDias } from '@/components/tarefas/SeletorDias';
import { descreverDias } from '@/lib/tarefas';
import type { AcoesDoQuadro, Tarefa } from '@/types/tarefas';

const mesmosDias = (a: number[], b: number[]) =>
  [...a].sort((x, y) => x - y).join(',') === [...b].sort((x, y) => x - y).join(',');

/**
 * Frequência: os chips de dia com as cores do Trello. Clicar abre a escolha
 * dos dias.
 *
 * A escolha é gravada ao FECHAR o seletor, não a cada clique: quem troca
 * "Seg e Sex" por "Ter e Qui" passa por quatro estados no meio do caminho, e
 * gravar cada um deixaria a tarefa sumindo e voltando do filtro "Hoje" de quem
 * está olhando o mesmo quadro. Clicar fora também salva; só o Esc desiste.
 */
export function CelulaDias({
  tarefa,
  podeEditar,
  acoes,
}: {
  tarefa: Tarefa;
  podeEditar: boolean;
  acoes: Pick<AcoesDoQuadro, 'atualizarTarefa'>;
}) {
  const [aberto, setAberto] = useState(false);
  const [rascunho, setRascunho] = useState<number[]>(tarefa.dias_semana);
  // O Esc chega antes do "fechar", no mesmo evento. O aviso vai por ref
  // porque um estado só mudaria depois que o fechar já tivesse gravado.
  const desistiu = useRef(false);

  const conteudo =
    tarefa.dias_semana.length > 0 ? (
      <ChipDia dias={tarefa.dias_semana} compacto />
    ) : (
      <span className="text-xs text-muted-foreground">Avulsa</span>
    );

  if (!podeEditar) {
    return (
      <div className="flex h-10 items-center justify-center px-2" title={descreverDias(tarefa.dias_semana)}>
        {conteudo}
      </div>
    );
  }

  const aoAbrirOuFechar = (abrir: boolean) => {
    if (abrir) {
      desistiu.current = false;
      setRascunho(tarefa.dias_semana);
    } else if (desistiu.current) {
      desistiu.current = false;
    } else if (!mesmosDias(rascunho, tarefa.dias_semana)) {
      acoes.atualizarTarefa({ id: tarefa.id, dias_semana: rascunho });
    }
    setAberto(abrir);
  };

  return (
    <Popover open={aberto} onOpenChange={aoAbrirOuFechar}>
      <PopoverTrigger asChild>
        <button
          type="button"
          title={`${descreverDias(tarefa.dias_semana)} — clique para mudar os dias`}
          className="flex h-10 w-full items-center justify-center px-2 transition-colors hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
        >
          {conteudo}
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-auto max-w-[26rem] p-3"
        align="center"
        onEscapeKeyDown={() => {
          desistiu.current = true;
        }}
      >
        <p className="mb-2 text-sm font-semibold">Em que dias ela se repete?</p>
        <SeletorDias valor={rascunho} onChange={setRascunho} />
        <div className="mt-3 flex justify-end">
          <Button type="button" size="sm" onClick={() => aoAbrirOuFechar(false)}>
            Salvar dias
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

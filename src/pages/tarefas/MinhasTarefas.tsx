import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  AlarmClock,
  CalendarDays,
  CheckCheck,
  CheckCircle2,
  ChevronRight,
  Clock,
  Hourglass,
  ListChecks,
  Moon,
  Paperclip,
  PartyPopper,
  Play,
  RefreshCw,
  Sun,
  Sunset,
  SquareKanban,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { BadgePrioridade } from '@/components/tarefas/BadgePrioridade';
import { BadgeStatus } from '@/components/tarefas/BadgeStatus';
import { BolinhaFeito } from '@/components/tarefas/BolinhaFeito';
import { ChipDia } from '@/components/tarefas/ChipDia';
import { TAREFA_PRIORIDADES } from '@/config/tarefas';
import { useAuth } from '@/hooks/useAuth';
import { useCatalogo, type CatalogoItem } from '@/hooks/useCatalogos';
import { useMinhasTarefas } from '@/hooks/useMinhasTarefas';
import { useQuadros } from '@/hooks/useQuadros';
import { corDaEtiqueta } from '@/lib/cores';
import { hojeISO } from '@/lib/format';
import { estaFeita, primeiroNome, saudacao, statusNoDia } from '@/lib/tarefas';
import { mensagemLeiga } from '@/lib/tarefasMutacoes';
import { cn } from '@/lib/utils';
import type { TarefaMinha, TarefaStatus } from '@/types/tarefas';

/**
 * Minhas Tarefas — a tela do funcionário.
 *
 * É por aqui que a equipe usa o sistema no dia a dia; o quadro inteiro é para
 * quem gerencia. A pessoa abre, vê só o que é dela para HOJE, de todos os
 * quadros, e marca a bolinha quando termina. As tarefas de todo dia voltam
 * pendentes sozinhas amanhã — é o fim do "zerar o status à mão" que o Felipe
 * fazia no Monday todo dia.
 *
 * Agrupada pelo turno (os períodos que a loja cadastra em Listas do Sistema,
 * na ordem de lá), porque é assim que o dia da loja anda: primeiro o que se
 * faz ao abrir, por último o que se faz ao fechar. Dentro do turno, a hora
 * marcada manda (v2): "07:30 Ligar os telefones" vem antes de "10:00 Responder
 * a OLX".
 *
 * Feito que espera o gerente (v2) continua aqui, riscado e com o selo
 * "Enviada para conferência": no quadro ele some (foi para a aba Conferência),
 * mas a pessoa precisa ver que o dela já foi. Quando o gerente confere, o selo
 * vira "Conferida" e a bolinha trava — desfazer, só com ele.
 */

const SEM_PERIODO = 'sem-periodo';

interface GrupoDoQuadro {
  id: string;
  nome: string;
  cor: string;
  tarefas: TarefaMinha[];
}

interface GrupoDoTurno {
  chave: string;
  titulo: string;
  total: number;
  feitas: number;
  quadros: GrupoDoQuadro[];
}

/** "10:00" => 600. Sem hora = depois de qualquer hora do dia. */
function minutosDoDia(horario: string | null): number {
  if (!horario) return Number.MAX_SAFE_INTEGER;
  const [h, m] = horario.split(':').map(Number);
  return h * 60 + m;
}

/**
 * Pendentes primeiro, feitas no fim e riscadas — a pessoa vê o que falta sem
 * perder de vista o que já fez. Entre as pendentes (e entre as feitas), a
 * hora marcada manda: da mais cedo para a mais tarde, e as sem hora depois.
 * Entre as sem hora vale o de antes: atrasada no topo, depois a mais urgente,
 * depois a ordem do quadro.
 */
function ordenarNoGrupo(tarefas: TarefaMinha[], hoje: string): TarefaMinha[] {
  const chave = (t: TarefaMinha) => [
    estaFeita(t) ? 1 : 0,
    minutosDoDia(t.horario),
    statusNoDia(t, hoje) === 'atrasada' ? 0 : 1,
    -TAREFA_PRIORIDADES[t.prioridade].ordem,
    t.ordem,
  ];
  return [...tarefas].sort((a, b) => {
    const ka = chave(a);
    const kb = chave(b);
    for (let i = 0; i < ka.length; i++) if (ka[i] !== kb[i]) return ka[i] - kb[i];
    return 0;
  });
}

function agruparPorTurno(
  tarefas: TarefaMinha[],
  catalogo: CatalogoItem[],
  corDoQuadro: (id: string, nome: string) => string,
  hoje: string,
): GrupoDoTurno[] {
  const posicaoNoCatalogo = new Map(catalogo.map((p, i) => [p.id, i]));
  const turnos = new Map<string, { titulo: string; posicao: number; tarefas: TarefaMinha[] }>();

  for (const t of tarefas) {
    const chave = t.periodo_id ?? SEM_PERIODO;
    let turno = turnos.get(chave);
    if (!turno) {
      turno = {
        // "Sem período", e não "sem horário": desde a v2 a tarefa pode ter
        // hora marcada (10:00) sem ter turno, e "sem horário" em cima de uma
        // tarefa das 10:00 seria mentira.
        titulo: t.periodo?.descricao ?? 'Sem período definido',
        // Turno que saiu do catálogo vem depois dos cadastrados; "sem
        // período" fecha a lista — é o que dá para encaixar em qualquer hora.
        posicao: t.periodo_id
          ? posicaoNoCatalogo.get(t.periodo_id) ?? catalogo.length
          : Number.MAX_SAFE_INTEGER,
        tarefas: [],
      };
      turnos.set(chave, turno);
    }
    turno.tarefas.push(t);
  }

  return [...turnos.entries()]
    .sort(([, a], [, b]) => a.posicao - b.posicao || a.titulo.localeCompare(b.titulo, 'pt-BR'))
    .map(([chave, turno]) => {
      const porQuadro = new Map<string, GrupoDoQuadro>();
      for (const t of turno.tarefas) {
        const grupo = porQuadro.get(t.quadro_id);
        if (grupo) grupo.tarefas.push(t);
        else {
          porQuadro.set(t.quadro_id, {
            id: t.quadro_id,
            nome: t.quadro_nome,
            cor: corDoQuadro(t.quadro_id, t.quadro_nome),
            tarefas: [t],
          });
        }
      }
      const quadros = [...porQuadro.values()]
        .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
        .map((q) => ({ ...q, tarefas: ordenarNoGrupo(q.tarefas, hoje) }));
      return {
        chave,
        titulo: turno.titulo,
        total: turno.tarefas.length,
        feitas: turno.tarefas.filter(estaFeita).length,
        quadros,
      };
    });
}

/** '2026-09-20' => '20/09' (sem passar por Date: data pura em UTC volta um dia no Brasil). */
function diaEMes(iso: string): string {
  const [, mes, dia] = iso.split('-');
  return `${dia}/${mes}`;
}

function plural(n: number, singular: string, varias: string) {
  return `${n} ${n === 1 ? singular : varias}`;
}

/** A frase do cabeçalho: quanto tem e quanto já foi. */
function fraseDoDia(total: number, feitas: number): string {
  if (total === 0) return 'Nenhuma tarefa sua para hoje.';
  const tem = `Você tem ${plural(total, 'tarefa', 'tarefas')} hoje.`;
  if (feitas === total) return `${tem} Já fez todas. Mandou bem!`;
  if (feitas === 0) return `${tem} Nenhuma feita ainda.`;
  return `${tem} ${feitas} já ${feitas === 1 ? 'feita' : 'feitas'}.`;
}

function LinhaDaTarefa({
  tarefa,
  hoje,
  onAlternarFeito,
  onDefinirStatus,
  onAbrir,
}: {
  tarefa: TarefaMinha;
  hoje: string;
  onAlternarFeito: () => void;
  onDefinirStatus: (status: TarefaStatus) => void;
  onAbrir: () => void;
}) {
  const feita = estaFeita(tarefa);
  const status = statusNoDia(tarefa, hoje);
  const avulsa = tarefa.dias_semana.length === 0;
  const importante = tarefa.prioridade === 'alta' || tarefa.prioridade === 'urgente';
  const aguardando = tarefa.conferencia === 'aguardando';
  const conferida = tarefa.conferencia === 'conferida';

  return (
    <li
      className={cn(
        'group flex items-center gap-4 px-4 py-3.5 transition-colors hover:bg-muted/40',
        feita && 'bg-emerald-50/50 dark:bg-emerald-500/5',
        status === 'atrasada' && 'border-l-4 border-l-red-500',
      )}
    >
      <BolinhaFeito
        feita={feita}
        tamanho="lg"
        onClick={onAlternarFeito}
        // Conferida: o banco não deixa desmarcar (só o gerente devolve), então
        // a bolinha nem oferece. Aguardando ainda dá para desfazer um engano.
        disabled={conferida}
        titulo={
          conferida
            ? 'Conferida pelo gerente. Só ele pode devolver.'
            : feita
              ? 'Desmarcar: ainda não terminei'
              : 'Marcar como feita'
        }
      />

      <div className="min-w-0 flex-1">
        <button
          type="button"
          onClick={onAbrir}
          title="Abrir a ficha da tarefa no quadro"
          className={cn(
            'text-left font-medium leading-snug underline-offset-2 transition-colors hover:underline',
            feita && 'text-muted-foreground line-through decoration-2',
          )}
        >
          {tarefa.titulo}
        </button>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {tarefa.horario && (
            <span
              title={`Às ${tarefa.horario}`}
              className={cn(
                'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-semibold tabular-nums',
                feita ? 'bg-muted text-muted-foreground' : 'bg-sky-500/10 text-sky-700 dark:text-sky-300',
              )}
            >
              <AlarmClock className="h-3.5 w-3.5" />
              {tarefa.horario}
            </span>
          )}
          <ChipDia dias={tarefa.dias_semana} compacto />
          <span className="inline-flex items-center gap-0.5">
            {tarefa.quadro_nome}
            <ChevronRight className="h-3 w-3" />
            {tarefa.lista_nome}
          </span>
          {avulsa && !feita && tarefa.prazo && (
            <span
              className={cn(
                'inline-flex items-center gap-1 font-medium',
                status === 'atrasada' ? 'text-red-600' : 'text-amber-600',
              )}
            >
              <CalendarDays className="h-3.5 w-3.5" />
              {tarefa.prazo < hoje ? `Venceu em ${diaEMes(tarefa.prazo)}` : 'Prazo: hoje'}
            </span>
          )}
          {tarefa.checklist_total > 0 && (
            <span className="inline-flex items-center gap-1">
              <ListChecks className="h-3.5 w-3.5" />
              {tarefa.checklist_feitos}/{tarefa.checklist_total}
            </span>
          )}
          {tarefa.anexos_total > 0 && (
            <span
              className="inline-flex items-center gap-1"
              title={tarefa.anexos_total === 1 ? '1 anexo' : `${tarefa.anexos_total} anexos`}
            >
              <Paperclip className="h-3.5 w-3.5" />
              {tarefa.anexos_total}
            </span>
          )}
        </div>
      </div>

      <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
        {aguardando && (
          <span
            title="O gerente ainda vai conferir. Se faltar alguma coisa, ele devolve e a tarefa volta pendente."
            className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800 dark:bg-amber-500/20 dark:text-amber-300"
          >
            <Hourglass className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Enviada para conferência</span>
            <span className="sm:hidden">Na conferência</span>
          </span>
        )}
        {conferida && (
          <span
            title="O gerente conferiu e aprovou"
            className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300"
          >
            <CheckCheck className="h-3.5 w-3.5" />
            Conferida
          </span>
        )}
        {importante && !feita && <BadgePrioridade prioridade={tarefa.prioridade} />}
        {!feita && (status === 'fazendo' || status === 'atrasada') && <BadgeStatus status={status} />}
        {!feita && tarefa.status === 'nao_iniciado' && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-muted-foreground hover:text-amber-700"
            onClick={() => onDefinirStatus('fazendo')}
            title="Avisar a equipe que você já está fazendo"
          >
            <Play className="h-3.5 w-3.5" />
            Começar
          </Button>
        )}
      </div>
    </li>
  );
}

export default function MinhasTarefas() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { tarefas, carregando, erro, recarregar, alternarFeito, definirStatus } = useMinhasTarefas();
  const catalogoPeriodos = useCatalogo('tarefa_periodo').data;
  const quadros = useQuadros().quadros.data;

  const agora = new Date();
  const hoje = hojeISO();
  const nome = primeiroNome(user?.profile?.nome ?? '');
  const dataPorExtenso = new Intl.DateTimeFormat('pt-BR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(agora);
  const IconeDoTurno = agora.getHours() < 12 ? Sun : agora.getHours() < 18 ? Sunset : Moon;

  const grupos = useMemo(() => {
    // A cor de verdade de cada quadro (a mesma da lista de quadros); enquanto
    // ela não chega, a cor fixa pelo nome, que é a mesma regra das etiquetas.
    const corPorQuadro = new Map((quadros ?? []).map((q) => [q.id, q.cor]));
    const corDoQuadro = (id: string, nomeDoQuadro: string) =>
      corPorQuadro.get(id) ?? corDaEtiqueta(null, nomeDoQuadro);
    return agruparPorTurno(tarefas, catalogoPeriodos ?? [], corDoQuadro, hoje);
  }, [tarefas, catalogoPeriodos, quadros, hoje]);

  const total = tarefas.length;
  const feitas = tarefas.filter(estaFeita).length;
  const naConferencia = tarefas.filter((t) => t.conferencia === 'aguardando').length;
  const conferidas = tarefas.filter((t) => t.conferencia === 'conferida').length;
  const porcentagem = total > 0 ? Math.round((feitas / total) * 100) : 0;

  const abrirNoQuadro = (t: TarefaMinha) => navigate(`/tarefas/${t.quadro_id}?tarefa=${t.id}`);

  return (
    <div className="mx-auto max-w-4xl animate-fade-in">
      <section className="relative mb-8 overflow-hidden rounded-2xl border bg-gradient-to-br from-primary/10 via-card to-emerald-500/10 p-6 shadow-sm sm:p-8">
        <IconeDoTurno className="pointer-events-none absolute -right-6 -top-6 h-36 w-36 text-amber-400/20" aria-hidden />
        <p className="text-sm font-medium text-muted-foreground first-letter:uppercase">{dataPorExtenso}</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight">
          {saudacao(agora.getHours())}
          {nome ? `, ${nome}` : ''}.
        </h1>
        {carregando ? (
          <Skeleton className="mt-3 h-5 w-72" />
        ) : (
          !erro && <p className="mt-2 text-base text-muted-foreground">{fraseDoDia(total, feitas)}</p>
        )}
        {!carregando && total > 0 && (
          <div className="mt-5 flex max-w-xl items-center gap-3">
            <Progress
              value={porcentagem}
              aria-label="Quanto das tarefas de hoje já foi feito"
              className="h-3 bg-background/80 [&>div]:bg-emerald-500"
            />
            <span className="w-12 shrink-0 text-right text-sm font-bold tabular-nums">{porcentagem}%</span>
          </div>
        )}
        {!carregando && !erro && (naConferencia > 0 || conferidas > 0) && (
          <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold">
            {naConferencia > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300">
                <Hourglass className="h-3.5 w-3.5" />
                {naConferencia} esperando a conferência
              </span>
            )}
            {conferidas > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300">
                <CheckCheck className="h-3.5 w-3.5" />
                {plural(conferidas, 'conferida pelo gerente', 'conferidas pelo gerente')}
              </span>
            )}
          </div>
        )}
        <p className="mt-4 max-w-xl text-xs text-muted-foreground">
          Marque a bolinha quando terminar: o gerente confere o que foi feito. As tarefas de todo dia voltam
          sozinhas amanhã, sem ninguém precisar zerar nada.
        </p>
      </section>

      {carregando ? (
        <div className="space-y-3" aria-label="Carregando suas tarefas">
          <Skeleton className="h-6 w-48" />
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-center gap-4 rounded-xl border bg-card p-4">
              <Skeleton className="h-7 w-7 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-3 w-1/3" />
              </div>
            </div>
          ))}
        </div>
      ) : erro ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-8 text-center">
          <p className="font-semibold">Não foi possível carregar suas tarefas.</p>
          <p className="mt-1 text-sm text-muted-foreground">{mensagemLeiga(erro)}</p>
          <Button variant="outline" className="mt-4" onClick={() => void recarregar()}>
            <RefreshCw className="h-4 w-4" />
            Tentar de novo
          </Button>
        </div>
      ) : total === 0 ? (
        <div className="rounded-2xl border border-dashed bg-muted/20 px-6 py-14 text-center">
          <PartyPopper className="mx-auto h-12 w-12 text-emerald-500" />
          <p className="mt-4 text-lg font-semibold">Nada para hoje.</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
            Aproveite para adiantar alguma coisa do quadro.
          </p>
          <Button className="mt-6" asChild>
            <Link to="/tarefas">
              <SquareKanban className="h-4 w-4" />
              Ver os quadros
            </Link>
          </Button>
        </div>
      ) : (
        <div className="space-y-8">
          {grupos.map((turno) => {
            const completo = turno.feitas === turno.total;
            return (
              <section key={turno.chave} className="space-y-3" aria-label={turno.titulo}>
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      'flex h-8 w-8 items-center justify-center rounded-lg',
                      completo ? 'bg-emerald-500/15 text-emerald-600' : 'bg-primary/10 text-primary',
                    )}
                  >
                    {turno.chave === SEM_PERIODO ? <CalendarDays className="h-4 w-4" /> : <Clock className="h-4 w-4" />}
                  </span>
                  <h2 className="text-base font-semibold">{turno.titulo}</h2>
                  <span
                    className={cn(
                      'rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums',
                      completo ? 'bg-emerald-500 text-white' : 'bg-muted text-muted-foreground',
                    )}
                    title={`${turno.feitas} de ${turno.total} feitas`}
                  >
                    {turno.feitas}/{turno.total}
                  </span>
                  {completo && <CheckCircle2 className="h-4 w-4 text-emerald-500" aria-label="Turno completo" />}
                </div>

                {turno.quadros.map((q) => (
                  <div key={q.id} className="overflow-hidden rounded-xl border bg-card shadow-sm">
                    <div className="flex items-center gap-2 border-b bg-muted/30 px-4 py-2">
                      <span className={cn('h-2.5 w-2.5 rounded-full', q.cor)} aria-hidden />
                      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {q.nome}
                      </span>
                    </div>
                    <ul className="divide-y">
                      {q.tarefas.map((t) => (
                        <LinhaDaTarefa
                          key={t.id}
                          tarefa={t}
                          hoje={hoje}
                          onAlternarFeito={() => alternarFeito(t.id)}
                          onDefinirStatus={(status) => definirStatus({ id: t.id, status })}
                          onAbrir={() => abrirNoQuadro(t)}
                        />
                      ))}
                    </ul>
                  </div>
                ))}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

import { PageHeader } from '@/components/PageHeader';
import { ConferenciaView } from '@/components/tarefas/conferencia/ConferenciaView';
import { PERMISSIONS } from '@/config/permissions';
import { useAuth } from '@/hooks/useAuth';
import { usePessoasDaLoja } from '@/hooks/usePessoasDaLoja';

/**
 * Conferência — o que a equipe marcou como feito em TODOS os quadros, para o
 * gerente aprovar ou devolver (v2, pedido do Felipe em 24/09).
 *
 * Cada quadro tem a mesma lista na aba Conferência dele; esta página junta
 * tudo num lugar só, para o gerente conferir a loja e a assistência de uma
 * vez, sem abrir quadro por quadro. Clicar numa tarefa abre a ficha no quadro
 * dela, já na aba Conferência.
 */
export default function Conferencia() {
  const { can } = useAuth();
  // Nome e foto de quem marcou: o cadastro da loja, não o que veio na lista.
  const pessoas = usePessoasDaLoja().data ?? [];

  return (
    <div className="mx-auto max-w-4xl animate-fade-in">
      <PageHeader
        titulo="Conferência"
        hint="O que a equipe marcou como feito, de todos os quadros, esperando alguém conferir. Marque Conferido para a tarefa voltar ao quadro como feita, ou devolva para ela voltar pendente para a pessoa."
      />
      <ConferenciaView pessoas={pessoas} podeConferir={can(PERMISSIONS.TASKS_REVIEW)} />
    </div>
  );
}

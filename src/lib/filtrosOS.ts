/**
 * Regras dos filtros de OS — sem JSX de propósito.
 *
 * Ficam fora de `FiltrosOS.tsx` porque arquivo de componente que também exporta
 * função perde o recarregamento automático durante o desenvolvimento.
 */

export interface FiltrosOSValores {
  /** Número da OS, nome do cliente, telefone, IMEI ou nº de série. */
  busca: string;
  equipamentoId: string;
  marcaId: string;
  modeloId: string;
  tecnicoId: string;
  /** 'YYYY-MM-DD' — recorte pela data de entrada. */
  de: string;
  ate: string;
}

export const FILTROS_OS_VAZIO: FiltrosOSValores = {
  busca: '',
  equipamentoId: '',
  marcaId: '',
  modeloId: '',
  tecnicoId: '',
  de: '',
  ate: '',
};

/** Campos que a consulta precisa trazer para os filtros funcionarem. */
export const CAMPOS_PARA_FILTRO =
  'equipamento_id, marca_id, modelo_id, tecnico_id, numero_serie, created_at';

/** Aplica os filtros numa lista já carregada. */
export function aplicarFiltrosOS<
  T extends {
    numero_os: string;
    numero_serie?: string | null;
    equipamento_id?: string | null;
    marca_id?: string | null;
    modelo_id?: string | null;
    tecnico_id?: string | null;
    created_at: string;
    clientes?: { nome: string; telefones?: string[] | null } | null;
  },
>(itens: T[], f: FiltrosOSValores, soDigitos: (v: string | null | undefined) => string): T[] {
  const termo = f.busca.trim().toLowerCase();
  const digitos = soDigitos(termo);

  return itens.filter((o) => {
    if (termo) {
      const achouTexto =
        o.numero_os.toLowerCase().includes(termo) ||
        (o.clientes?.nome ?? '').toLowerCase().includes(termo) ||
        (o.numero_serie ?? '').toLowerCase().includes(termo);

      // Telefone e IMEI só batem se a comparação ignorar pontuação: quem digita
      // "17999991234" tem que achar o cliente salvo como "(17) 99999-1234".
      const achouNumero =
        digitos.length > 0 &&
        ((o.clientes?.telefones ?? []).some((t) => soDigitos(t).includes(digitos)) ||
          soDigitos(o.numero_serie).includes(digitos));

      if (!achouTexto && !achouNumero) return false;
    }

    if (f.equipamentoId && o.equipamento_id !== f.equipamentoId) return false;
    if (f.marcaId && o.marca_id !== f.marcaId) return false;
    if (f.modeloId && o.modelo_id !== f.modeloId) return false;

    if (f.tecnicoId === 'sem' && o.tecnico_id) return false;
    if (f.tecnicoId && f.tecnicoId !== 'sem' && o.tecnico_id !== f.tecnicoId) return false;

    // Compara só a parte da data: `created_at` é timestamp, e comparar texto
    // completo deixaria a própria data do "até" de fora.
    const dia = o.created_at.slice(0, 10);
    if (f.de && dia < f.de) return false;
    if (f.ate && dia > f.ate) return false;

    return true;
  });
}

import { useState, type ChangeEvent } from 'react';
import { Download, Upload, AlertTriangle, CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { PageHeader, Indicador, Vazio } from '@/components/PageHeader';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { PERMISSIONS } from '@/config/permissions';
import { supabase } from '@/integrations/supabase/client';

/**
 * Importação de Clientes via CSV.
 *
 * Pensada para quem está migrando de outro sistema (ex.: OK Cells) e tem uma
 * lista grande de clientes para não digitar um por um. Lê um CSV com até 4
 * colunas — nome, telefone, email, cpf_cnpj —, mostra uma pré-visualização
 * das linhas antes de gravar qualquer coisa, e insere em lotes de até 200
 * registros por chamada ao banco.
 *
 * Limitação assumida (V1): não há verificação de duplicidade. Importar a
 * mesma planilha duas vezes — ou uma planilha com um cliente que já existe
 * no cadastro (mesmo CPF ou telefone) — duplica o cliente. Não existe hoje
 * uma constraint única de CPF/telefone em `clientes` que permita detectar
 * isso com segurança (várias linhas legitimamente não têm CPF nem telefone
 * preenchidos). Aceitável para uma primeira versão; se virar problema, o
 * caminho é cruzar por CPF/telefone contra a base atual antes de inserir, ou
 * criar um índice único parcial no banco e tratar o erro de conflito.
 */

const TAMANHO_LOTE = 200;

interface LinhaImportada {
  linhaOriginal: number;
  nome: string;
  telefone: string;
  email: string;
  cpfCnpj: string;
  valido: boolean;
}

interface ResumoImportacao {
  sucesso: number;
  falha: number;
  /** Linhas recusadas por já existirem. Não é erro de planilha. */
  repetidos: string[];
  erros: string[];
}

/** Mesma lógica (invertida) do `escapar` de RelatorioShell.tsx: campo entre
 * aspas pode conter o separador e quebras de linha; `""` dentro de aspas é
 * uma aspa literal. */
function parseCSV(texto: string, separador: string): string[][] {
  const linhas: string[][] = [];
  let linhaAtual: string[] = [];
  let campo = '';
  let dentroAspas = false;

  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];

    if (dentroAspas) {
      if (c === '"') {
        if (texto[i + 1] === '"') {
          campo += '"';
          i++;
        } else {
          dentroAspas = false;
        }
      } else {
        campo += c;
      }
      continue;
    }

    if (c === '"') {
      dentroAspas = true;
    } else if (c === separador) {
      linhaAtual.push(campo);
      campo = '';
    } else if (c === '\r') {
      // Quebra \r\n: o \n seguinte é que fecha a linha. Quebra \r sozinho
      // (Mac antigo) fecha aqui mesmo.
      if (texto[i + 1] !== '\n') {
        linhaAtual.push(campo);
        campo = '';
        linhas.push(linhaAtual);
        linhaAtual = [];
      }
    } else if (c === '\n') {
      linhaAtual.push(campo);
      campo = '';
      linhas.push(linhaAtual);
      linhaAtual = [];
    } else {
      campo += c;
    }
  }

  if (campo !== '' || linhaAtual.length > 0) {
    linhaAtual.push(campo);
    linhas.push(linhaAtual);
  }

  // Descarta linhas totalmente em branco (ex.: linha vazia no fim do arquivo).
  return linhas.filter((l) => l.some((v) => v.trim() !== ''));
}

function detectarSeparador(primeiraLinha: string): string {
  const pontoVirgula = (primeiraLinha.match(/;/g) ?? []).length;
  const virgula = (primeiraLinha.match(/,/g) ?? []).length;
  return virgula > pontoVirgula ? ',' : ';';
}

function dividirEmLotes<T>(itens: T[], tamanho: number): T[][] {
  const lotes: T[][] = [];
  for (let i = 0; i < itens.length; i += tamanho) {
    lotes.push(itens.slice(i, i + tamanho));
  }
  return lotes;
}

/** Mensagem de RLS é críptica; traduz pro que de fato aconteceu — mesmo
 * padrão de useCatalogos.ts. */
function mensagemAmigavel(msg: string): string {
  return /row-level security|policy/i.test(msg)
    ? 'Seu perfil de acesso não permite fazer isso.'
    : msg;
}

/**
 * A linha foi recusada por já existir? (trava de duplicidade, migration
 * 20260808150000 — índice de CPF/CNPJ ou gatilho de telefone.)
 */
function ehClienteRepetido(msg: string): boolean {
  return /clientes_documento_unico/i.test(msg) || /telefone .* já está no cadastro/i.test(msg);
}

function baixarModelo() {
  const linhas = [
    'nome;telefone;email;cpf_cnpj',
    'João da Silva;11999998888;joao@email.com;123.456.789-00',
    'Maria Oliveira;11988887777;maria@email.com;987.654.321-00',
  ];
  const conteudo = linhas.join('\r\n');
  const blob = new Blob(['﻿' + conteudo], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'modelo_importacao_clientes.csv';
  a.click();
  URL.revokeObjectURL(url);
}

export default function ClientesImportar() {
  const { toast } = useToast();
  const { user, can } = useAuth();
  const tenantId = user?.profile?.tenant_id ?? null;
  // A rota já é fechada por RequirePermission (config/menu.ts) com esta mesma
  // permissão — isto aqui é defesa em profundidade, mesmo padrão de
  // Fornecedores.tsx/Transportadoras.tsx, para o dia em que view e manage
  // se separarem em permissões distintas.
  const podeImportar = can(PERMISSIONS.REGISTRY_CUSTOMERS_MANAGE);

  const [nomeArquivo, setNomeArquivo] = useState<string | null>(null);
  const [linhas, setLinhas] = useState<LinhaImportada[]>([]);
  const [importando, setImportando] = useState(false);
  const [resumo, setResumo] = useState<ResumoImportacao | null>(null);

  const validas = linhas.filter((l) => l.valido);
  const invalidas = linhas.length - validas.length;

  const handleArquivo = (e: ChangeEvent<HTMLInputElement>) => {
    const arquivo = e.target.files?.[0];
    // Limpa o input para permitir escolher o mesmo arquivo de novo depois.
    e.target.value = '';
    if (!arquivo) return;

    setResumo(null);
    setNomeArquivo(arquivo.name);

    const reader = new FileReader();

    reader.onload = () => {
      const bruto = String(reader.result ?? '');
      const texto = bruto.charCodeAt(0) === 0xfeff ? bruto.slice(1) : bruto;

      if (!texto.trim()) {
        toast({
          title: 'Arquivo vazio',
          description: 'O CSV escolhido não tem conteúdo.',
          variant: 'destructive',
        });
        setLinhas([]);
        return;
      }

      const primeiraLinha = texto.split(/\r\n|\r|\n/, 1)[0] ?? '';
      const separador = detectarSeparador(primeiraLinha);
      const tabela = parseCSV(texto, separador);

      if (tabela.length === 0) {
        toast({
          title: 'Não foi possível ler o arquivo',
          description: 'Nenhuma linha reconhecida. Confira o modelo e tente de novo.',
          variant: 'destructive',
        });
        setLinhas([]);
        return;
      }

      const cabecalho = tabela[0].map((v) => v.trim().toLowerCase());
      const idxNome = cabecalho.indexOf('nome');
      const idxTelefone = cabecalho.indexOf('telefone');
      const idxEmail = cabecalho.indexOf('email');
      const idxCpf = cabecalho.findIndex((v) => v === 'cpf_cnpj' || v === 'cpf/cnpj' || v === 'cpfcnpj');

      // Se o cabeçalho não bate com o esperado, assume a ordem padrão
      // nome;telefone;email;cpf_cnpj por posição.
      const colNome = idxNome >= 0 ? idxNome : 0;
      const colTelefone = idxTelefone >= 0 ? idxTelefone : 1;
      const colEmail = idxEmail >= 0 ? idxEmail : 2;
      const colCpf = idxCpf >= 0 ? idxCpf : 3;

      const linhasImportadas: LinhaImportada[] = tabela.slice(1).map((cols, i) => {
        const nome = (cols[colNome] ?? '').trim();
        return {
          linhaOriginal: i + 2, // +1 pelo cabeçalho, +1 porque é 1-based
          nome,
          telefone: (cols[colTelefone] ?? '').trim(),
          email: (cols[colEmail] ?? '').trim(),
          cpfCnpj: (cols[colCpf] ?? '').trim(),
          valido: nome !== '',
        };
      });

      setLinhas(linhasImportadas);
    };

    reader.onerror = () => {
      toast({
        title: 'Erro ao ler o arquivo',
        description: 'Tente novamente.',
        variant: 'destructive',
      });
    };

    reader.readAsText(arquivo, 'utf-8');
  };

  const handleImportar = async () => {
    if (!podeImportar) {
      toast({
        title: 'Sem permissão',
        description: 'Seu perfil de acesso não permite importar clientes.',
        variant: 'destructive',
      });
      return;
    }

    if (!tenantId) {
      toast({
        title: 'Usuário sem loja vinculada',
        description: 'Não é possível importar clientes sem uma loja associada ao seu usuário.',
        variant: 'destructive',
      });
      return;
    }

    if (validas.length === 0) return;

    setImportando(true);
    setResumo(null);

    const lotes = dividirEmLotes(validas, TAMANHO_LOTE);
    let sucesso = 0;
    let falha = 0;
    const erros = new Set<string>();
    const repetidos: string[] = [];

    const paraBanco = (l: (typeof validas)[number]) => ({
      tenant_id: tenantId,
      nome: l.nome,
      telefones: l.telefone ? [l.telefone] : [],
      email: l.email || null,
      cpf_cnpj: l.cpfCnpj || null,
    });

    for (const lote of lotes) {
      const { data, error } = await supabase.from('clientes').insert(lote.map(paraBanco)).select('id');

      if (!error) {
        sucesso += data?.length ?? lote.length;
        continue;
      }

      // Gravar em lote é tudo-ou-nada: com a trava de cliente repetido, uma
      // única linha duplicada derrubaria as outras 49 da planilha. Quando o
      // lote falha, refaz linha a linha — quem pode entrar, entra; quem já
      // existe é listado pelo nome, para a pessoa conferir depois.
      for (const linha of lote) {
        const { error: erroLinha } = await supabase.from('clientes').insert(paraBanco(linha));

        if (!erroLinha) {
          sucesso += 1;
        } else if (ehClienteRepetido(erroLinha.message)) {
          repetidos.push(linha.nome);
        } else {
          falha += 1;
          erros.add(mensagemAmigavel(erroLinha.message));
        }
      }
    }

    setResumo({ sucesso, falha, repetidos, erros: [...erros] });
    setImportando(false);

    const jaExistiam = repetidos.length > 0 ? ` ${repetidos.length} já existia(m).` : '';

    if (falha === 0) {
      toast({
        title: 'Importação concluída!',
        description: `${sucesso} ${sucesso === 1 ? 'cliente cadastrado' : 'clientes cadastrados'} com sucesso.${jaExistiam}`,
      });
    } else {
      toast({
        title: sucesso === 0 ? 'Falha na importação' : 'Importação concluída com falhas',
        description: `${sucesso} cadastrado(s), ${falha} com falha.${jaExistiam}`,
        variant: sucesso === 0 ? 'destructive' : undefined,
      });
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        titulo="Importar Clientes"
        hint="Suba uma planilha CSV para cadastrar vários clientes de uma vez — útil para quem está migrando de outro sistema, como o OK Cells."
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">1. Prepare o arquivo</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>
            O arquivo precisa ser um CSV com estas colunas, na primeira linha:{' '}
            <code className="rounded bg-muted px-1.5 py-0.5 text-foreground">
              nome;telefone;email;cpf_cnpj
            </code>
          </p>
          <p>
            Só <span className="font-medium text-foreground">nome</span> é obrigatório —
            telefone, email e CPF/CNPJ podem ficar em branco.
          </p>
          <Button variant="outline" size="sm" onClick={baixarModelo}>
            <Download className="mr-2 h-4 w-4" />
            Baixar modelo
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">2. Escolha o arquivo</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input type="file" accept=".csv" onChange={handleArquivo} />
          {nomeArquivo && (
            <p className="text-sm text-muted-foreground">
              Arquivo carregado: <span className="font-medium text-foreground">{nomeArquivo}</span>
            </p>
          )}
        </CardContent>
      </Card>

      {linhas.length > 0 && (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <Indicador
              rotulo="Prontas para importar"
              valor={String(validas.length)}
              tom="positivo"
            />
            <Indicador
              rotulo="Com erro (sem nome)"
              valor={String(invalidas)}
              tom={invalidas > 0 ? 'alerta' : 'neutro'}
              detalhe={invalidas > 0 ? 'Essas linhas não serão importadas' : undefined}
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">3. Confira a pré-visualização</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="max-h-[420px] overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[70px]">Linha</TableHead>
                      <TableHead>Nome</TableHead>
                      <TableHead>Telefone</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>CPF/CNPJ</TableHead>
                      <TableHead className="w-[110px]">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {linhas.map((l) => (
                      <TableRow
                        key={l.linhaOriginal}
                        className={!l.valido ? 'bg-destructive/5' : undefined}
                      >
                        <TableCell className="text-muted-foreground">{l.linhaOriginal}</TableCell>
                        <TableCell className={!l.valido ? 'text-destructive' : 'font-medium'}>
                          {l.nome || '(sem nome)'}
                        </TableCell>
                        <TableCell className="text-muted-foreground">{l.telefone || '-'}</TableCell>
                        <TableCell className="text-muted-foreground">{l.email || '-'}</TableCell>
                        <TableCell className="text-muted-foreground">{l.cpfCnpj || '-'}</TableCell>
                        <TableCell>
                          {l.valido ? (
                            <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-600">
                              Pronta
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className="bg-red-500/10 text-red-600">
                              <AlertTriangle className="mr-1 h-3 w-3" />
                              Sem nome
                            </Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          <div className="flex flex-col items-end gap-2">
            {!podeImportar && (
              <p className="text-sm text-muted-foreground">
                Seu perfil de acesso não permite importar clientes.
              </p>
            )}
            <Button
              onClick={handleImportar}
              disabled={validas.length === 0 || importando || !podeImportar}
            >
              {importando ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Importando...
                </>
              ) : (
                <>
                  <Upload className="mr-2 h-4 w-4" />
                  Importar {validas.length} {validas.length === 1 ? 'cliente' : 'clientes'}
                </>
              )}
            </Button>
          </div>
        </>
      )}

      {linhas.length === 0 && nomeArquivo === null && (
        <Vazio
          titulo="Nenhum arquivo carregado"
          descricao="Baixe o modelo, preencha com os clientes e escolha o arquivo acima."
        />
      )}

      {resumo && (
        <Card
          className={
            resumo.falha > 0 || resumo.repetidos.length > 0
              ? 'border-amber-500/40'
              : 'border-emerald-500/40'
          }
        >
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              {resumo.falha === 0 && resumo.repetidos.length === 0 ? (
                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              ) : (
                <XCircle className="h-5 w-5 text-amber-600" />
              )}
              Resultado da importação
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>
              <span className="font-medium text-emerald-600">{resumo.sucesso}</span>{' '}
              {resumo.sucesso === 1 ? 'cliente cadastrado' : 'clientes cadastrados'} com sucesso.
            </p>
            {resumo.repetidos.length > 0 && (
              <>
                <p>
                  <span className="font-medium text-amber-600">{resumo.repetidos.length}</span>{' '}
                  {resumo.repetidos.length === 1
                    ? 'linha já tinha cadastro e foi ignorada'
                    : 'linhas já tinham cadastro e foram ignoradas'}{' '}
                  — o cadastro que já existia foi mantido, nada foi sobrescrito.
                </p>
                <ul className="list-inside list-disc text-muted-foreground">
                  {resumo.repetidos.slice(0, 20).map((nome, i) => (
                    <li key={`${nome}-${i}`}>{nome}</li>
                  ))}
                  {resumo.repetidos.length > 20 && (
                    <li>e mais {resumo.repetidos.length - 20}...</li>
                  )}
                </ul>
              </>
            )}
            {resumo.falha > 0 && (
              <>
                <p>
                  <span className="font-medium text-destructive">{resumo.falha}</span>{' '}
                  {resumo.falha === 1 ? 'linha falhou' : 'linhas falharam'}.
                </p>
                <ul className="list-inside list-disc text-muted-foreground">
                  {resumo.erros.map((erro) => (
                    <li key={erro}>{erro}</li>
                  ))}
                </ul>
              </>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

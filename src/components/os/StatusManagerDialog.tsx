import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { Plus, Trash2, GripVertical, Save } from 'lucide-react';
import { CORES_ETIQUETA } from '@/lib/cores';
import type { StatusConfig } from '@/types/os';

interface StatusManagerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  statuses: StatusConfig[];
  onStatusesChange: () => void;
}

// A paleta vive em `lib/cores.ts` porque as marcações de cliente usam a mesma.
const COLOR_OPTIONS = CORES_ETIQUETA;

export function StatusManagerDialog({
  open,
  onOpenChange,
  statuses,
  onStatusesChange,
}: StatusManagerDialogProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [localStatuses, setLocalStatuses] = useState<StatusConfig[]>([]);
  const [newLabel, setNewLabel] = useState('');
  const [newColor, setNewColor] = useState(COLOR_OPTIONS[0].value);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setLocalStatuses([...statuses]);
    }
  }, [open, statuses]);

  const handleAddStatus = () => {
    if (!newLabel.trim()) {
      toast({
        title: 'Erro',
        description: 'Digite um nome para o status',
        variant: 'destructive',
      });
      return;
    }

    const key = newLabel
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '');

    if (localStatuses.some((s) => s.key === key)) {
      toast({
        title: 'Erro',
        description: 'Já existe um status com esse nome',
        variant: 'destructive',
      });
      return;
    }

    // Cancelado fica com ordem alta de propósito (é o último de todos). Se a
    // etapa nova entrasse depois dele, apareceria no fim do quadro, fora da
    // área visível — parecia que não tinha sido criada.
    const ordensDoFluxo = localStatuses
      .filter((s) => s.key !== 'cancelado')
      .map((s) => s.ordem);
    const maxOrdem = Math.max(...ordensDoFluxo, -1);

    setLocalStatuses([
      ...localStatuses,
      {
        id: `new-${Date.now()}`,
        tenant_id: '',
        key,
        label: newLabel.trim(),
        color: newColor,
        icon: 'circle',
        ordem: maxOrdem + 5,
        ativo: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ]);
    setNewLabel('');
    setNewColor(COLOR_OPTIONS[0].value);
  };

  const handleUpdateStatus = (
    index: number,
    field: keyof StatusConfig,
    value: string | boolean
  ) => {
    setLocalStatuses((prev) =>
      prev.map((s, i) => (i === index ? { ...s, [field]: value } : s))
    );
  };

  const handleDeleteStatus = async (index: number) => {
    const status = localStatuses[index];

    // Etapa obrigatória da assistência: o banco recusa de qualquer forma
    // (migration 20260809130000), mas avisar aqui evita que a pessoa receba um
    // erro técnico depois de já ter mexido em outras linhas.
    if (status.sistema) {
      toast({
        title: 'Etapa obrigatória',
        description: `"${status.label}" faz parte do fluxo fixo da assistência e das automações. Dá para renomear e trocar a cor, mas não excluir.`,
        variant: 'destructive',
      });
      return;
    }

    // Check if status has linked OS
    const { count } = await supabase
      .from('service_orders')
      .select('*', { count: 'exact', head: true })
      .eq('status', status.key);

    if (count && count > 0) {
      toast({
        title: 'Não é possível excluir',
        description: `Este status possui ${count} OS vinculadas. Mova as OS antes de excluir.`,
        variant: 'destructive',
      });
      return;
    }

    setLocalStatuses((prev) => prev.filter((_, i) => i !== index));
  };

  const handleMoveUp = (index: number) => {
    if (index === 0) return;
    setLocalStatuses((prev) => {
      const newList = [...prev];
      [newList[index - 1], newList[index]] = [newList[index], newList[index - 1]];
      return newList.map((s, i) => ({ ...s, ordem: i }));
    });
  };

  const handleMoveDown = (index: number) => {
    if (index === localStatuses.length - 1) return;
    setLocalStatuses((prev) => {
      const newList = [...prev];
      [newList[index], newList[index + 1]] = [newList[index + 1], newList[index]];
      return newList.map((s, i) => ({ ...s, ordem: i }));
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // Perfil vem de useAuth() — não refaz consulta em `profiles` sem
      // filtrar por usuário (isso quebrava com "Tenant não encontrado"
      // assim que a loja tivesse 2+ usuários, ver PDV.tsx pro mesmo fix).
      const tenantId = user?.profile?.tenant_id ?? null;

      if (!tenantId) {
        throw new Error('Tenant não encontrado');
      }

      // Delete removed statuses
      const currentKeys = localStatuses.map((s) => s.key);
      const deletedStatuses = statuses.filter((s) => !currentKeys.includes(s.key));

      // Cada operação confere o erro. Antes, nenhuma conferia: o banco podia
      // recusar tudo e a tela dizia "Status salvos" do mesmo jeito — a pessoa
      // criava uma etapa, não via no Kanban e não tinha como saber por quê.
      for (const status of deletedStatuses) {
        const { error } = await supabase
          .from('os_status_config')
          .delete()
          .eq('id', status.id);
        if (error) throw error;
      }

      // Upsert all statuses
      for (const status of localStatuses) {
        if (status.id.startsWith('new-')) {
          const { error } = await supabase.from('os_status_config').insert({
            tenant_id: tenantId,
            key: status.key,
            label: status.label,
            numero: status.numero ?? null,
            color: status.color,
            icon: status.icon,
            ordem: status.ordem,
            ativo: status.ativo,
          });
          if (error) throw error;
        } else {
          const { error } = await supabase
            .from('os_status_config')
            .update({
              label: status.label,
              numero: status.numero ?? null,
              color: status.color,
              ordem: status.ordem,
              ativo: status.ativo,
            })
            .eq('id', status.id);
          if (error) throw error;
        }
      }

      toast({
        title: 'Status salvos',
        description: 'As alterações foram salvas com sucesso',
        variant: 'success',
      });

      onStatusesChange();
      onOpenChange(false);
    } catch (error: unknown) {
      toast({
        title: 'Erro ao salvar',
        description: error instanceof Error ? error.message : 'Tente novamente.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Gerenciar Status</DialogTitle>
          <DialogDescription>
            Crie, edite ou remova status de OS. Arraste para reordenar.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[400px] pr-4">
          <div className="space-y-3">
            {localStatuses.map((status, index) => (
              <div
                key={status.id}
                className="flex items-center gap-3 p-3 border rounded-lg bg-muted/30"
              >
                <div className="flex flex-col gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => handleMoveUp(index)}
                    disabled={index === 0}
                  >
                    <GripVertical className="h-4 w-4 rotate-90" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => handleMoveDown(index)}
                    disabled={index === localStatuses.length - 1}
                  >
                    <GripVertical className="h-4 w-4 -rotate-90" />
                  </Button>
                </div>

                <div className="flex-1 grid grid-cols-[70px_1fr_1fr] gap-3">
                  <div>
                    {/* O número como a loja fala da etapa ("tá na 2b"). Texto,
                        e não conta, porque "2a" e "2b" são a mesma fase com
                        dois caminhos — pedido do Felipe em 30/08. */}
                    <Label className="text-xs text-muted-foreground">Nº</Label>
                    <Input
                      value={status.numero ?? ''}
                      onChange={(e) => handleUpdateStatus(index, 'numero', e.target.value)}
                      placeholder="2b"
                      className="h-8"
                    />
                  </div>

                  <div>
                    <Label className="text-xs text-muted-foreground">Nome</Label>
                    <Input
                      value={status.label}
                      onChange={(e) =>
                        handleUpdateStatus(index, 'label', e.target.value)
                      }
                      className="h-8"
                    />
                  </div>

                  <div>
                    <Label className="text-xs text-muted-foreground">Cor</Label>
                    <Select
                      value={status.color}
                      onValueChange={(value) =>
                        handleUpdateStatus(index, 'color', value)
                      }
                    >
                      <SelectTrigger className="h-8">
                        <Badge className={status.color}>{status.label}</Badge>
                      </SelectTrigger>
                      <SelectContent>
                        {COLOR_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            <Badge className={option.value}>{option.label}</Badge>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex items-end gap-2">
                    <div className="flex items-center gap-2">
                      {/* Etapa obrigatória não desliga: sumiria do Kanban e as
                          OS paradas nela ficariam invisíveis. */}
                      <Switch
                        checked={status.ativo}
                        disabled={status.sistema}
                        onCheckedChange={(checked) =>
                          handleUpdateStatus(index, 'ativo', checked)
                        }
                      />
                      <Label className="text-xs">Ativo</Label>
                    </div>
                    {status.sistema ? (
                      <span
                        className="px-2 text-xs text-muted-foreground"
                        title="Etapa obrigatória do fluxo da assistência. Nome e cor podem mudar; excluir, não."
                      >
                        Fixa
                      </span>
                    ) : (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => handleDeleteStatus(index)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>

        {/* Add new status */}
        <div className="flex items-end gap-3 pt-4 border-t">
          <div className="flex-1">
            <Label>Novo Status</Label>
            <Input
              placeholder="Nome do status"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddStatus()}
            />
          </div>
          <div className="w-32">
            <Label>Cor</Label>
            <Select value={newColor} onValueChange={setNewColor}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {COLOR_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    <Badge className={option.value}>{option.label}</Badge>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button variant="outline" onClick={handleAddStatus}>
            <Plus className="mr-2 h-4 w-4" />
            Adicionar
          </Button>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            <Save className="mr-2 h-4 w-4" />
            {saving ? 'Salvando...' : 'Salvar Alterações'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

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
import { Plus, Trash2, GripVertical, Save } from 'lucide-react';
import type { StatusConfig } from '@/types/os';

interface StatusManagerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  statuses: StatusConfig[];
  onStatusesChange: () => void;
}

const COLOR_OPTIONS = [
  { value: 'bg-blue-500/10 text-blue-600', label: 'Azul' },
  { value: 'bg-purple-500/10 text-purple-600', label: 'Roxo' },
  { value: 'bg-amber-500/10 text-amber-600', label: 'Âmbar' },
  { value: 'bg-orange-500/10 text-orange-600', label: 'Laranja' },
  { value: 'bg-violet-500/10 text-violet-600', label: 'Violeta' },
  { value: 'bg-emerald-500/10 text-emerald-600', label: 'Esmeralda' },
  { value: 'bg-green-500/10 text-green-600', label: 'Verde' },
  { value: 'bg-red-500/10 text-red-600', label: 'Vermelho' },
  { value: 'bg-pink-500/10 text-pink-600', label: 'Rosa' },
  { value: 'bg-cyan-500/10 text-cyan-600', label: 'Ciano' },
  { value: 'bg-gray-500/10 text-gray-600', label: 'Cinza' },
];

export function StatusManagerDialog({
  open,
  onOpenChange,
  statuses,
  onStatusesChange,
}: StatusManagerDialogProps) {
  const { toast } = useToast();
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

    const maxOrdem = Math.max(...localStatuses.map((s) => s.ordem), -1);

    setLocalStatuses([
      ...localStatuses,
      {
        id: `new-${Date.now()}`,
        tenant_id: '',
        key,
        label: newLabel.trim(),
        color: newColor,
        icon: 'circle',
        ordem: maxOrdem + 1,
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
      // Get current tenant_id
      const { data: profile } = await supabase
        .from('profiles')
        .select('tenant_id')
        .single();

      if (!profile?.tenant_id) {
        throw new Error('Tenant não encontrado');
      }

      // Delete removed statuses
      const currentKeys = localStatuses.map((s) => s.key);
      const deletedStatuses = statuses.filter((s) => !currentKeys.includes(s.key));

      for (const status of deletedStatuses) {
        await supabase.from('os_status_config').delete().eq('id', status.id);
      }

      // Upsert all statuses
      for (const status of localStatuses) {
        if (status.id.startsWith('new-')) {
          // Insert new
          await supabase.from('os_status_config').insert({
            tenant_id: profile.tenant_id,
            key: status.key,
            label: status.label,
            color: status.color,
            icon: status.icon,
            ordem: status.ordem,
            ativo: status.ativo,
          });
        } else {
          // Update existing
          await supabase
            .from('os_status_config')
            .update({
              label: status.label,
              color: status.color,
              ordem: status.ordem,
              ativo: status.ativo,
            })
            .eq('id', status.id);
        }
      }

      toast({
        title: 'Status salvos',
        description: 'As alterações foram salvas com sucesso',
      });

      onStatusesChange();
      onOpenChange(false);
    } catch (error: any) {
      toast({
        title: 'Erro ao salvar',
        description: error.message,
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

                <div className="flex-1 grid grid-cols-3 gap-3">
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
                      <Switch
                        checked={status.ativo}
                        onCheckedChange={(checked) =>
                          handleUpdateStatus(index, 'ativo', checked)
                        }
                      />
                      <Label className="text-xs">Ativo</Label>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={() => handleDeleteStatus(index)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
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

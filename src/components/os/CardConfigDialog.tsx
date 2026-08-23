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
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { CARD_FIELDS } from '@/lib/constants';
import { useCardConfig, type CardConfig } from '@/hooks/useCardConfig';
import { RotateCcw } from 'lucide-react';

interface CardConfigDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CardConfigDialog({ open, onOpenChange }: CardConfigDialogProps) {
  const { config, updateConfig, resetConfig } = useCardConfig();
  const [localConfig, setLocalConfig] = useState<CardConfig>(config);

  useEffect(() => {
    if (open) {
      setLocalConfig(config);
    }
  }, [open, config]);

  const handleSave = () => {
    updateConfig(localConfig);
    onOpenChange(false);
  };

  const handleReset = () => {
    resetConfig();
    onOpenChange(false);
  };

  const handleToggle = (key: keyof CardConfig) => {
    setLocalConfig((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Configurar Cartão</DialogTitle>
          <DialogDescription>
            Escolha quais campos aparecem nos cards do Kanban
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-4 py-4">
          {(Object.entries(CARD_FIELDS) as [keyof CardConfig, { label: string }][]).map(
            ([key, field]) => (
              <div key={key} className="flex items-center space-x-2">
                <Checkbox
                  id={key}
                  checked={localConfig[key]}
                  onCheckedChange={() => handleToggle(key)}
                />
                <Label
                  htmlFor={key}
                  className="text-sm font-normal cursor-pointer"
                >
                  {field.label}
                </Label>
              </div>
            )
          )}
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-row">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleReset}
            className="text-muted-foreground"
          >
            <RotateCcw className="mr-2 h-4 w-4" />
            Restaurar Padrão
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button variant="sucesso" onClick={handleSave}>Salvar</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

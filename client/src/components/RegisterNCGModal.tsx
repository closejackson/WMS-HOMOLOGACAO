import { useState, useRef } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { toast } from 'sonner';
import { Camera, AlertCircle, X, Package } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { trpc } from '@/lib/trpc';

// Schema de validação
const ncgSchema = z.object({
  labelCode: z.string().min(1, 'Código da etiqueta é obrigatório'),
  quantity: z.number().positive('Quantidade deve ser positiva'),
  description: z.string().min(10, 'Descrição deve ter no mínimo 10 caracteres'),
  photoUrl: z.string().min(1, 'Foto é obrigatória'), // Foto OBRIGATÓRIA
  unitsPerBox: z.number().positive('Unidades por caixa deve ser positiva').optional(),
});

type NCGFormData = z.infer<typeof ncgSchema>;

interface RegisterNCGModalProps {
  isOpen: boolean;
  onClose: () => void;
  conferenceId: number;
  receivingOrderItemId: number | null;
  labelCode?: string;
  maxQuantity?: number; // Para limitar a quantidade bloqueada à quantidade recebida
  labelExists?: boolean; // Se etiqueta já existe em labelAssociations
  unitsPerBox?: number; // Vindo da Tela 2
  batch?: string; // Vindo da Tela 2
  expiryDate?: string; // Vindo da Tela 2
  productId?: number | null; // Vindo da Tela 2
}

export const RegisterNCGModal: React.FC<RegisterNCGModalProps> = ({
  isOpen,
  onClose,
  conferenceId,
  receivingOrderItemId,
  labelCode = '',
  maxQuantity = 1,
  labelExists = false,
  unitsPerBox,
  batch,
  expiryDate,
  productId,
}) => {
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [showCameraCapture, setShowCameraCapture] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const { register, handleSubmit, control, reset, setValue, formState: { errors, isSubmitting } } = useForm<NCGFormData>({
    resolver: zodResolver(ncgSchema),
    defaultValues: {
      labelCode: labelCode,
      quantity: 1, // Padrão Enterprise: 1 LPN = 1 Registro
      description: '',
      photoUrl: '',
    },
  });

  const utils = trpc.useUtils();

  // Mutation do tRPC
  const registerMutation = trpc.blindConference.registerNCG.useMutation({
    onSuccess: () => {
      toast.success('Não Conformidade registrada e item movido para NCG!');
      reset(); // Limpa o formulário
      setImagePreview(null);
      
      // Invalidar queries para atualizar lista
      utils.blindConference.getSummary.invalidate();
      
      onClose(); // Fecha o modal
    },
    onError: (error) => {
      toast.error(`Erro ao registrar NCG: ${error.message}`);
    },
  });

  const onSubmit = (data: NCGFormData) => {
    if (data.quantity > maxQuantity) {
        toast.error(`A quantidade bloqueada (${data.quantity}) não pode exceder a quantidade recebida (${maxQuantity}).`);
        return;
    }

    if (!receivingOrderItemId) {
        toast.error("Erro interno: ID do item não fornecido.");
        return;
    }

    registerMutation.mutate({
      receivingOrderItemId: receivingOrderItemId,
      labelCode: data.labelCode,
      conferenceId: conferenceId,
      quantity: data.quantity,
      description: data.description,
      photoUrl: data.photoUrl,
      unitsPerBox: data.unitsPerBox, // Enviado apenas se etiqueta não existe
    });
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validar tipo de arquivo
    if (!file.type.startsWith('image/')) {
      toast.error('Apenas imagens são permitidas');
      return;
    }

    // Validar tamanho (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Imagem muito grande (máximo 5MB)');
      return;
    }

    setIsUploading(true);

    try {
      // Criar preview local
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);

      // Upload para S3 via backend
      const formData = new FormData();
      formData.append('file', file);
      
      const response = await fetch('/api/upload-ncg-photo', {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });
      
      if (!response.ok) {
        throw new Error('Erro ao fazer upload da foto');
      }
      
      const { url } = await response.json();
      setValue('photoUrl', url);
      
      toast.success('Foto carregada com sucesso');
    } catch (error) {
      toast.error('Erro ao carregar foto');
      console.error(error);
    } finally {
      setIsUploading(false);
    }
  };

  const clearImage = () => {
    setValue('photoUrl', '');
    setImagePreview(null);
  };

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'environment' } 
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setShowCameraCapture(true);
    } catch (error) {
      toast.error('Erro ao acessar câmera');
      console.error(error);
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setShowCameraCapture(false);
  };

  const capturePhoto = async () => {
    if (videoRef.current && canvasRef.current) {
      const canvas = canvasRef.current;
      const video = videoRef.current;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0);
        const dataUrl = canvas.toDataURL('image/jpeg');
        setImagePreview(dataUrl);
        stopCamera();
        
        // Upload para S3
        setIsUploading(true);
        try {
          const blob = await (await fetch(dataUrl)).blob();
          const formData = new FormData();
          formData.append('file', blob, 'ncg-photo.jpg');
          
          const response = await fetch('/api/upload-ncg-photo', {
            method: 'POST',
            body: formData,
            credentials: 'include',
          });
          
          if (!response.ok) {
            throw new Error('Erro ao fazer upload da foto');
          }
          
          const { url } = await response.json();
          setValue('photoUrl', url);
          toast.success('Foto capturada e enviada com sucesso');
        } catch (error) {
          toast.error('Erro ao enviar foto');
          console.error(error);
        } finally {
          setIsUploading(false);
        }
      }
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl font-bold text-destructive">
            <AlertCircle className="h-6 w-6" />
            Registrar Não Conformidade (NCG)
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          {/* Label Code */}
          <div className="space-y-1">
            <Label htmlFor="labelCode">Etiqueta/LPN</Label>
            <Input
              id="labelCode"
              {...register('labelCode')}
              disabled
              className="bg-muted font-mono"
            />
            {errors.labelCode && <span className="text-xs text-red-500">{errors.labelCode.message}</span>}
          </div>

          {/* Unidades por Caixa (apenas se etiqueta NÃO existe) */}
          {!labelExists && (
            <div className="space-y-1">
              <Label htmlFor="unitsPerBox">Unidades por Caixa *</Label>
              <Controller
                control={control}
                name="unitsPerBox"
                render={({ field }) => (
                  <Input
                    id="unitsPerBox"
                    type="number"
                    {...field}
                    onChange={(e) => field.onChange(Number(e.target.value))}
                    placeholder="Ex: 10"
                  />
                )}
              />
              {errors.unitsPerBox && <span className="text-xs text-red-500">{errors.unitsPerBox.message}</span>}
            </div>
          )}

          {/* Quantidade */}
          <div className="space-y-1">
            <Label htmlFor="quantity">Quantidade Avariada *</Label>
            <Controller
              control={control}
              name="quantity"
              render={({ field }) => (
                <Input
                  id="quantity"
                  type="number"
                  {...field}
                  onChange={(e) => field.onChange(Number(e.target.value))}
                    max={maxQuantity}
                    min={1}
                    className="font-bold text-center"
                  />
                )}
              />
              {errors.quantity && <span className="text-xs text-red-500">{errors.quantity.message}</span>}
            </div>

          {/* Motivo da Não Conformidade (Textarea) */}
          <div className="space-y-1">
            <Label htmlFor="description">Descrição da Avaria/Motivo do Bloqueio</Label>
            <Textarea
              id="description"
              {...register('description')}
              placeholder="Ex: Embalagem amassada, validade vencida, lote divergente..."
              className="h-24 resize-none"
            />
            {errors.description && <span className="text-xs text-red-500">{errors.description.message}</span>}
          </div>

          {/* Área de Foto (OBRIGATÓRIA) */}
          <div className="space-y-2">
            <Label>Evidência Fotográfica (Obrigatória) *</Label>
            {imagePreview ? (
              <div className="relative border rounded-lg p-2 bg-muted/50">
                <img src={imagePreview} alt="Avaria" className="max-h-40 w-auto mx-auto rounded-md" />
                <Button
                  type="button"
                  size="icon"
                  variant="destructive"
                  className="absolute top-1 right-1 h-6 w-6 rounded-full"
                  onClick={clearImage}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={startCamera}
                    className="h-20 flex-col gap-2"
                  >
                    <Camera className="h-6 w-6" />
                    Tirar Foto
                  </Button>
                  <div className="relative">
                    <Button
                      type="button"
                      variant="outline"
                      className="h-20 w-full flex-col gap-2"
                      onClick={() => document.getElementById('file-upload')?.click()}
                    >
                      <Package className="h-6 w-6" />
                      Anexar Arquivo
                    </Button>
                    <Input
                      id="file-upload"
                      type="file"
                      accept="image/*"
                      onChange={handleImageUpload}
                      className="hidden"
                      disabled={isUploading}
                    />
                  </div>
                </div>
                {isUploading && <p className="text-xs text-center text-muted-foreground">Carregando...</p>}
              </div>
            )}
            {errors.photoUrl && <span className="text-xs text-red-500">{errors.photoUrl.message}</span>}
          </div>

          {/* Botão de Confirmação */}
          <Button 
            type="submit" 
            className="w-full h-12 text-lg gap-2" 
            variant="destructive" 
            disabled={isSubmitting || registerMutation.isPending}
          >
            {isSubmitting || registerMutation.isPending ? (
              <span>Registrando...</span>
            ) : (
              <>
                <AlertCircle />
                Confirmar Bloqueio e Enviar para NCG
              </>
            )}
          </Button>
        </form>
      </DialogContent>

      {/* Modal de Captura de Câmera */}
      {showCameraCapture && (
        <div className="fixed inset-0 z-[100] bg-black/90 flex flex-col">
          <div className="flex-1 relative">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              className="w-full h-full object-cover"
            />
            <canvas ref={canvasRef} className="hidden" />
          </div>
          <div className="p-4 flex gap-3">
            <Button
              variant="outline"
              onClick={stopCamera}
              className="flex-1 h-14 text-lg"
            >
              Cancelar
            </Button>
            <Button
              onClick={capturePhoto}
              className="flex-1 h-14 text-lg"
            >
              <Camera className="w-6 h-6 mr-2" />
              Capturar
            </Button>
          </div>
        </div>
      )}
    </Dialog>
  );
};

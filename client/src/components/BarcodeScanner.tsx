import { useEffect, useRef, useState } from "react";
import { Html5Qrcode, Html5QrcodeSupportedFormats } from "html5-qrcode";
import { Button } from "./ui/button";
import { Camera, X, Zap, ZapOff, Check, AlertCircle, SwitchCamera } from "lucide-react";
import { cn } from "@/lib/utils";

interface BarcodeScannerProps {
  onScan: (code: string) => void;
  onClose: () => void;
  supportedFormats?: Html5QrcodeSupportedFormats[];
}

export function BarcodeScanner({ 
  onScan, 
  onClose,
  supportedFormats = [
    Html5QrcodeSupportedFormats.EAN_13,
    Html5QrcodeSupportedFormats.EAN_8,
    Html5QrcodeSupportedFormats.CODE_128,
    Html5QrcodeSupportedFormats.CODE_39,
    Html5QrcodeSupportedFormats.QR_CODE,
    Html5QrcodeSupportedFormats.DATA_MATRIX,
  ]
}: BarcodeScannerProps) {
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flashEnabled, setFlashEnabled] = useState(false);
  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment");
  const [scanSuccess, setScanSuccess] = useState(false);
  const [scanError, setScanError] = useState(false);
  const [lastScannedCode, setLastScannedCode] = useState<string>("");
  const [scanCount, setScanCount] = useState(0);
  const [successCount, setSuccessCount] = useState(0);
  
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const qrCodeRegionId = "qr-reader";
  const lastScanTimeRef = useRef<number>(0);

  useEffect(() => {
    startScanner();
    return () => {
      stopScanner();
    };
  }, [facingMode]);

  // Vibração háptica
  const vibrate = (pattern: number | number[]) => {
    if ('vibrate' in navigator) {
      navigator.vibrate(pattern);
    }
  };

  const startScanner = async () => {
    try {
      setError(null);
      setIsScanning(true);

      const html5QrCode = new Html5Qrcode(qrCodeRegionId);
      scannerRef.current = html5QrCode;

      await html5QrCode.start(
        { facingMode }, // Câmera traseira ou frontal
        {
          fps: 30, // Aumentado para melhor performance
          qrbox: { width: 280, height: 280 },
          aspectRatio: 1.0,
        },
        (decodedText, decodedResult) => {
          // Debounce: evitar leituras duplicadas em menos de 2 segundos
          const now = Date.now();
          if (now - lastScanTimeRef.current < 2000) {
            return;
          }
          lastScanTimeRef.current = now;

          // Sucesso na leitura
          setScanCount(prev => prev + 1);
          setSuccessCount(prev => prev + 1);
          setLastScannedCode(decodedText);
          
          // Feedback visual de sucesso
          setScanSuccess(true);
          
          // Vibração de sucesso (padrão: curto-longo-curto)
          vibrate([50, 100, 50]);
          
          // Resetar feedback após animação
          setTimeout(() => {
            setScanSuccess(false);
            onScan(decodedText);
            stopScanner();
          }, 800);
        },
        (errorMessage) => {
          // Incrementar contador de tentativas (não exibir erro, é normal)
          setScanCount(prev => prev + 1);
        }
      );

      // Tentar ativar flash se solicitado
      if (flashEnabled) {
        await toggleFlash(true);
      }
    } catch (err: any) {
      console.error("Erro ao iniciar scanner:", err);
      setError(err.message || "Erro ao acessar câmera");
      setIsScanning(false);
      
      // Vibração de erro (longo)
      vibrate(200);
      
      // Feedback visual de erro
      setScanError(true);
      setTimeout(() => setScanError(false), 1500);
    }
  };

  const stopScanner = async () => {
    if (scannerRef.current) {
      try {
        const state = await scannerRef.current.getState();
        if (state === 2) { // 2 = SCANNING
          await scannerRef.current.stop();
        }
        scannerRef.current.clear();
        scannerRef.current = null;
      } catch (err: any) {
        if (!err.message?.includes("not running")) {
          console.error("Erro ao parar scanner:", err);
        }
      }
    }
    setIsScanning(false);
  };

  const toggleFlash = async (enable: boolean) => {
    try {
      // Acesso direto ao MediaStream da câmera
      const videoElement = document.querySelector(`#${qrCodeRegionId} video`) as HTMLVideoElement;
      if (videoElement && videoElement.srcObject) {
        const stream = videoElement.srcObject as MediaStream;
        const track = stream.getVideoTracks()[0];
        const capabilities = track.getCapabilities() as any;
        
        if (capabilities.torch) {
          await track.applyConstraints({
            advanced: [{ torch: enable }]
          } as any);
          setFlashEnabled(enable);
        } else {
          console.warn("Flash não suportado neste dispositivo");
        }
      }
    } catch (err) {
      console.warn("Erro ao acessar flash:", err);
    }
  };

  const handleFlashToggle = () => {
    toggleFlash(!flashEnabled);
  };

  const handleCameraSwitch = async () => {
    await stopScanner();
    setFacingMode(prev => prev === "environment" ? "user" : "environment");
  };

  const handleClose = () => {
    stopScanner();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      {/* Header */}
      <div className="w-full px-4 py-3 flex items-center justify-between text-white bg-black/50 backdrop-blur-sm">
        <div className="flex items-center gap-2">
          <Camera className="w-5 h-5" />
          <div>
            <h2 className="text-base sm:text-lg font-semibold">Scanner de Código</h2>
            <p className="text-xs text-white/60">
              {successCount}/{scanCount} leituras
            </p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={handleClose}
          className="text-white hover:bg-white/10 h-10 w-10"
        >
          <X className="w-5 h-5" />
        </Button>
      </div>

      {/* Scanner Area com Overlay */}
      <div className="flex-1 relative flex items-center justify-center">
        {/* Scanner Container */}
        <div className="relative w-full max-w-md mx-auto">
          <div id={qrCodeRegionId} className="w-full" />
          
          {/* Overlay de Guia de Alinhamento */}
          {isScanning && !scanSuccess && !scanError && (
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
              {/* Cantos do frame */}
              <div className="relative w-72 h-72">
                {/* Canto superior esquerdo */}
                <div className="absolute top-0 left-0 w-12 h-12 border-t-4 border-l-4 border-green-400 rounded-tl-lg" />
                {/* Canto superior direito */}
                <div className="absolute top-0 right-0 w-12 h-12 border-t-4 border-r-4 border-green-400 rounded-tr-lg" />
                {/* Canto inferior esquerdo */}
                <div className="absolute bottom-0 left-0 w-12 h-12 border-b-4 border-l-4 border-green-400 rounded-bl-lg" />
                {/* Canto inferior direito */}
                <div className="absolute bottom-0 right-0 w-12 h-12 border-b-4 border-r-4 border-green-400 rounded-br-lg" />
                
                {/* Linha de scan animada */}
                <div className="absolute inset-0 overflow-hidden">
                  <div className="absolute w-full h-1 bg-gradient-to-r from-transparent via-green-400 to-transparent animate-scan-line" />
                </div>
              </div>
            </div>
          )}

          {/* Feedback de Sucesso */}
          {scanSuccess && (
            <div className="absolute inset-0 flex items-center justify-center bg-green-500/20 backdrop-blur-sm animate-fade-in">
              <div className="bg-green-500 rounded-full p-6 animate-scale-in">
                <Check className="w-16 h-16 text-white" strokeWidth={3} />
              </div>
            </div>
          )}

          {/* Feedback de Erro */}
          {scanError && (
            <div className="absolute inset-0 flex items-center justify-center bg-red-500/20 backdrop-blur-sm animate-fade-in">
              <div className="bg-red-500 rounded-full p-6 animate-scale-in">
                <AlertCircle className="w-16 h-16 text-white" strokeWidth={3} />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Instructions & Last Scan */}
      <div className="w-full px-4 py-3 text-center text-white bg-black/50 backdrop-blur-sm">
        {isScanning ? (
          <div className="space-y-2">
            <p className="text-sm">Posicione o código dentro da área marcada</p>
            {lastScannedCode && (
              <div className="text-xs text-green-400 font-mono bg-black/30 rounded px-3 py-2 inline-block">
                Último: {lastScannedCode}
              </div>
            )}
          </div>
        ) : error ? (
          <p className="text-sm text-red-400">{error}</p>
        ) : (
          <p className="text-sm">Iniciando câmera...</p>
        )}
      </div>

      {/* Control Buttons */}
      <div className="w-full px-4 py-4 bg-black/80 backdrop-blur-sm">
        <div className="flex items-center justify-center gap-3 max-w-md mx-auto">
          {/* Flash Toggle */}
          <Button
            variant="outline"
            size="lg"
            onClick={handleFlashToggle}
            disabled={!isScanning}
            className={cn(
              "flex-1 h-14 border-white/20 text-white hover:bg-white/10",
              flashEnabled && "bg-yellow-500/20 border-yellow-500"
            )}
          >
            {flashEnabled ? (
              <>
                <Zap className="w-5 h-5 mr-2 text-yellow-400" />
                Flash Ligado
              </>
            ) : (
              <>
                <ZapOff className="w-5 h-5 mr-2" />
                Flash
              </>
            )}
          </Button>

          {/* Camera Switch */}
          <Button
            variant="outline"
            size="lg"
            onClick={handleCameraSwitch}
            disabled={!isScanning}
            className="flex-1 h-14 border-white/20 text-white hover:bg-white/10"
          >
            <SwitchCamera className="w-5 h-5 mr-2" />
            Trocar Câmera
          </Button>
        </div>

        {/* Cancel Button */}
        <Button
          variant="outline"
          onClick={handleClose}
          className="w-full mt-3 h-12 bg-white/10 text-white border-white/20 hover:bg-white/20"
        >
          Cancelar e Digitar Manualmente
        </Button>
      </div>

      {/* Formatos Suportados (Debug Info) */}
      <div className="w-full px-4 pb-2 text-center">
        <p className="text-xs text-white/40">
          Formatos: EAN-13, EAN-8, Code 128, Code 39, QR Code, Data Matrix
        </p>
      </div>
    </div>
  );
}

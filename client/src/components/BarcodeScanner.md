# BarcodeScanner Component

Componente otimizado para leitura de códigos de barras e QR codes com feedback visual e háptico.

## Características

### 📱 Suporte a Múltiplos Formatos
- **EAN-13**: Código de barras europeu padrão (13 dígitos)
- **EAN-8**: Versão curta do EAN (8 dígitos)
- **Code 128**: Código de alta densidade para uso industrial
- **Code 39**: Código alfanumérico amplamente usado
- **QR Code**: Códigos bidimensionais
- **Data Matrix**: Códigos 2D compactos

### ✨ Feedback Visual
- **Guia de alinhamento**: Cantos verdes indicam área de leitura
- **Linha de scan animada**: Linha verde que se move verticalmente
- **Feedback de sucesso**: Checkmark verde com animação de escala
- **Feedback de erro**: Ícone de alerta vermelho
- **Preview do código**: Exibe último código escaneado

### 📳 Feedback Háptico
- **Sucesso**: Padrão curto-longo-curto (50ms, 100ms, 50ms)
- **Erro**: Vibração longa (200ms)
- **Compatibilidade**: Detecta automaticamente suporte do dispositivo

### 🎛️ Controles
- **Flash/Lanterna**: Liga/desliga LED da câmera (se disponível)
- **Troca de câmera**: Alterna entre câmera traseira e frontal
- **Estatísticas**: Contador de leituras bem-sucedidas

### ⚡ Performance
- **FPS**: 30 frames por segundo para detecção rápida
- **Debounce**: Evita leituras duplicadas (2 segundos)
- **Área de leitura**: 280x280px otimizada

## Uso

```tsx
import { BarcodeScanner } from "@/components/BarcodeScanner";

function MyComponent() {
  const [showScanner, setShowScanner] = useState(false);

  const handleScan = (code: string) => {
    console.log("Código escaneado:", code);
    setShowScanner(false);
  };

  return (
    <>
      <Button onClick={() => setShowScanner(true)}>
        Escanear Código
      </Button>

      {showScanner && (
        <BarcodeScanner
          onScan={handleScan}
          onClose={() => setShowScanner(false)}
        />
      )}
    </>
  );
}
```

## Props

| Prop | Tipo | Padrão | Descrição |
|------|------|--------|-----------|
| `onScan` | `(code: string) => void` | **obrigatório** | Callback chamado ao escanear código com sucesso |
| `onClose` | `() => void` | **obrigatório** | Callback chamado ao fechar o scanner |
| `supportedFormats` | `Html5QrcodeSupportedFormats[]` | `[EAN_13, EAN_8, CODE_128, CODE_39, QR_CODE, DATA_MATRIX]` | Formatos de código suportados |

## Personalização de Formatos

Para usar apenas formatos específicos:

```tsx
import { Html5QrcodeSupportedFormats } from "html5-qrcode";

<BarcodeScanner
  onScan={handleScan}
  onClose={handleClose}
  supportedFormats={[
    Html5QrcodeSupportedFormats.QR_CODE,
    Html5QrcodeSupportedFormats.EAN_13,
  ]}
/>
```

## Requisitos

- **Permissão de câmera**: O navegador solicitará permissão na primeira vez
- **HTTPS**: Acesso à câmera requer conexão segura (exceto localhost)
- **Navegador moderno**: Chrome 53+, Firefox 49+, Safari 11+

## Compatibilidade

### Vibração
- ✅ Android (Chrome, Firefox, Edge)
- ✅ iOS 13+ (Safari com limitações)
- ❌ Desktop (maioria dos navegadores)

### Flash/Lanterna
- ✅ Android (maioria dos dispositivos)
- ⚠️ iOS (limitado, depende do modelo)
- ❌ Desktop

### Troca de Câmera
- ✅ Dispositivos com múltiplas câmeras
- ❌ Dispositivos com câmera única

## Troubleshooting

### Câmera não inicia
- Verifique permissões do navegador
- Confirme que está em HTTPS ou localhost
- Tente recarregar a página

### Flash não funciona
- Recurso pode não estar disponível no dispositivo
- Verifique se a câmera traseira está selecionada

### Leituras duplicadas
- Sistema possui debounce de 2 segundos
- Afaste o código após leitura bem-sucedida

## Animações CSS

As seguintes classes CSS estão disponíveis:

- `.animate-scan-line`: Linha de scan vertical
- `.animate-fade-in`: Fade in suave
- `.animate-scale-in`: Escala com bounce
- `.animate-pulse-border`: Pulso nas bordas

## Acessibilidade

- Botões com área de toque mínima de 44px
- Contraste adequado para leitura
- Feedback visual e háptico redundante
- Opção de entrada manual sempre disponível

/**
 * useBackground — seleciona aleatoriamente um background da lista Med@x.
 * A escolha é persistida em sessionStorage para não trocar durante a sessão.
 */

const BG_IMAGES = [
  "https://files.manuscdn.com/user_upload_by_module/session_file/310519663187653950/rHYbWqbURDHrdRPI.webp",
  "https://files.manuscdn.com/user_upload_by_module/session_file/310519663187653950/KSjKuAKZHHOIprsU.webp",
  "https://files.manuscdn.com/user_upload_by_module/session_file/310519663187653950/mQnPsHlsCJWCPnlR.webp",
  "https://files.manuscdn.com/user_upload_by_module/session_file/310519663187653950/pjcpTyhmhqXOcIig.webp",
  "https://files.manuscdn.com/user_upload_by_module/session_file/310519663187653950/OFMeTmPthuWSryDT.webp",
];

const SESSION_KEY = "wms_bg_index";

function getOrPickIndex(): number {
  const stored = sessionStorage.getItem(SESSION_KEY);
  if (stored !== null) {
    const idx = parseInt(stored, 10);
    if (!isNaN(idx) && idx >= 0 && idx < BG_IMAGES.length) return idx;
  }
  const idx = Math.floor(Math.random() * BG_IMAGES.length);
  sessionStorage.setItem(SESSION_KEY, String(idx));
  return idx;
}

/** Retorna a URL do background selecionado para esta sessão. */
export function getBackgroundUrl(): string {
  return BG_IMAGES[getOrPickIndex()];
}

/** CSS inline style para aplicar o background como cover fixo. */
export function getBackgroundStyle(): React.CSSProperties {
  return {
    backgroundImage: `url("${getBackgroundUrl()}")`,
    backgroundSize: "cover",
    backgroundPosition: "center center",
    backgroundRepeat: "no-repeat",
    backgroundAttachment: "fixed",
  };
}

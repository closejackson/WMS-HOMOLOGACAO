/**
 * emailNotification.ts
 * 
 * Helper para enviar emails para usuários do Portal do Cliente
 * usando a API de notificação do Manus
 */

import { TRPCError } from "@trpc/server";
import { ENV } from "./env";

export type EmailPayload = {
  to: string;
  subject: string;
  htmlContent: string;
};

const buildEmailEndpointUrl = (baseUrl: string): string => {
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return new URL("webdevtoken.v1.WebDevService/SendEmail", normalizedBase).toString();
};

/**
 * Envia email para um usuário específico usando a API do Manus
 * Retorna true se enviado com sucesso, false caso contrário
 */
export async function sendEmail(payload: EmailPayload): Promise<boolean> {
  if (!ENV.forgeApiUrl) {
    console.warn("[Email] Forge API URL not configured");
    return false;
  }

  if (!ENV.forgeApiKey) {
    console.warn("[Email] Forge API key not configured");
    return false;
  }

  const endpoint = buildEmailEndpointUrl(ENV.forgeApiUrl);

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${ENV.forgeApiKey}`,
        "content-type": "application/json",
        "connect-protocol-version": "1",
      },
      body: JSON.stringify({
        to: payload.to,
        subject: payload.subject,
        html: payload.htmlContent,
      }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.warn(
        `[Email] Failed to send email (${response.status} ${response.statusText})${
          detail ? `: ${detail}` : ""
        }`
      );
      return false;
    }

    console.log(`[Email] Successfully sent email to ${payload.to}`);
    return true;
  } catch (error) {
    console.warn("[Email] Error calling email service:", error);
    return false;
  }
}

/**
 * Template de email para aprovação de acesso ao Portal do Cliente
 */
export function createApprovalEmailTemplate(params: {
  userName: string;
  userLogin: string;
  tenantName: string;
  portalUrl: string;
}): string {
  return `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Acesso Aprovado - Portal do Cliente Med@x</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f5f7fa;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" style="width: 100%; max-width: 600px; border-collapse: collapse; background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
          
          <!-- Header -->
          <tr>
            <td style="padding: 40px 40px 30px; text-align: center; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 12px 12px 0 0;">
              <div style="width: 64px; height: 64px; margin: 0 auto 20px; background-color: #ffffff; border-radius: 16px; display: flex; align-items: center; justify-content: center;">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M9 11L12 14L22 4" stroke="#667eea" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                  <path d="M21 12V19C21 19.5304 20.7893 20.0391 20.4142 20.4142C20.0391 20.7893 19.5304 21 19 21H5C4.46957 21 3.96086 20.7893 3.58579 20.4142C3.21071 20.0391 3 19.5304 3 19V5C3 4.46957 3.21071 3.96086 3.58579 3.58579C3.96086 3.21071 4.46957 3 5 3H16" stroke="#667eea" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              </div>
              <h1 style="margin: 0; font-size: 28px; font-weight: 700; color: #ffffff; letter-spacing: -0.5px;">
                Acesso Aprovado!
              </h1>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding: 40px;">
              <p style="margin: 0 0 24px; font-size: 16px; line-height: 1.6; color: #334155;">
                Olá <strong>${params.userName}</strong>,
              </p>
              
              <p style="margin: 0 0 24px; font-size: 16px; line-height: 1.6; color: #334155;">
                Sua solicitação de acesso ao <strong>Portal do Cliente Med@x</strong> foi aprovada! 🎉
              </p>

              <div style="background-color: #f8fafc; border-left: 4px solid #667eea; padding: 20px; margin: 24px 0; border-radius: 8px;">
                <p style="margin: 0 0 12px; font-size: 14px; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px;">
                  Suas Credenciais de Acesso
                </p>
                <table style="width: 100%; border-collapse: collapse;">
                  <tr>
                    <td style="padding: 8px 0; font-size: 14px; color: #64748b;">Login:</td>
                    <td style="padding: 8px 0; font-size: 14px; font-weight: 600; color: #1e293b; font-family: 'Courier New', monospace;">${params.userLogin}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; font-size: 14px; color: #64748b;">Cliente:</td>
                    <td style="padding: 8px 0; font-size: 14px; font-weight: 600; color: #1e293b;">${params.tenantName}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; font-size: 14px; color: #64748b;">Senha:</td>
                    <td style="padding: 8px 0; font-size: 14px; color: #64748b; font-style: italic;">A senha cadastrada por você</td>
                  </tr>
                </table>
              </div>

              <p style="margin: 0 0 24px; font-size: 16px; line-height: 1.6; color: #334155;">
                Agora você pode acessar o portal para acompanhar seus estoques, pedidos e recebimentos em tempo real.
              </p>

              <!-- CTA Button -->
              <table role="presentation" style="width: 100%; border-collapse: collapse; margin: 32px 0;">
                <tr>
                  <td align="center">
                    <a href="${params.portalUrl}" style="display: inline-block; padding: 16px 40px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: #ffffff; text-decoration: none; border-radius: 8px; font-size: 16px; font-weight: 600; box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4); transition: transform 0.2s;">
                      Acessar Portal do Cliente
                    </a>
                  </td>
                </tr>
              </table>

              <div style="background-color: #fef3c7; border: 1px solid #fbbf24; padding: 16px; margin: 24px 0; border-radius: 8px;">
                <p style="margin: 0; font-size: 14px; line-height: 1.5; color: #92400e;">
                  <strong>⚠️ Importante:</strong> Por segurança, recomendamos que você altere sua senha no primeiro acesso. Nunca compartilhe suas credenciais com terceiros.
                </p>
              </div>

              <p style="margin: 24px 0 0; font-size: 14px; line-height: 1.6; color: #64748b;">
                Se você tiver alguma dúvida ou precisar de ajuda, entre em contato com o administrador do sistema.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 30px 40px; background-color: #f8fafc; border-radius: 0 0 12px 12px; border-top: 1px solid #e2e8f0;">
              <p style="margin: 0 0 8px; font-size: 14px; color: #64748b; text-align: center;">
                Med@x WMS - Sistema de Gerenciamento de Armazém Farmacêutico
              </p>
              <p style="margin: 0; font-size: 12px; color: #94a3b8; text-align: center;">
                © ${new Date().getFullYear()} Med@x. Todos os direitos reservados.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}

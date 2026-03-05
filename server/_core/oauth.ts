import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import type { Express, Request, Response } from "express";
import * as db from "../db";
import { getSessionCookieOptions } from "./cookies";
import { sdk } from "./sdk";

function getQueryParam(req: Request, key: string): string | undefined {
  const value = req.query[key];
  return typeof value === "string" ? value : undefined;
}

export function registerOAuthRoutes(app: Express) {
  app.get("/api/oauth/callback", async (req: Request, res: Response) => {
    const code = getQueryParam(req, "code");
    const state = getQueryParam(req, "state");

    console.log("[OAuth] Callback received", {
      hasCode: !!code,
      hasState: !!state,
      codeLength: code?.length,
      stateLength: state?.length,
    });

    if (!code || !state) {
      res.status(400).json({ error: "code and state are required" });
      return;
    }

    // Decode state to get redirectUri for logging
    let redirectUri = "";
    try {
      redirectUri = atob(state);
      console.log("[OAuth] Decoded redirectUri:", redirectUri);
    } catch (e) {
      console.error("[OAuth] Failed to decode state:", e);
    }

    try {
      console.log("[OAuth] Exchanging code for token...");
      const tokenResponse = await sdk.exchangeCodeForToken(code, state);
      console.log("[OAuth] Token exchange successful");

      const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);
      console.log("[OAuth] Got user info, openId:", userInfo.openId);

      if (!userInfo.openId) {
        res.status(400).json({ error: "openId missing from user info" });
        return;
      }

      await db.upsertUser({
        openId: userInfo.openId,
        name: userInfo.name || null,
        email: userInfo.email ?? null,
        loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null,
        lastSignedIn: new Date(),
      });

      const sessionToken = await sdk.createSessionToken(userInfo.openId, {
        name: userInfo.name || "",
        expiresInMs: ONE_YEAR_MS,
      });

      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });

      console.log("[OAuth] Login successful, redirecting to /");
      res.redirect(302, "/");
    } catch (error: any) {
      const errMsg = error?.response?.data?.message || error?.message || String(error);
      const errStatus = error?.response?.status || error?.status;
      console.error("[OAuth] Callback failed", {
        message: errMsg,
        status: errStatus,
        redirectUri,
        codeLength: code?.length,
      });
      res.status(500).json({ error: "OAuth callback failed", detail: errMsg });
    }
  });
}

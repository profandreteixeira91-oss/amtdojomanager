// Acesso do Control Center da AMT (amtsistemas.com.br/admin) às Edge Functions deste projeto.
//
// O navegador do /admin manda o token de sessão do Control Center (projeto amt-sistemas). Quem chama precisa
// ser admin ativo de lá: o token é conferido no Auth do amt-sistemas e a permissão pela função
// public.is_control_center_admin do mesmo projeto. Nenhum segredo deste projeto sai daqui.
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

const CONTROL_CENTER_URL = Deno.env.get("CONTROL_CENTER_SUPABASE_URL") ?? "https://yqxmxevphdumyuwlvppg.supabase.co";
const CONTROL_CENTER_KEY = Deno.env.get("CONTROL_CENTER_PUBLISHABLE_KEY") ?? "sb_publishable_jK7lhco6DQLlfjYm8LGS3g_sGBkVtK2";
const ALLOWED_ORIGINS = ["https://amtsistemas.com.br", "https://www.amtsistemas.com.br"];

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

export function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") ?? "";
  const allowed = ALLOWED_ORIGINS.includes(origin) || /^http:\/\/localhost(:\d+)?$/.test(origin);
  return allowed
    ? {
        "access-control-allow-origin": origin,
        "access-control-allow-headers": "authorization, apikey, content-type, x-client-info",
        "access-control-allow-methods": "GET, POST, OPTIONS",
        vary: "origin",
      }
    : {};
}

/** Devolve o id do usuário do Control Center; lança HttpError 401/403 se não for admin ativo. */
export async function assertControlCenterAdmin(req: Request): Promise<string> {
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) throw new HttpError(401, "Sessão do Control Center obrigatória.");
  const headers = { apikey: CONTROL_CENTER_KEY, Authorization: `Bearer ${token}` };
  const userResponse = await fetch(`${CONTROL_CENTER_URL}/auth/v1/user`, { headers });
  if (!userResponse.ok) throw new HttpError(401, "Sessão do Control Center inválida ou expirada. Entre novamente.");
  const user = await userResponse.json() as { id?: string };
  const allowed = await fetch(`${CONTROL_CENTER_URL}/rest/v1/rpc/is_control_center_admin`, {
    method: "POST",
    headers: { ...headers, "content-type": "application/json" },
    body: JSON.stringify({ _user_id: user.id }),
  });
  if (!user.id || !allowed.ok || await allowed.json() !== true) {
    throw new HttpError(403, "Acesso restrito aos admins do Control Center.");
  }
  return user.id;
}

export function adminClient(): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) throw new Error("config");
  return createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

/** Aplica os cabeçalhos de CORS na resposta. */
export function withCors(req: Request, response: Response): Response {
  Object.entries(corsHeaders(req)).forEach(([key, value]) => response.headers.set(key, value));
  return response;
}

/** Resposta de erro: mensagens de HttpError vão para a tela; o resto vira erro genérico. */
export function errorResponse(name: string, error: unknown): Response {
  if (error instanceof HttpError) return json({ error: error.message }, error.status);
  console.error(`${name}: erro inesperado`, error instanceof Error ? error.message : "unknown");
  return json({ error: "Erro inesperado no servidor." }, 500);
}

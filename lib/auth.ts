import { env } from 'cloudflare:workers';
import { cookies } from 'next/headers';
import { getChatGPTUser } from '@/app/chatgpt-auth';

type AuthEnvironment = { SUPABASE_URL?: string; SUPABASE_PUBLISHABLE_KEY?: string; APP_ORIGIN?: string; TRUST_SITES_AUTH?: string };
export type AppUser = { userId: string; email: string; provider: 'email' | 'legacy' };
type ProviderUser = { id?: string; email?: string; email_confirmed_at?: string };
type TokenResponse = { access_token?: string; refresh_token?: string; expires_in?: number; user?: ProviderUser };
const ACCESS_COOKIE = process.env.NODE_ENV === 'development' ? 'habitlab_access' : '__Host-habitlab_access';
const REFRESH_COOKIE = process.env.NODE_ENV === 'development' ? 'habitlab_refresh' : '__Host-habitlab_refresh';

export function authConfig() {
  const e = env as unknown as AuthEnvironment;
  if (!e.SUPABASE_URL || !e.SUPABASE_PUBLISHABLE_KEY) return null;
  const url = new URL(e.SUPABASE_URL);
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/') throw new Error('Invalid authentication configuration');
  return { url: url.origin, key: e.SUPABASE_PUBLISHABLE_KEY };
}
export function authReady() { return authConfig() !== null; }
export async function trustedLegacyUser() {
  // Only the Sites ingress authenticates and sanitizes these headers. Public
  // Workers and local servers must not treat caller-supplied headers as identity.
  if ((env as unknown as AuthEnvironment).TRUST_SITES_AUTH !== 'true') return null;
  return getChatGPTUser();
}
export function assertSameOrigin(request: Request) {
  const origin = request.headers.get('origin');
  const expected = (env as unknown as AuthEnvironment).APP_ORIGIN || 'https://habit-lab.islopresearch.chatgpt.site';
  const preview = process.env.NODE_ENV === 'development' && origin === 'http://terminal.local:4173';
  if (origin !== expected && !preview) throw new AuthError('Please reopen HabitLab and try again.', 403);
  if (!request.headers.get('content-type')?.startsWith('application/json')) throw new AuthError('Expected a JSON request.', 415);
}
export class AuthError extends Error { constructor(message: string, public status = 400) { super(message); } }
export function authFailure(error: unknown) {
  return Response.json({ error: error instanceof AuthError ? error.message : 'Sign-in is temporarily unavailable. Please try again.' }, { status: error instanceof AuthError ? error.status : 503, headers: { 'Cache-Control': 'no-store' } });
}
export async function providerRequest(path: string, body?: object, access?: string, method?: string) {
  const config = authConfig();
  if (!config) throw new AuthError('Email sign-in is still being set up. You can explore the demo for now.', 503);
  const headers: Record<string, string> = { apikey: config.key, 'Content-Type': 'application/json' };
  if (access) headers.Authorization = `Bearer ${access}`;
  return fetch(`${config.url}/auth/v1${path}`, { method: method || (body ? 'POST' : 'GET'), headers, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(12000), cache: 'no-store' });
}
export function verifiedUser(user: ProviderUser | undefined): AppUser | null {
  if (!user?.id || !user.email || !user.email_confirmed_at) return null;
  return { userId: `email:${user.id}`, email: user.email, provider: 'email' };
}
export async function saveTokens(data: TokenResponse) {
  if (!data.access_token || !data.refresh_token) throw new AuthError('We could not complete sign-in. Please request a new code.', 401);
  const jar = await cookies();
  const options = { httpOnly: true, secure: process.env.NODE_ENV !== 'development', sameSite: 'lax' as const, path: '/' };
  jar.set(ACCESS_COOKIE, data.access_token, { ...options, maxAge: Math.min(data.expires_in || 3600, 3600) });
  jar.set(REFRESH_COOKIE, data.refresh_token, { ...options, maxAge: 60 * 60 * 24 * 30 });
}
export async function clearTokens() {
  const jar = await cookies();
  const options = { httpOnly: true, secure: process.env.NODE_ENV !== 'development', sameSite: 'lax' as const, path: '/', maxAge: 0 };
  jar.set(ACCESS_COOKIE, '', options);
  jar.set(REFRESH_COOKIE, '', options);
}
export async function getAppUser(): Promise<AppUser | null> {
  // Keep the original private workspace usable until email sign-in is configured.
  if (!authReady()) {
    const user = await trustedLegacyUser();
    return user ? { userId: user.userId, email: user.email, provider: 'legacy' } : null;
  }
  const jar = await cookies();
  const access = jar.get(ACCESS_COOKIE)?.value;
  if (access) {
    const response = await providerRequest('/user', undefined, access);
    if (response.ok) return verifiedUser(await response.json() as ProviderUser);
    if (response.status !== 401 && response.status !== 403) throw new AuthError('We couldn’t check your account. Please try again.', 503);
  }
  const refresh = jar.get(REFRESH_COOKIE)?.value;
  if (!refresh) return null;
  const response = await providerRequest('/token?grant_type=refresh_token', { refresh_token: refresh });
  if (!response.ok) {
    if (response.status === 400 || response.status === 401 || response.status === 403) { await clearTokens(); return null; }
    throw new AuthError('We couldn’t reconnect your account. Please try again.', 503);
  }
  const data = await response.json() as TokenResponse;
  const user = verifiedUser(data.user);
  if (!user) { await clearTokens(); return null; }
  await saveTokens(data);
  return user;
}
export async function revokeSession() {
  const jar = await cookies();
  const access = jar.get(ACCESS_COOKIE)?.value;
  const refresh = jar.get(REFRESH_COOKIE)?.value;
  try {
    if (authReady()) {
      const response = access ? await providerRequest('/logout?scope=local', {}, access) : null;
      // Access cookies expire before refresh cookies. Refresh only to revoke the
      // provider session, without re-establishing a browser session at sign-out.
      if (refresh && (!response || response.status === 401 || response.status === 403)) {
        const renewed = await providerRequest('/token?grant_type=refresh_token', { refresh_token: refresh });
        if (renewed.ok) {
          const data = await renewed.json() as TokenResponse;
          if (data.access_token) await providerRequest('/logout?scope=local', {}, data.access_token);
        }
      }
    }
  } catch { /* Always remove the browser session, even during an outage. */ }
  finally {
    await clearTokens();
  }
}

import { z } from 'zod';
import { assertSameOrigin, providerRequest, verifiedUser, saveTokens, authFailure, AuthError, trustedLegacyUser } from '@/lib/auth';
import { db } from '@/lib/server';
const schema = z.object({ email: z.string().trim().email().max(254), token: z.string().regex(/^\d{6}$/) });
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const result = schema.safeParse(await request.json());
    if (!result.success) throw new AuthError('Enter the six-digit code from your email.');
    const response = await providerRequest('/verify', { email: result.data.email.toLowerCase(), token: result.data.token, type: 'email' });
    if (response.status === 429) throw new AuthError('Too many attempts. Please wait before trying again.', 429);
    if (!response.ok) throw new AuthError(response.status >= 500 ? 'Sign-in is temporarily unavailable.' : 'That code is invalid or expired. Please request another.', response.status >= 500 ? 503 : 401);
    const data = await response.json() as { access_token?: string; refresh_token?: string; expires_in?: number; user?: { id?: string; email?: string; email_confirmed_at?: string } };
    const user = verifiedUser(data.user);
    if (!user) throw new AuthError('Please verify your email before signing in.', 401);
    // Preserve original records only when BOTH identities are authenticated and their emails match.
    const previous = await trustedLegacyUser();
    if (previous && previous.email.toLowerCase() === user.email.toLowerCase()) {
      await db().batch(['habits', 'logs', 'messages'].map(table => db().prepare(`UPDATE ${table} SET user_id = ? WHERE user_id = ?`).bind(user.userId, previous.userId)));
    }
    await saveTokens(data);
    return Response.json({ user }, { headers: { 'Cache-Control': 'no-store, private' } });
  } catch (error) { return authFailure(error); }
}

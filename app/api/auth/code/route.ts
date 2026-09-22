import { z } from 'zod';
import { assertSameOrigin, providerRequest, authFailure, AuthError } from '@/lib/auth';
const schema = z.object({ email: z.string().trim().email().max(254) });
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const result = schema.safeParse(await request.json());
    if (!result.success) throw new AuthError('Enter a valid email address.');
    const response = await providerRequest('/otp', { email: result.data.email.toLowerCase(), create_user: true });
    if (response.status === 429) throw new AuthError('Please wait a minute before requesting another code.', 429);
    if (!response.ok) throw new AuthError('We couldn’t send a sign-in code. Please try again shortly.', 503);
    return Response.json({ sent: true }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return authFailure(error); }
}

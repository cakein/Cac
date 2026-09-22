import { assertSameOrigin, revokeSession, authFailure } from '@/lib/auth';
export async function POST(request: Request) {
  try { assertSameOrigin(request); await revokeSession(); return Response.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } }); }
  catch (error) { return authFailure(error); }
}

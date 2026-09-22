import { authReady, getAppUser, authFailure } from '@/lib/auth';
export async function GET() {
  try { return Response.json({ configured: authReady(), user: await getAppUser() }, { headers: { 'Cache-Control': 'no-store, private' } }); }
  catch (error) { return authFailure(error); }
}

import {env} from 'cloudflare:workers';
import {getAppUser,AuthError,authFailure} from '@/lib/auth';
export function db(){if(!env.DB)throw new Error('Storage unavailable');return env.DB;}
export async function userId(){return (await getAppUser())?.userId;}
export async function state(uid:string){const [h,l,m]=await Promise.all([db().prepare('SELECT data FROM habits WHERE user_id = ? ORDER BY created_at').bind(uid).all<{data:string}>(),db().prepare('SELECT data FROM logs WHERE user_id = ? ORDER BY date').bind(uid).all<{data:string}>(),db().prepare('SELECT role,content FROM messages WHERE user_id = ? ORDER BY id DESC LIMIT 40').bind(uid).all<{role:string;content:string}>()]);return {habits:h.results.map(x=>JSON.parse(x.data)),logs:l.results.map(x=>JSON.parse(x.data)),messages:m.results.reverse()};}
export function failure(e:unknown){if(e instanceof AuthError)return authFailure(e);console.error('HabitLab request failed',e instanceof Error?e.message:'Unknown error');return Response.json({error:'We couldn’t save or load your data. Please try again.'},{status:503});}

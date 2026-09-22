'use client';
import { useEffect, useState } from 'react';
import { ArrowRight, Check, FlaskConical, LoaderCircle, Mail, ShieldCheck } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
export type AccountUser = { userId: string; email: string; provider: 'email' | 'legacy' };
type Props = { open: boolean; setOpen: (open: boolean) => void; configured: boolean; user: AccountUser | null; onSignedIn: () => Promise<void>; onSignedOut: () => void };
async function post(path: string, body: object) {
  const response = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const result = await response.json() as { error?: string };
  if (!response.ok) throw new Error(result.error || 'Please try again.');
}
export default function AccountDialog({ open, setOpen, configured, user, onSignedIn, onSignedOut }: Props) {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [resendAt, setResendAt] = useState(0);
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    if (!resendAt) return;
    const tick = () => setSeconds(Math.max(0, Math.ceil((resendAt - Date.now()) / 1000)));
    const timer = setInterval(tick, 1000); return () => clearInterval(timer);
  }, [resendAt]);
  async function sendCode() {
    setBusy(true); setError('');
    try { await post('/api/auth/code', { email: email.trim() }); setStep('code'); setCode(''); setSeconds(60); setResendAt(Date.now() + 60000); }
    catch (error) { setError((error as Error).message); }
    finally { setBusy(false); }
  }
  async function verify() {
    setBusy(true); setError('');
    try { await post('/api/auth/verify', { email: email.trim(), token: code }); await onSignedIn(); setCode(''); setOpen(false); }
    catch (error) { setError((error as Error).message); }
    finally { setBusy(false); }
  }
  async function signOut() {
    setBusy(true); setError('');
    try { await post('/api/auth/signout', {}); onSignedOut(); setOpen(false); }
    catch (error) { setError((error as Error).message); }
    finally { setBusy(false); }
  }
  const signedIn = !!user;
  return <Dialog open={open} onOpenChange={value => !busy && setOpen(value)}>
    <DialogContent className="account-modal">
      <span className="account-mark"><FlaskConical size={27} /></span>
      <DialogHeader>
        <DialogTitle>{signedIn ? 'Your HabitLab account' : step === 'code' ? 'Check your inbox.' : 'Your habits. Your space.'}</DialogTitle>
        <DialogDescription>{signedIn ? 'Pick up where you left off, on any device.' : step === 'code' ? `Enter the six-digit sign-in code sent to ${email}.` : 'Sign in or create an account with your email to save your habits and progress.'}</DialogDescription>
      </DialogHeader>
      {signedIn ? <>
        <div className="account-email"><Mail size={20} /><span>{user.email}</span><Check size={18} /></div>
        <p className="account-help">Your habits and check-ins stay private to your account.</p>
        {user.provider === 'email' ? <button className="btn outline full" onClick={signOut} disabled={busy}>{busy ? 'Signing out…' : 'Sign out'}</button> : <div className="account-setup" role="status"><b>Your existing account is connected.</b><p>Email sign-in is being set up. You can keep saving habits with your current account.</p></div>}
      </> : <>
        {!configured && <div className="account-setup" role="status"><b>Email sign-in is being set up.</b><p>You can explore the demo while accounts are being connected. Your habit draft will stay open.</p></div>}
        {step === 'email' ? <form className="account-form" onSubmit={event => { event.preventDefault(); void sendCode(); }}>
          <label htmlFor="account-email">Email address</label>
          <input id="account-email" className="input" type="email" autoComplete="email" autoCapitalize="none" spellCheck={false} placeholder="you@example.com" maxLength={254} value={email} onChange={event => setEmail(event.target.value)} required disabled={busy || !configured} />
          <button className="btn primary full" type="submit" disabled={busy || !configured || !email.trim()}>{busy ? <LoaderCircle className="spin" size={18} /> : <Mail size={18} />}Send sign-in code<ArrowRight size={17} /></button>
          <p className="account-help">New here? Your account is created when you verify your email.</p>
        </form> : <form className="account-form" onSubmit={event => { event.preventDefault(); void verify(); }}>
          <label htmlFor="account-code">Six-digit code</label>
          <InputOTP id="account-code" aria-label="Six-digit sign-in code" maxLength={6} pattern="^[0-9]+$" value={code} onChange={setCode} disabled={busy} autoComplete="one-time-code" containerClassName="account-otp">
            <InputOTPGroup>{Array.from({ length: 6 }, (_, index) => <InputOTPSlot key={index} index={index} />)}</InputOTPGroup>
          </InputOTP>
          <button className="btn primary full" type="submit" disabled={busy || code.length !== 6}>{busy ? <LoaderCircle className="spin" size={18} /> : <ShieldCheck size={18} />}Sign in to HabitLab</button>
          <div className="account-secondary"><button className="text-button" type="button" disabled={busy} onClick={() => { setStep('email'); setCode(''); setError(''); }}>Change email</button><button className="text-button" type="button" disabled={busy || seconds > 0} onClick={sendCode}>{seconds > 0 ? `Resend in ${seconds}s` : 'Resend code'}</button></div>
        </form>}
        <div className="account-footer"><ShieldCheck size={16} /><span>Sign in securely with a one-time email code.</span></div>
      </>}
      {error && <p className="account-error" role="alert">{error}</p>}
    </DialogContent>
  </Dialog>;
}

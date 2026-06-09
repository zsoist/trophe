'use client';

import { Suspense, useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { Mail, ArrowRight, Loader2, Eye, EyeOff } from 'lucide-react';

function safeRedirectTo(value: string | null): string | null {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.startsWith('/login')) {
    return null;
  }
  return value;
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = safeRedirectTo(searchParams.get('redirectTo'));
  const initialMode = searchParams.get('mode') === 'signup' ? 'signup' : 'login';

  const [mode, setMode] = useState<'login' | 'signup'>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [fullName, setFullName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Sync mode with URL param changes
  useEffect(() => {
    const urlMode = searchParams.get('mode');
    if (urlMode === 'signup') setMode('signup');
  }, [searchParams]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');

    try {
      if (mode === 'login') {
        const { data: authData, error: authError } = await supabase.auth.signInWithPassword({ email, password });
        if (authError) throw authError;
        if (redirectTo) {
          router.replace(redirectTo);
          return;
        }
        // Route by role — coaches go to /coach, clients to /dashboard
        const userId = authData.user?.id;
        if (userId) {
          const { data: profile } = await supabase.from('profiles').select('role').eq('id', userId).maybeSingle();
          if (profile?.role === 'coach') {
            router.replace('/coach');
            return;
          }
        }
        router.replace('/dashboard');
      } else {
        // Sign up via server-side API (bypasses email confirmation)
        const res = await fetch('/api/auth/signup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password, full_name: fullName }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Signup failed');

        // Now sign in with the newly created credentials
        const { error: loginError } = await supabase.auth.signInWithPassword({ email, password });
        if (loginError) throw loginError;

        setSuccess('Account created! Setting up your profile...');
        setTimeout(() => router.replace('/onboarding'), 800);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  async function handleMagicLink() {
    if (!email) { setError('Enter your email first'); return; }
    setLoading(true);
    setError('');
    const { error: authError } = await supabase.auth.signInWithOtp({ email });
    setLoading(false);
    if (authError) {
      setError(authError.message);
    } else {
      setSuccess('Magic link sent! Check your email.');
    }
  }

  return (
    <div className="min-h-screen bg-stone-950 flex items-center justify-center px-5">
      {/* Ambient glow */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[500px] h-[500px] bg-[#D4A853] rounded-full opacity-[0.02] blur-[120px]" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-sm relative"
      >
        {/* Logo */}
        <div className="text-center mb-8">
          <Link href="/" className="no-underline inline-block">
            <span className="font-serif italic text-[#D4A853] text-3xl tracking-tight select-none">
              trophē
            </span>
          </Link>
          <p className="text-stone-600 text-[10px] font-mono tracking-widest uppercase mt-2">
            by DailyNutraFit
          </p>
        </div>

        {/* Card */}
        <div className="glass-elevated p-6 sm:p-7">
          {/* Mode Toggle */}
          <div className="flex gap-0.5 bg-stone-900/60 rounded-xl p-1 mb-5">
            <button
              onClick={() => { setMode('login'); setError(''); }}
              className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all ${
                mode === 'login'
                  ? 'bg-[#D4A853]/12 text-[#D4A853] shadow-sm'
                  : 'text-stone-500 hover:text-stone-300'
              }`}
            >
              Log in
            </button>
            <button
              onClick={() => { setMode('signup'); setError(''); }}
              className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all ${
                mode === 'signup'
                  ? 'bg-[#D4A853]/12 text-[#D4A853] shadow-sm'
                  : 'text-stone-500 hover:text-stone-300'
              }`}
            >
              Sign up
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-3">
            {mode === 'signup' && (
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="input-dark text-sm"
                placeholder="Your name"
                required
                autoComplete="name"
              />
            )}

            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input-dark text-sm"
              placeholder="Email"
              required
              autoComplete="email"
              autoFocus
            />

            <div className="relative">
              <input
                type={showPw ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input-dark text-sm pr-10"
                placeholder={mode === 'signup' ? 'Create password (6+ chars)' : 'Password'}
                required
                minLength={6}
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              />
              <button
                type="button"
                onClick={() => setShowPw(!showPw)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-600 hover:text-stone-400 transition-colors"
                tabIndex={-1}
              >
                {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>

            {error && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="bg-red-500/8 border border-red-500/15 rounded-xl px-3 py-2"
              >
                <p className="text-red-400 text-xs">{error}</p>
              </motion.div>
            )}

            {success && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="bg-green-500/8 border border-green-500/15 rounded-xl px-3 py-2"
              >
                <p className="text-green-400 text-xs">{success}</p>
              </motion.div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="btn-gold w-full !py-3 text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {loading ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <>
                  {mode === 'login' ? 'Log in' : 'Create Account'}
                  <ArrowRight size={14} />
                </>
              )}
            </button>
          </form>

          {mode === 'login' && (
            <>
              <div className="flex items-center gap-3 my-4">
                <div className="flex-1 h-px bg-white/[0.04]" />
                <span className="text-stone-700 text-[10px] font-mono uppercase">or</span>
                <div className="flex-1 h-px bg-white/[0.04]" />
              </div>

              <button
                onClick={handleMagicLink}
                disabled={loading}
                className="btn-ghost w-full !py-2.5 text-xs flex items-center justify-center gap-2 disabled:opacity-30"
              >
                <Mail size={13} />
                Send magic link
              </button>
            </>
          )}

          {mode === 'signup' && (
            <p className="text-stone-600 text-[10px] text-center mt-4 leading-relaxed">
              Creates a client account. Coach seats by invite only.
            </p>
          )}
        </div>

        {/* Back to home */}
        <div className="text-center mt-6">
          <Link href="/" className="text-stone-600 hover:text-stone-400 text-xs transition-colors no-underline">
            ← Back to home
          </Link>
        </div>
      </motion.div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-stone-950" />}>
      <LoginForm />
    </Suspense>
  );
}

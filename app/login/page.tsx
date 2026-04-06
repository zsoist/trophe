'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import Link from 'next/link';
import type { Role } from '@/lib/types';

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState<Role>('client');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');

    try {
      if (mode === 'login') {
        const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
        if (authError) throw authError;
        router.push('/dashboard');
      } else {
        // Sign up
        const { data, error: authError } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { full_name: fullName, role } },
        });
        if (authError) throw authError;

        // Create profile
        if (data.user) {
          const { error: profileError } = await supabase.from('profiles').insert({
            id: data.user.id,
            full_name: fullName,
            email,
            role,
          });
          if (profileError) console.error('Profile creation error:', profileError);

          // Create client_profile for clients and 'both' roles
          if (role === 'client' || role === 'both') {
            await supabase.from('client_profiles').insert({
              user_id: data.user.id,
              coaching_phase: 'onboarding',
            });
          }
        }

        setSuccess('Account created! Redirecting...');
        setTimeout(() => router.push('/onboarding'), 1000);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  async function handleMagicLink() {
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
    <div className="min-h-screen bg-stone-950 flex items-center justify-center px-6">
      {/* Ambient glow */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[400px] h-[400px] bg-[#D4A853] rounded-full opacity-[0.02] blur-[100px]" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="glass-elevated w-full max-w-md p-8 relative"
      >
        {/* Logo */}
        <div className="text-center mb-8">
          <Link href="/" className="no-underline">
            <h1 className="font-serif text-3xl font-bold text-[#D4A853]">τροφή</h1>
          </Link>
          <p className="text-stone-500 text-sm mt-1">
            {mode === 'login' ? 'Welcome back' : 'Create your account'}
          </p>
        </div>

        {/* Mode Toggle */}
        <div className="flex gap-1 bg-stone-900 rounded-xl p-1 mb-6">
          <button
            onClick={() => setMode('login')}
            className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-all ${
              mode === 'login'
                ? 'bg-stone-800 text-stone-100 shadow-sm'
                : 'text-stone-500 hover:text-stone-300'
            }`}
          >
            Log in
          </button>
          <button
            onClick={() => setMode('signup')}
            className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-all ${
              mode === 'signup'
                ? 'bg-stone-800 text-stone-100 shadow-sm'
                : 'text-stone-500 hover:text-stone-300'
            }`}
          >
            Sign up
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === 'signup' && (
            <div>
              <label className="block text-stone-400 text-sm mb-1.5">Full Name</label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="input-dark"
                placeholder="Your name"
                required
              />
            </div>
          )}

          <div>
            <label className="block text-stone-400 text-sm mb-1.5">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input-dark"
              placeholder="you@example.com"
              required
            />
          </div>

          <div>
            <label className="block text-stone-400 text-sm mb-1.5">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input-dark"
              placeholder="••••••••"
              required
              minLength={6}
            />
          </div>

          {mode === 'signup' && (
            <div>
              <label className="block text-stone-400 text-sm mb-2">I am a...</label>
              <div className="grid grid-cols-3 gap-2">
                {([
                  { value: 'client' as Role, label: '🏃 Client', desc: 'Track my nutrition' },
                  { value: 'coach' as Role, label: '📋 Coach', desc: 'Manage clients' },
                  { value: 'both' as Role, label: '⚡ Both', desc: 'Coach + track' },
                ]).map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setRole(opt.value)}
                    className={`p-3 rounded-xl border text-center transition-all ${
                      role === opt.value
                        ? 'border-[#D4A853] bg-[rgba(212,168,83,0.08)] text-stone-100'
                        : 'border-stone-800 text-stone-500 hover:border-stone-600'
                    }`}
                  >
                    <span className="block text-lg mb-1">{opt.label.split(' ')[0]}</span>
                    <span className="block text-xs">{opt.label.split(' ')[1]}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 text-red-400 text-sm">
              {error}
            </div>
          )}

          {success && (
            <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-3 text-green-400 text-sm">
              {success}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="btn-gold w-full disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? '...' : mode === 'login' ? 'Log in' : 'Create Account'}
          </button>
        </form>

        {mode === 'login' && (
          <>
            <div className="flex items-center gap-3 my-5">
              <div className="flex-1 h-px bg-stone-800" />
              <span className="text-stone-600 text-xs">or</span>
              <div className="flex-1 h-px bg-stone-800" />
            </div>

            <button
              onClick={handleMagicLink}
              disabled={!email || loading}
              className="btn-ghost w-full disabled:opacity-30 disabled:cursor-not-allowed text-sm"
            >
              ✨ Send magic link
            </button>
          </>
        )}
      </motion.div>
    </div>
  );
}

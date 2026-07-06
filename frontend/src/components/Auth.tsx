import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { Mail, Lock, LogIn } from 'lucide-react';

export default function Auth() {
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    
    try {
      if (isSignUp) {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        alert('Check your email for the login link!');
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (error: any) {
      alert(error.error_description || error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    const { error } = await supabase.auth.signInWithOAuth({ provider: 'google' });
    if (error) alert(error.message);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-50 dark:bg-surface-900 p-4">
      <div className="w-full max-w-md p-8 rounded-2xl bg-white dark:bg-surface-800 shadow-xl border border-slate-100 dark:border-slate-700">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-semibold mb-2">Welcome to DocumentDoc</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">Sign in to access your intelligent workspace</p>
        </div>
        
        <form onSubmit={handleAuth} className="space-y-4">
          <div>
            <div className="relative">
              <Mail className="absolute left-3 top-3 h-5 w-5 text-slate-400" />
              <input
                type="email"
                placeholder="Email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border rounded-lg bg-surface-50 dark:bg-surface-900 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-500"
                required
              />
            </div>
          </div>
          <div>
            <div className="relative">
              <Lock className="absolute left-3 top-3 h-5 w-5 text-slate-400" />
              <input
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border rounded-lg bg-surface-50 dark:bg-surface-900 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-500"
                required
              />
            </div>
          </div>
          
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2 px-4 bg-brand-500 hover:bg-brand-600 text-white rounded-lg flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
          >
            {loading ? 'Processing...' : (isSignUp ? 'Sign Up' : 'Sign In')}
            {!loading && <LogIn className="h-4 w-4" />}
          </button>
        </form>

        <div className="mt-4 text-center">
          <button
            onClick={() => setIsSignUp(!isSignUp)}
            className="text-sm text-brand-500 hover:underline"
          >
            {isSignUp ? 'Already have an account? Sign In' : "Don't have an account? Sign Up"}
          </button>
        </div>

        <div className="mt-6 flex items-center gap-4">
          <div className="flex-1 border-t dark:border-slate-700"></div>
          <span className="text-sm text-slate-400">or continue with</span>
          <div className="flex-1 border-t dark:border-slate-700"></div>
        </div>

        <button
          onClick={handleGoogleSignIn}
          className="mt-6 w-full py-2 px-4 border dark:border-slate-700 rounded-lg flex items-center justify-center gap-2 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
        >
          <img src="https://www.svgrepo.com/show/475656/google-color.svg" alt="Google" className="h-5 w-5" />
          Google
        </button>
      </div>
    </div>
  );
}

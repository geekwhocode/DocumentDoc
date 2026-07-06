import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

const useMock = !supabaseUrl || supabaseUrl === 'https://placeholder.supabase.co' || supabaseUrl.includes('placeholder')

class MockAuth {
  private listeners: Function[] = [];
  private session: any = null;

  constructor() {
    const savedSession = localStorage.getItem('mock_session');
    if (savedSession) {
      try {
        this.session = JSON.parse(savedSession);
      } catch (e) {
        this.session = null;
      }
    }
  }

  async getSession() {
    return { data: { session: this.session }, error: null };
  }

  onAuthStateChange(callback: (event: string, session: any) => void) {
    this.listeners.push(callback);
    // Trigger initial callback immediately with current session state
    callback('INITIAL_SESSION', this.session);
    return {
      data: {
        subscription: {
          unsubscribe: () => {
            this.listeners = this.listeners.filter(l => l !== callback);
          }
        }
      }
    };
  }

  private notify(event: string) {
    this.listeners.forEach(cb => cb(event, this.session));
  }

  async signUp({ email }: { email: string; password?: string }) {
    return { data: { user: { email } }, error: null };
  }

  async signInWithPassword({ email }: { email: string; password?: string }) {
    this.session = {
      user: { email, id: 'mock-user-id' },
      access_token: 'mock-access-token'
    };
    localStorage.setItem('mock_session', JSON.stringify(this.session));
    this.notify('SIGNED_IN');
    return { data: { session: this.session }, error: null };
  }

  async signInWithOAuth({ provider }: { provider: string }) {
    if (provider === 'google') {
      this.session = {
        user: {
          email: 'google.user@example.com',
          id: 'mock-google-id',
          user_metadata: {
            full_name: 'Google User',
            avatar_url: 'https://www.svgrepo.com/show/475656/google-color.svg'
          }
        },
        access_token: 'mock-google-token'
      };
      localStorage.setItem('mock_session', JSON.stringify(this.session));
      this.notify('SIGNED_IN');
      return { data: { session: this.session }, error: null };
    }
    return { data: null, error: { message: 'Provider not supported in mock mode' } };
  }

  async signOut() {
    this.session = null;
    localStorage.removeItem('mock_session');
    this.notify('SIGNED_OUT');
    return { error: null };
  }
}

export const supabase = useMock
  ? ({ auth: new MockAuth() } as any)
  : createClient(supabaseUrl!, supabaseAnonKey!)


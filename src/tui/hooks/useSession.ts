import { useState, useCallback } from 'react';
import { createSession, getSession, type Session } from '../../session/manager.js';

export function useSession(initialSessionId?: string) {
  const [session, setSession] = useState<Session>(() => {
    if (initialSessionId) {
      const existing = getSession(initialSessionId);
      if (existing) return existing;
    }
    return createSession();
  });

  const refreshSession = useCallback(() => {
    const s = getSession(session.id);
    if (s) setSession(s);
  }, [session.id]);

  const switchSession = useCallback((id: string) => {
    const s = getSession(id);
    if (s) setSession(s);
  }, []);

  const newSession = useCallback((title?: string) => {
    const s = createSession(title);
    setSession(s);
    return s;
  }, []);

  return { session, refreshSession, switchSession, newSession };
}

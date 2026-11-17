import { createContext, useContext, useState, useEffect } from 'react';
import { api, getAuthToken, setAuthToken, clearAuthToken } from '../api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      const cached = sessionStorage.getItem('trybo_user');
      return cached ? JSON.parse(cached) : null;
    } catch {
      return null;
    }
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = getAuthToken();
    if (!token) {
      setLoading(false);
      return;
    }

    // Pin token to this tab's sessionStorage so other tabs don't overwrite it
    if (!sessionStorage.getItem('trybo_token')) {
      sessionStorage.setItem('trybo_token', token);
    }

    api
      .get('/auth/me')
      .then((res) => {
        setUser(res.data.user);
        sessionStorage.setItem('trybo_user', JSON.stringify(res.data.user));
      })
      .catch((err) => {
        if (err.response?.status === 401) {
          clearAuthToken();
          sessionStorage.removeItem('trybo_user');
          setUser(null);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  async function login(email, password) {
    const res = await api.post('/auth/login', { email, password });
    setAuthToken(res.data.token);
    sessionStorage.setItem('trybo_user', JSON.stringify(res.data.user));
    setUser(res.data.user);
    return res.data.user;
  }

  async function register(formData) {
    const res = await api.post('/auth/register', formData);
    setAuthToken(res.data.token);
    sessionStorage.setItem('trybo_user', JSON.stringify(res.data.user));
    setUser(res.data.user);
    return res.data.user;
  }

  function logout() {
    clearAuthToken();
    sessionStorage.removeItem('trybo_user');
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, setUser, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

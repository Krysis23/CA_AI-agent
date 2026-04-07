import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface User {
  id: string;
  name: string;
  email: string;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (name: string, email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem('ca_ai_user');
    if (stored) {
      try { setUser(JSON.parse(stored)); } catch { /* ignore */ }
    }
    setIsLoading(false);
  }, []);

  const login = async (email: string, password: string) => {
    setIsLoading(true);
    await new Promise(r => setTimeout(r, 1000));
    const users = JSON.parse(localStorage.getItem('ca_ai_users') || '[]');
    const found = users.find((u: any) => u.email === email && u.password === password);
    if (!found) { setIsLoading(false); throw new Error('Invalid email or password'); }
    const userData: User = { id: found.id, name: found.name, email: found.email };
    localStorage.setItem('ca_ai_user', JSON.stringify(userData));
    setUser(userData);
    setIsLoading(false);
  };

  const signup = async (name: string, email: string, password: string) => {
    setIsLoading(true);
    await new Promise(r => setTimeout(r, 1000));
    const users = JSON.parse(localStorage.getItem('ca_ai_users') || '[]');
    if (users.find((u: any) => u.email === email)) {
      setIsLoading(false);
      throw new Error('Email already exists');
    }
    const newUser = { id: crypto.randomUUID(), name, email, password };
    users.push(newUser);
    localStorage.setItem('ca_ai_users', JSON.stringify(users));
    const userData: User = { id: newUser.id, name, email };
    localStorage.setItem('ca_ai_user', JSON.stringify(userData));
    setUser(userData);
    setIsLoading(false);
  };

  const logout = () => {
    localStorage.removeItem('ca_ai_user');
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, login, signup, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

import React, { createContext, useContext, useState, useEffect } from 'react';

export type UserRole = 'admin' | 'manager' | 'cook';

export interface User {
  id: number;
  username: string;
  role: UserRole;
  first_name: string;
  last_name: string;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => void;
  isLoading: boolean;
  error: string | null;
  apiKey: string;
  apiUrl: string;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const apiKey = 'mepos_sec_key_prod_abc123';
  const apiUrl = 'http://localhost:5000/api/v1';

  // Load session from localStorage on startup
  useEffect(() => {
    const savedUser = localStorage.getItem('mepos_user');
    const savedToken = localStorage.getItem('mepos_token');
    if (savedUser && savedToken) {
      setUser(JSON.parse(savedUser));
      setToken(savedToken);
    }
  }, []);

  const login = async (username: string, password: string): Promise<boolean> => {
    setIsLoading(true);
    setError(null);
    
    const isOfflineMode = !navigator.onLine;

    try {
      if (isOfflineMode) {
        throw new Error('Offline');
      }

      const response = await fetch(`${apiUrl}/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, password }),
      });

      const data = await response.json();
      if (data.status === 'success') {
        const loggedUser = data.data.user;
        const sessionToken = data.data.token;
        
        setUser(loggedUser);
        setToken(sessionToken);
        localStorage.setItem('mepos_user', JSON.stringify(loggedUser));
        localStorage.setItem('mepos_token', sessionToken);

        // Cache the successful credentials for offline login
        const offlineUsers = JSON.parse(localStorage.getItem('mepos_offline_users') || '{}');
        offlineUsers[username] = {
          user: loggedUser,
          password: password
        };
        localStorage.setItem('mepos_offline_users', JSON.stringify(offlineUsers));

        setIsLoading(false);
        return true;
      } else {
        setError(data.message || 'Identifiants incorrects.');
        setIsLoading(false);
        return false;
      }
    } catch (err) {
      console.warn("Connexion réseau impossible, tentative d'authentification locale :", err);

      // 1. Check cached users list from admin fetch
      const cachedUsersList = JSON.parse(localStorage.getItem('mepos_cached_users') || '[]');
      const userInList = cachedUsersList.find((u: any) => u.username === username);
      if (userInList && userInList.password === password) {
        const loggedUser = {
          id: userInList.id,
          username: userInList.username,
          role: userInList.role,
          first_name: userInList.first_name,
          last_name: userInList.last_name
        };
        setUser(loggedUser);
        setToken('mepos_session_token_mock_offline');
        localStorage.setItem('mepos_user', JSON.stringify(loggedUser));
        localStorage.setItem('mepos_token', 'mepos_session_token_mock_offline');
        setIsLoading(false);
        return true;
      }

      // 2. Check offline users registry (previously logged-in accounts)
      const offlineUsers = JSON.parse(localStorage.getItem('mepos_offline_users') || '{}');
      if (offlineUsers[username] && offlineUsers[username].password === password) {
        const loggedUser = offlineUsers[username].user;
        setUser(loggedUser);
        setToken('mepos_session_token_mock_offline');
        localStorage.setItem('mepos_user', JSON.stringify(loggedUser));
        localStorage.setItem('mepos_token', 'mepos_session_token_mock_offline');
        setIsLoading(false);
        return true;
      }

      // 3. Secours / Fallback defaults if cache is clean/missing
      const defaultUsers: { [key: string]: any } = {
        admin: { id: 1, username: 'admin', role: 'admin', first_name: 'Med', last_name: 'Mair', pass: 'admin123' },
        gerant: { id: 2, username: 'gerant', role: 'manager', first_name: 'Ahmed', last_name: 'Ben Ali', pass: 'gerant123' },
        cuisinier: { id: 3, username: 'cuisinier', role: 'cook', first_name: 'Youssef', last_name: 'Tunisi', pass: 'cuisinier123' }
      };

      const fallback = defaultUsers[username];
      if (fallback && fallback.pass === password) {
        const loggedUser = {
          id: fallback.id,
          username: fallback.username,
          role: fallback.role,
          first_name: fallback.first_name,
          last_name: fallback.last_name
        };
        setUser(loggedUser);
        setToken('mepos_session_token_mock_offline');
        localStorage.setItem('mepos_user', JSON.stringify(loggedUser));
        localStorage.setItem('mepos_token', 'mepos_session_token_mock_offline');
        setIsLoading(false);
        return true;
      }

      setError("Impossible de contacter le serveur et aucun compte local ne correspond.");
      setIsLoading(false);
      return false;
    }
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    localStorage.removeItem('mepos_user');
    localStorage.removeItem('mepos_token');
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        login,
        logout,
        isLoading,
        error,
        apiKey,
        apiUrl,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

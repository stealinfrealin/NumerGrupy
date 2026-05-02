import { createContext, useContext, useState, useEffect, ReactNode } from "react";

const formatDobForBackend = (dob: string): string => {
    if (!dob) return '';
    const parts = dob.split('.'); 
    return parts.length === 3 ? `${parts[2]}-${parts[1]}-${parts[0]}` : dob;
};

interface User { id: number; email: string; role: 'patient' | 'admin'; [key: string]: any; }

interface AuthContextType {
    isAuthenticated: boolean;
    user: User | null;
    login: (email: string, password: string) => Promise<void>;
    adminLogin: (email: string, password: string) => Promise<void>;
    register: (name: string, email: string, password: string, dob: string) => Promise<void>;
    resetPassword: (email: string, newPassword: string) => Promise<void>;
    logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [user, setUser] = useState<User | null>(null);

    useEffect(() => {
        fetch("/api/auth/verify", { credentials: 'include' })
            .then(res => res.ok ? res.json() : null)
            .then(data => {
                if (data?.user) {
                    setIsAuthenticated(true);
                    setUser({ ...data.user, role: data.user.role || 'patient' });
                }
            })
            .catch(err => console.warn("⚠️ Verify failed:", err));
    }, []);

    const login = async (email: string, password: string) => {
        const res = await fetch("/api/login", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, haslo: password }), credentials: 'include'
        });
        if (!res.ok) throw new Error("Nieprawidłowy email lub hasło");
        const data = await res.json();
        setIsAuthenticated(true);
        setUser({ ...data.user, role: data.user.role || 'patient' });
    };

    const adminLogin = async (email: string, password: string) => {
        const res = await fetch("/api/admin/login", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, haslo: password }), credentials: 'include'
        });
        if (!res.ok) throw new Error("Nieprawidłowe dane administratora");
        const data = await res.json();
        setIsAuthenticated(true);
        setUser({ ...data.user, role: 'admin' });
    };

    const register = async (fullName: string, email: string, password: string, dob: string) => {
        const parts = fullName.trim().split(/\s+/);
        const imie = parts[0] || "Imie";
        const nazwisko = parts.length > 1 ? parts.slice(1).join(' ') : "Nazwisko";

        const res = await fetch("/api/register", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ imie, nazwisko, email, haslo: password, data_urodzenia: formatDobForBackend(dob) }),
            credentials: 'include'
        });
        if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            throw new Error(data.error || "Błąd rejestracji");
        }
        await login(email, password);
    };

    const resetPassword = async (email: string, newPassword: string) => {
		const res = await fetch("/api/reset-password", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ email, newPassword: newPassword }), 
			credentials: 'include'
		});

		if (!res.ok) {
			if (res.status === 404) {
				throw new Error("Nie znaleziono użytkownika o podanym adresie email.");
			}
			if (res.status === 400) {
				throw new Error("Hasło musi mieć co najmniej 8 znaków.");
			}
			const data = await res.json().catch(() => ({}));
			throw new Error(data.error || "Błąd resetowania hasła");
		}
	};


    const logout = async () => {
        try {
            await fetch("/api/logout", { method: "POST", credentials: 'include' });
        } catch (err) {
            console.warn("Błąd podczas wylogowywania:", err);
        } finally {
            setIsAuthenticated(false);
            setUser(null);
        }
    };

    return (
        <AuthContext.Provider value={{ isAuthenticated, user, login, adminLogin, register, resetPassword, logout }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (!context) throw new Error("useAuth must be used within an AuthProvider");
    return context;
}

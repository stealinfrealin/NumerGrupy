import { useState, FormEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "./AuthContext";
import styles from "./style_AuthForm.module.css";

interface AuthFormProps { role?: 'patient' | 'admin'; }

export default function AuthForm({ role = 'patient' }: AuthFormProps) {
    const location = useLocation();
    const navigate = useNavigate();
    const { login, adminLogin, register, resetPassword } = useAuth();

    const isLoginPath = location.pathname !== "/register" || role === 'admin';
    const [viewMode, setViewMode] = useState<'login' | 'register' | 'reset'>(isLoginPath ? 'login' : 'register');

    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [name, setName] = useState("");
    const [dob, setDob] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [fieldErrors, setFieldErrors] = useState<{[key: string]: string}>({});

    const validateField = (fieldName: string, value: string) => {
        let errorMessage = "";
        const trimmedValue = value.trim();

        if (!trimmedValue) {
            errorMessage = "To pole jest wymagane.";
        } else if (fieldName === "email") {
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedValue)) {
                errorMessage = "Proszę podać prawidłowy adres email.";
            }
        } else if (fieldName === "dob") {
            if (!/^\d{2}\.\d{2}\.\d{4}$/.test(trimmedValue)) {
                errorMessage = "Wprowadź datę w formacie DD.MM.RRRR.";
            } else {
                const [dayStr, monthStr, yearStr] = trimmedValue.split('.');
                const day = parseInt(dayStr, 10);
                const month = parseInt(monthStr, 10);
                const year = parseInt(yearStr, 10);
                const currentYear = new Date().getFullYear();

                if (year < 1900 || year > currentYear) {
                    errorMessage = `Rok urodzenia musi mieścić się w przedziale 1900–${currentYear}.`;
                } else {
                    const dateObj = new Date(year, month - 1, day);
                    if (dateObj.getFullYear() !== year || dateObj.getMonth() !== month - 1 || dateObj.getDate() !== day) {
                        errorMessage = "Podano nieprawidłową datę kalendarzową.";
                    }
                }
            }
        } else if (fieldName === "name") {
            const nameRegex = /^[a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ]+(-[a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ]+)*\s[a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ]+(-[a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ]+)*$/;
            if (!nameRegex.test(trimmedValue)) {
                errorMessage = "Proszę podać imię i nazwisko oddzielone pojedynczą spacją (np. 'Jan Kowalski' lub 'Anna Kowalska-Maj').";
            }
        } else if (fieldName === "password" || fieldName === "newPassword") {
            // ✅ Frontend validation matches backend requirement
            if (trimmedValue.length < 8) {
                errorMessage = "Hasło musi mieć co najmniej 8 znaków.";
            }
        }

        setFieldErrors(prev => ({ ...prev, [fieldName]: errorMessage }));
        return errorMessage === "";
    };

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setError(null);

        if (viewMode === 'reset') {
            const isEmailValid = validateField("email", email);
            const isNewPasswordValid = validateField("newPassword", newPassword);
            if (!isEmailValid || !isNewPasswordValid) return;

            setLoading(true);
            try {
                await resetPassword(email, newPassword);
                setViewMode('login');
                setNewPassword("");
                setEmail("");
                setPassword("");
                setError("Hasło zostało pomyślnie zresetowane. Możesz się teraz zalogować.");
                setFieldErrors({});
            } catch (err: any) {
                setError(err.message || "Wystąpił błąd podczas resetowania hasła.");
            } finally {
                setLoading(false);
            }
            return;
        }

        const isEmailValid = validateField("email", email);
        const isPasswordValid = validateField("password", password);
        const isNameValid = viewMode === 'register' && role !== 'admin' ? validateField("name", name) : true;
        const isDobValid = viewMode === 'register' && role !== 'admin' ? validateField("dob", dob) : true;

        if (!isEmailValid || !isPasswordValid || !isNameValid || !isDobValid) return;

        setLoading(true);
        try {
            if (viewMode === 'login') {
                if (role === 'admin') {
                    await adminLogin(email, password);
                    navigate("/admin/dashboard", { replace: true });
                } else {
                    await login(email, password);
                    navigate("/dashboard", { replace: true });
                }
            } else {
                await register(name, email, password, dob);
                navigate("/dashboard", { replace: true });
            }
            setName(""); setDob(""); setEmail(""); setPassword(""); setFieldErrors({});
        } catch (err: any) {
            setError(err.message || "Wystąpił błąd.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className={styles.container}>
            <h1 className={styles.title}>{role === 'admin' ? 'Panel Administratora' : 'MDoktor'}</h1>
            {role === 'patient' && viewMode !== 'reset' && (
                <div className={styles.tabs}>
                    <button className={`${styles.tab} ${viewMode === 'login' ? styles.tabActive : styles.tabInactive}`} onClick={() => { setViewMode('login'); setError(null); setFieldErrors({}); }}>Logowanie</button>
                    <button className={`${styles.tab} ${viewMode === 'register' ? styles.tabActive : styles.tabInactive}`} onClick={() => { setViewMode('register'); setError(null); setFieldErrors({}); }}>Rejestracja</button>
                </div>
            )}

            <form onSubmit={handleSubmit} className={styles.form} noValidate>
                {viewMode === 'register' && role !== 'admin' && (
                    <>
                        <div className={styles.fieldGroup}>
                            <input className={styles.input} type="text" placeholder="Imię i nazwisko" value={name} onChange={(e) => setName(e.target.value)} />
                        </div>
                        <div className={styles.fieldGroup}>
                            <input className={styles.input} type="text" placeholder="DD.MM.RRRR" value={dob} onChange={(e) => setDob(e.target.value)} />
                        </div>
                    </>
                )}

                <div className={styles.fieldGroup}>
                    <input className={styles.input} type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>

                {viewMode === 'reset' ? (
                    <div className={styles.fieldGroup}>
                        <input className={styles.input} type="password" placeholder="Nowe hasło (min. 8 znaków)" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
                        {fieldErrors.newPassword && <p className={styles.errorText}>{fieldErrors.newPassword}</p>}
                    </div>
                ) : (
                    <div className={styles.fieldGroup}>
                        <input className={styles.input} type="password" placeholder="Hasło" value={password} onChange={(e) => setPassword(e.target.value)} />
                        {fieldErrors.password && <p className={styles.errorText}>{fieldErrors.password}</p>}
                    </div>
                )}

                {viewMode === 'login' && (
                    <div style={{ textAlign: 'right', marginTop: '0.5rem' }}>
                        <a href="#" onClick={(e) => { e.preventDefault(); setViewMode('reset'); setError(null); setFieldErrors({}); }} style={{ fontSize: '0.85rem', color: '#007bff', textDecoration: 'none' }}>
                            Zapomniałeś hasła?
                        </a>
                    </div>
                )}

                <button className={styles.submitBtn} type="submit" disabled={loading}>
                    {loading ? "Przetwarzanie..." : 
                     viewMode === 'reset' ? "Resetuj hasło" : 
                     viewMode === 'login' ? (role === 'admin' ? "Zaloguj jako Admin" : "Zaloguj się") : 
                     "Stwórz konto"}
                </button>

                {viewMode === 'reset' && (
                    <button type="button" onClick={() => { setViewMode('login'); setError(null); setFieldErrors({}); }} style={{ marginTop: '0.5rem', background: 'none', border: 'none', color: '#666', cursor: 'pointer', textDecoration: 'underline' }}>
                        Powrót do logowania
                    </button>
                )}

                {error && <p className={styles.error}>{error}</p>}
            </form>
        </div>
    );
}

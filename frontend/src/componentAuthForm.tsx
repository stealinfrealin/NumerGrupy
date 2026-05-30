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

    const [firstName, setFirstName] = useState("");
    const [lastName, setLastName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [newPassword, setNewPassword] = useState("");
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
            const selectedDate = new Date(trimmedValue);
            const today = new Date();

            if (Number.isNaN(selectedDate.getTime())) {
                errorMessage = "Podaj prawidłową datę urodzenia.";
            } else if (selectedDate > today) {
                errorMessage = "Data urodzenia nie może być z przyszłości.";
            } else if (selectedDate.getFullYear() < 1900) {
                errorMessage = "Rok urodzenia nie może być wcześniejszy niż 1900.";
            }
            } else if (fieldName === "firstName" || fieldName === "lastName") {
            const nameRegex = /^[a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ]+(-[a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ]+)*$/;
            if (!nameRegex.test(trimmedValue)) {
                errorMessage = "Pole może zawierać tylko litery i ewentualnie myślnik.";
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
        const isEmailValid = validateField("email", email);

        const isPasswordValid =
            viewMode === "reset"
                ? validateField("newPassword", newPassword)
                : validateField("password", password);

        const isFirstNameValid =
            viewMode === "register" && role !== "admin"
                ? validateField("firstName", firstName)
                : true;

        const isLastNameValid =
            viewMode === "register" && role !== "admin"
                ? validateField("lastName", lastName)
                : true;

        const isDobValid =
            viewMode === "register" && role !== "admin"
                ? validateField("dob", dob)
                : true;

        if (
            !isEmailValid ||
            !isPasswordValid ||
            !isFirstNameValid ||
            !isLastNameValid ||
            !isDobValid
        ) {
            return;
        }

        if (viewMode === "reset") {
            setLoading(true);

            try {
                await resetPassword(email, newPassword);

                setViewMode("login");
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
                await register(`${firstName} ${lastName}`, email, password, dob);
                alert("Pomyślnie zarejestrowano Pacjenta");
                navigate("/dashboard", { replace: true }); 
            }
            setFirstName("");
            setLastName("");
            setDob("");
            setEmail("");
            setPassword("");
            setFieldErrors({});
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
                            <input
                                className={styles.input}
                                type="text"
                                placeholder="Imię"
                                value={firstName}
                                onChange={(e) => setFirstName(e.target.value)}
                            />
                            {fieldErrors.firstName && <p className={styles.errorText}>{fieldErrors.firstName}</p>}
                        </div>

                        <div className={styles.fieldGroup}>
                            <input
                                className={styles.input}
                                type="text"
                                placeholder="Nazwisko"
                                value={lastName}
                                onChange={(e) => setLastName(e.target.value)}
                            />
                            {fieldErrors.lastName && <p className={styles.errorText}>{fieldErrors.lastName}</p>}
                        </div>

                        <div className={styles.fieldGroup}>
                            <input
                                className={styles.input}
                                type="date"
                                value={dob}
                                onChange={(e) => setDob(e.target.value)}
                            />
                            {fieldErrors.dob && <p className={styles.errorText}>{fieldErrors.dob}</p>}
                        </div>
                    </>
                )}

                <div className={styles.fieldGroup}>
                    <input
                        className={styles.input}
                        type="email"
                        placeholder="Email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                    />
                    {fieldErrors.email && (
                        <p className={styles.errorText}>{fieldErrors.email}</p>
                    )}
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

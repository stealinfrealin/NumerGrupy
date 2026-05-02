import { useState, useEffect } from "react";
import { useAuth } from "./AuthContext";
import { useNavigate } from "react-router-dom";

export default function AdminDashboard() {
    const { user, logout } = useAuth();
    const navigate = useNavigate();

    const [users, setUsers] = useState<any[]>([]);
    const [doctors, setDoctors] = useState<any[]>([]);
    const [appointments, setAppointments] = useState<any[]>([]);

    const [newDoctor, setNewDoctor] = useState({ 
        imie: "", nazwisko: "", specjalizacja: "", adres: "", opis: "" 
    });

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Bezpieczna funkcja fetch z obsługą błędów i ciasteczek
    const apiFetch = async (url: string, options: RequestInit = {}) => {
        const headers = {
            "Content-Type": "application/json",
            ...(options.headers || {}),
        };

        console.log(`[API] Requesting: ${url}`);
        const response = await fetch(url, { ...options, headers, credentials: 'include' });

        if (!response.ok) {
            let errMsg = `HTTP ${response.status}`;
            try {
                const data = await response.json();
                errMsg = data.error || errMsg;
            } catch { /* Ignoruj jeśli odpowiedź nie jest JSON (np. czysty tekst 401) */ }

            console.error(`[API] Error ${response.status} for ${url}:`, errMsg);
            if (response.status === 401) navigate("/admin/login", { replace: true });
            throw new Error(errMsg);
        }

        if (response.status === 204) return null;
        return response.json();
    };

    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            setError(null);
            try {
                // Równoległe pobieranie danych
                const [usersRes, doctorsRes, apptsRes] = await Promise.all([
                    apiFetch("/api/admin/users"),
                    apiFetch("/api/doctors"), // Endpoint publiczny, nie wymaga tokena admina
                    apiFetch("/api/admin/appointments")
                ]);

                console.log("[AdminDashboard] Fetched Users:", usersRes);
                console.log("[AdminDashboard] Fetched Doctors:", doctorsRes);
                console.log("[AdminDashboard] Fetched Appointments:", apptsRes);

                // Bezpieczne przypisanie do stanu
                setUsers(usersRes?.patients || []);
                setDoctors(Array.isArray(doctorsRes) ? doctorsRes : []);
                setAppointments(Array.isArray(apptsRes) ? apptsRes : []);
            } catch (err: any) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, []);

    const handleDeleteUser = async (id: number) => {
        if (confirm("Czy na pewno chcesz usunąć tego użytkownika?")) {
            try {
                await apiFetch(`/api/admin/users/${id}`, { method: "DELETE" });
                setUsers(users.filter(u => u.id !== id));
            } catch (e: any) { alert(e.message); }
        }
    };

    const handleDeleteDoctor = async (id: number) => {
        if (confirm("Czy na pewno chcesz usunąć tego lekarza?")) {
            try {
                await apiFetch(`/api/admin/doctors/${id}`, { method: "DELETE" });
                setDoctors(doctors.filter(d => d.id !== id));
            } catch (e: any) { alert(e.message); }
        }
    };

    const handleAddDoctor = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const added = await apiFetch("/api/admin/doctors", {
                method: "POST",
                body: JSON.stringify(newDoctor)
            });
            setDoctors([...doctors, { ...newDoctor, id: added.id || Date.now() }]);
            setNewDoctor({ imie: "", nazwisko: "", specjalizacja: "", adres: "", opis: "" });
            alert("Pomyślnie dodano lekarza");
        } catch (e: any) { alert(e.message); }
    };

    const handleLogout = async () => {
        await logout();
        navigate("/admin/login", { replace: true });
    };

    if (loading) return <div style={{ padding: "2rem", textAlign: "center" }}>Ładowanie danych...</div>;
    if (error) return <div style={{ padding: "2rem", color: "red", textAlign: "center" }}>Błąd: {error}</div>;

    return (
        <div style={{ padding: "2rem", maxWidth: "1200px", margin: "0 auto", fontFamily: "sans-serif" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "2rem" }}>
                <h1>Panel Administratora</h1>
                <button onClick={handleLogout} style={{ padding: "0.5rem 1rem", background: "#ff4d4d", color: "white", border: "none", borderRadius: "4px", cursor: "pointer" }}>
                    Wyloguj się
                </button>
            </div>

            {/* SEKCJA 1: UŻYTKOWNICY */}
            <section style={{ marginBottom: "2rem", padding: "1.5rem", border: "1px solid #ddd", borderRadius: "8px", background: "#f9f9f9" }}>
                <h2>👥 Zarządzanie użytkownikami</h2>
                {users.length === 0 ? <p>Brak użytkowników.</p> : (
                    <ul style={{ listStyle: "none", padding: 0 }}>
                        {users.map(u => (
                            <li key={u.id} style={{ display: "flex", justifyContent: "space-between", padding: "0.5rem 0", borderBottom: "1px solid #eee" }}>
                                <span><strong>{u.email}</strong> ({u.imie} {u.nazwisko})</span>
                                <button onClick={() => handleDeleteUser(u.id)} style={{ color: "red", cursor: "pointer", background: "none", border: "none" }}>Usuń</button>
                            </li>
                        ))}
                    </ul>
                )}
            </section>

            {/* SEKCJA 2: LEKARZE */}
            <section style={{ marginBottom: "2rem", padding: "1.5rem", border: "1px solid #ddd", borderRadius: "8px", background: "#f9f9f9" }}>
                <h2>👨‍⚕️ Zarządzanie lekarzami</h2>
                <form onSubmit={handleAddDoctor} style={{ marginBottom: "1rem", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "0.5rem", background: "#fff", padding: "1rem", borderRadius: "4px" }}>
                    <input placeholder="Imię" value={newDoctor.imie} onChange={e => setNewDoctor({...newDoctor, imie: e.target.value})} required style={{ padding: "0.5rem" }} />
                    <input placeholder="Nazwisko" value={newDoctor.nazwisko} onChange={e => setNewDoctor({...newDoctor, nazwisko: e.target.value})} required style={{ padding: "0.5rem" }} />
                    <input placeholder="Specjalizacja" value={newDoctor.specjalizacja} onChange={e => setNewDoctor({...newDoctor, specjalizacja: e.target.value})} required style={{ padding: "0.5rem" }} />
                    <input placeholder="Adres" value={newDoctor.adres} onChange={e => setNewDoctor({...newDoctor, adres: e.target.value})} required style={{ padding: "0.5rem" }} />
                    <textarea placeholder="Opis" value={newDoctor.opis} onChange={e => setNewDoctor({...newDoctor, opis: e.target.value})} style={{ gridColumn: "span 2", padding: "0.5rem" }} />
                    <button type="submit" style={{ gridColumn: "span 2", padding: "0.5rem", cursor: "pointer", background: "#4CAF50", color: "white", border: "none", borderRadius: "4px" }}>Dodaj Lekarza</button>
                </form>

                {doctors.length === 0 ? <p>Brak lekarzy.</p> : (
                    <ul style={{ listStyle: "none", padding: 0 }}>
                        {doctors.map(d => (
                            <li key={d.id} style={{ display: "flex", justifyContent: "space-between", padding: "0.5rem 0", borderBottom: "1px solid #eee" }}>
                                <span>Dr {d.imie} {d.nazwisko} - {d.specjalizacja}</span>
                                <button onClick={() => handleDeleteDoctor(d.id)} style={{ color: "red", cursor: "pointer", background: "none", border: "none" }}>Usuń</button>
                            </li>
                        ))}
                    </ul>
                )}
            </section>

            {/* SEKCJA 3: WIZYTY */}
            <section style={{ marginBottom: "2rem", padding: "1.5rem", border: "1px solid #ddd", borderRadius: "8px", background: "#f9f9f9" }}>
                <h2>📅 Przegląd wizyt</h2>
                {appointments.length === 0 ? <p>Brak wizyt.</p> : (
                    <table style={{ width: "100%", borderCollapse: "collapse", background: "#fff" }}>
                        <thead>
                            <tr style={{ textAlign: "left", borderBottom: "2px solid #ddd" }}>
                                <th style={{ padding: "0.5rem" }}>Data</th>
                                <th style={{ padding: "0.5rem" }}>Godzina</th>
                                <th style={{ padding: "0.5rem" }}>Pacjent</th>
                                <th style={{ padding: "0.5rem" }}>Lekarz</th>
                                <th style={{ padding: "0.5rem" }}>Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            {appointments.map(a => (
                                <tr key={a.id} style={{ borderBottom: "1px solid #eee" }}>
                                    <td style={{ padding: "0.5rem" }}>{new Date(a.data).toLocaleDateString()}</td>
                                    <td style={{ padding: "0.5rem" }}>{a.godzina}</td>
                                    <td style={{ padding: "0.5rem" }}>{a.pacjent_imie} {a.pacjent_nazwisko}</td>
                                    <td style={{ padding: "0.5rem" }}>{a.lekarz_imie} {a.lekarz_nazwisko}</td>
                                    <td style={{ padding: "0.5rem" }}>{a.status}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </section>
        </div>
    );
}

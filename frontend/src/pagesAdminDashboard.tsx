import { useState, useEffect } from "react";
import { useAuth } from "./AuthContext";
import { useNavigate } from "react-router-dom";

const formatDate = (value: string) => value ? value.split("T")[0] : "";

export default function AdminDashboard() {
    const { logout } = useAuth();
    const navigate = useNavigate();

    const [users, setUsers] = useState<any[]>([]);
    const [doctors, setDoctors] = useState<any[]>([]);
    const [appointments, setAppointments] = useState<any[]>([]);

    const [newDoctor, setNewDoctor] = useState({
        imie: "", nazwisko: "", specjalizacja: "", adres: "", opis: ""
    });
    const [editUser, setEditUser] = useState<any | null>(null);
    const [editDoctor, setEditDoctor] = useState<any | null>(null);

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Bezpieczna funkcja fetch z obsługą błędów i ciasteczek
    const apiFetch = async (url: string, options: RequestInit = {}) => {
        const headers = {
            "Content-Type": "application/json",
            ...(options.headers || {}),
        };

        const response = await fetch(url, { ...options, headers, credentials: 'include' });

        if (!response.ok) {
            let errMsg = `HTTP ${response.status}`;
            try {
                const data = await response.json();
                errMsg = data.error || errMsg;
            } catch { /* Ignoruj jeśli odpowiedź nie jest JSON. */ }

            if (response.status === 401) navigate("/admin/login", { replace: true });
            throw new Error(errMsg);
        }

        if (response.status === 204) return null;
        return response.json();
    };

    const fetchData = async () => {
        setLoading(true);
        setError(null);
        try {
            const [usersRes, doctorsRes, apptsRes] = await Promise.all([
                apiFetch("/api/admin/users"),
                apiFetch("/api/admin/doctors"),
                apiFetch("/api/admin/appointments")
            ]);

            setUsers(usersRes?.patients || []);
            setDoctors(Array.isArray(doctorsRes) ? doctorsRes : []);
            setAppointments(Array.isArray(apptsRes) ? apptsRes : []);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
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

    const handleSaveUser = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editUser) return;
        try {
            await apiFetch(`/api/admin/users/${editUser.id}`, {
                method: "PUT",
                body: JSON.stringify(editUser)
            });
            setEditUser(null);
            fetchData();
        } catch (err: any) { alert(err.message); }
    };

    const handleSaveDoctor = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editDoctor) return;
        try {
            await apiFetch(`/api/admin/doctors/${editDoctor.id}`, {
                method: "PUT",
                body: JSON.stringify(editDoctor)
            });
            setEditDoctor(null);
            fetchData();
        } catch (err: any) { alert(err.message); }
    };

    const handleLogout = async () => {
        await logout();
        navigate("/admin/login", { replace: true });
    };

    if (loading) return <div className="page-shell">Ładowanie danych...</div>;
    if (error) return <div className="page-shell"><p className="alert error">Błąd: {error}</p></div>;

    return (
        <div className="page-shell">
            <div className="panel-header">
                <h1>Panel Administratora</h1>
                <button onClick={handleLogout} className="btn danger">Wyloguj się</button>
            </div>

            <section className="panel-card">
                <h2>Zarządzanie użytkownikami</h2>
                {users.length === 0 ? <p>Brak użytkowników.</p> : (
                    <div className="table-wrap">
                        <table>
                            <thead><tr><th>Imię</th><th>Nazwisko</th><th>Email</th><th>Akcje</th></tr></thead>
                            <tbody>
                                {users.map(u => (
                                    <tr key={u.id}>
                                        <td>{u.imie}</td>
                                        <td>{u.nazwisko}</td>
                                        <td>{u.email}</td>
                                        <td className="actions">
                                            <button className="btn small" onClick={() => setEditUser({ ...u, data_urodzenia: formatDate(u.data_urodzenia), haslo: "" })}>Edytuj</button>
                                            <button className="btn small danger-light" onClick={() => handleDeleteUser(u.id)}>Usuń</button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                {editUser && (
                    <form onSubmit={handleSaveUser} className="edit-box">
                        <h3>Edycja użytkownika</h3>
                        <div className="form-grid">
                            <input placeholder="Imię" value={editUser.imie || ""} onChange={e => setEditUser({...editUser, imie: e.target.value})} />
                            <input placeholder="Nazwisko" value={editUser.nazwisko || ""} onChange={e => setEditUser({...editUser, nazwisko: e.target.value})} />
                            <input type="email" placeholder="Email" value={editUser.email || ""} onChange={e => setEditUser({...editUser, email: e.target.value})} />
                            <input type="date" value={editUser.data_urodzenia || ""} onChange={e => setEditUser({...editUser, data_urodzenia: e.target.value})} />
                            <input type="password" placeholder="Nowe hasło opcjonalnie" value={editUser.haslo || ""} onChange={e => setEditUser({...editUser, haslo: e.target.value})} />
                        </div>
                        <div className="actions">
                            <button className="btn" type="submit">Zapisz</button>
                            <button className="btn danger-light" type="button" onClick={() => setEditUser(null)}>Anuluj</button>
                        </div>
                    </form>
                )}
            </section>

            <section className="panel-card">
                <h2>Zarządzanie lekarzami</h2>
                <form onSubmit={handleAddDoctor} className="edit-box">
                    <h3>Dodaj lekarza</h3>
                    <div className="form-grid">
                        <input placeholder="Imię" value={newDoctor.imie} onChange={e => setNewDoctor({...newDoctor, imie: e.target.value})} required />
                        <input placeholder="Nazwisko" value={newDoctor.nazwisko} onChange={e => setNewDoctor({...newDoctor, nazwisko: e.target.value})} required />
                        <input placeholder="Specjalizacja" value={newDoctor.specjalizacja} onChange={e => setNewDoctor({...newDoctor, specjalizacja: e.target.value})} required />
                        <input placeholder="Adres" value={newDoctor.adres} onChange={e => setNewDoctor({...newDoctor, adres: e.target.value})} required />
                        <textarea placeholder="Opis" value={newDoctor.opis} onChange={e => setNewDoctor({...newDoctor, opis: e.target.value})} />
                    </div>
                    <button type="submit" className="btn success">Dodaj lekarza</button>
                </form>

                {doctors.length === 0 ? <p>Brak lekarzy.</p> : (
                    <div className="table-wrap">
                        <table>
                            <thead><tr><th>Lekarz</th><th>Specjalizacja</th><th>Adres</th><th>Akcje</th></tr></thead>
                            <tbody>
                                {doctors.map(d => (
                                    <tr key={d.id}>
                                        <td>{d.imie} {d.nazwisko}</td>
                                        <td>{d.specjalizacja}</td>
                                        <td>{d.adres}</td>
                                        <td className="actions">
                                            <button className="btn small" onClick={() => setEditDoctor(d)}>Edytuj</button>
                                            <button className="btn small danger-light" onClick={() => handleDeleteDoctor(d.id)}>Usuń</button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                {editDoctor && (
                    <form onSubmit={handleSaveDoctor} className="edit-box">
                        <h3>Edycja lekarza</h3>
                        <div className="form-grid">
                            <input placeholder="Imię" value={editDoctor.imie || ""} onChange={e => setEditDoctor({...editDoctor, imie: e.target.value})} />
                            <input placeholder="Nazwisko" value={editDoctor.nazwisko || ""} onChange={e => setEditDoctor({...editDoctor, nazwisko: e.target.value})} />
                            <input placeholder="Specjalizacja" value={editDoctor.specjalizacja || ""} onChange={e => setEditDoctor({...editDoctor, specjalizacja: e.target.value})} />
                            <input placeholder="Adres" value={editDoctor.adres || ""} onChange={e => setEditDoctor({...editDoctor, adres: e.target.value})} />
                            <textarea placeholder="Opis" value={editDoctor.opis || ""} onChange={e => setEditDoctor({...editDoctor, opis: e.target.value})} />
                        </div>
                        <div className="actions">
                            <button className="btn" type="submit">Zapisz</button>
                            <button className="btn danger-light" type="button" onClick={() => setEditDoctor(null)}>Anuluj</button>
                        </div>
                    </form>
                )}
            </section>

            <section className="panel-card">
                <h2>Przegląd wizyt</h2>
                {appointments.length === 0 ? <p>Brak wizyt.</p> : (
                    <div className="table-wrap">
                        <table>
                            <thead>
                                <tr>
                                    <th>Data</th><th>Godzina</th><th>Pacjent</th><th>Lekarz</th><th>Usługa</th><th>Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {appointments.map(a => (
                                    <tr key={a.id}>
                                        <td>{formatDate(a.data)}</td>
                                        <td>{String(a.godzina).substring(0, 5)}</td>
                                        <td>{a.pacjent_imie} {a.pacjent_nazwisko}</td>
                                        <td>{a.lekarz_imie} {a.lekarz_nazwisko}</td>
                                        <td>{a.usluga_nazwa || "Brak"}</td>
                                        <td>{a.status}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>
        </div>
    );
}

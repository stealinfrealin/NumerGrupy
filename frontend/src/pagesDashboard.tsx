import { useState, useEffect } from "react";
import { useAuth } from "./AuthContext";
import { useNavigate } from "react-router-dom";

// Typy
interface Appointment { id: number; data: string; godzina: string; status: string; lekarz_imie: string; lekarz_nazwisko: string; specjalizacja: string; }
interface Doctor { id: number; imie: string; nazwisko: string; specjalizacja: string; opis: string; srednia_ocen: number; }
interface Termin { id: number; data: string; godzina: string; dostepny: boolean; }

export default function PatientDashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<"appointments" | "search" | "booking">("appointments");

  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [selectedDoctor, setSelectedDoctor] = useState<Doctor | null>(null);
  const [terminy, setTerminy] = useState<Termin[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ratingModal, setRatingModal] = useState<{ open: boolean; appointmentId: number | null }>({ open: false, appointmentId: null });
  const [ratingValue, setRatingValue] = useState(5);

  // 🛡️ GUARD: Nie renderuj nic, dopóki user nie zostanie potwierdzony
  if (!user) return <div style={{ padding: "2rem", textAlign: "center" }}>⏳ Ładowanie profilu pacjenta...</div>;

  useEffect(() => {
    if (activeTab === "appointments") fetchAppointments();
  }, [activeTab]);

  const fetchAppointments = async () => {
	if (!user) return;
	setLoading(true); setError(null);
	try {
	const res = await fetch(`/api/patients/${user.id}/appointments`, { credentials: "include" });
	if (res.ok) setAppointments(await res.json());
	else setError("Nie udało się pobrać wizyt.");
	} catch { setError("Błąd połączenia z serwerem."); }
	setLoading(false);
  };

  const searchDoctors = async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetch(`/api/doctors?search=${encodeURIComponent(searchQuery)}`, { credentials: "include" });
      if (res.ok) setDoctors(await res.json());
    } catch { setError("Błąd wyszukiwania."); }
    setLoading(false);
  };

  const fetchTerminy = async (doctorId: number) => {
	setLoading(true);
	try {
		const res = await fetch(`/api/doctors/${doctorId}/availability`, { credentials: "include" });
		if (res.ok) setTerminy(await res.json());
	} catch { setError("Błąd pobierania terminów."); }
	setLoading(false);
  };

  const handleBook = async (terminId: number) => {
	if (!user) return;
	setLoading(true);
	try {
	const res = await fetch("/api/appointments", {
	  method: "POST",
	  headers: { "Content-Type": "application/json" },
	  credentials: "include",
	  body: JSON.stringify({ pacjent_id: user.id, termin_id: terminId })
	});
	const data = await res.json();
	if (res.ok) {
	  alert("✅ Wizyta zarezerwowana pomyślnie!");
	  setActiveTab("appointments");
	  fetchAppointments();
	} else {
	  alert(`❌ ${data.error || "Nie udało się zarezerwować wizyty."}`);
	}
	} catch { alert("Błąd sieci podczas rezerwacji."); }
	setLoading(false);
  };

  const handleCancel = async (id: number) => {
    if (!confirm("Anulować wizytę?")) return;
    try {
      const res = await fetch(`/api/appointments/${id}/cancel`, { method: "PUT", credentials: "include" });
      if (res.ok) { alert("Wizyta anulowana."); fetchAppointments(); }
      else alert("Nie udało się anulować.");
    } catch { alert("Błąd anulowania."); }
  };

  const submitRating = async () => {
	if (!ratingModal.appointmentId || !user) return;

	// Znajdź lekarz_id na podstawie zarezerwowanej wizyty
	const appt = appointments.find(a => a.id === ratingModal.appointmentId);
	if (!appt || !appt.lekarz_id) {
	  alert("Nie znaleziono danych lekarza do oceny. Odśwież stronę.");
	  return;
	}

	try {
	const res = await fetch("/api/reviews", {
	  method: "POST",
	  headers: { "Content-Type": "application/json" },
	  credentials: "include",
	  body: JSON.stringify({ pacjent_id: user.id, lekarz_id: appt.lekarz_id, wartosc: ratingValue })
	});
	if (res.ok) {
	  alert("Dziękujemy za ocenę!");
	  setRatingModal({ open: false, appointmentId: null });
	  fetchAppointments();
	}
	} catch { alert("Błąd wysyłania oceny."); }
  };

  // --- RENDER ---
  return (
    <div style={{ padding: "2rem", maxWidth: "1000px", margin: "0 auto", fontFamily: "system-ui, sans-serif" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
        <div>
          <h1 style={{ margin: 0 }}>Panel Pacjenta</h1>
          <p style={{ margin: "0.25rem 0 0", color: "#555" }}>Zalogowano jako: <strong>{user.email}</strong></p>
        </div>
        <button onClick={() => { logout(); navigate("/login"); }} style={{ padding: "0.5rem 1rem", cursor: "pointer", background: "#ff4d4d", color: "white", border: "none", borderRadius: "4px" }}>Wyloguj się</button>
      </header>

      <nav style={{ display: "flex", gap: "0.5rem", marginBottom: "1.5rem", borderBottom: "1px solid #ddd", paddingBottom: "0.5rem" }}>
        {(["appointments", "search", "booking"] as const).map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)} style={{ padding: "0.5rem 1rem", border: "none", background: activeTab === tab ? "#007bff" : "#f0f0f0", color: activeTab === tab ? "white" : "#333", borderRadius: "4px", cursor: "pointer" }}>
            {tab === "appointments" ? "Moje wizyty" : tab === "search" ? "Znajdź lekarza" : "Zarezerwuj wizytę"}
          </button>
        ))}
      </nav>

      {error && <p style={{ color: "red", background: "#ffe6e6", padding: "0.5rem", borderRadius: "4px" }}>{error}</p>}
      {loading && <p style={{ color: "#666" }}>⏳ Ładowanie...</p>}

      {activeTab === "appointments" && (
        <section>
          <h2>Historia i nadchodzące wizyty</h2>
          {appointments.length === 0 ? <p>Brak zaplanowanych wizyt.</p> : (
            <table style={{ width: "100%", borderCollapse: "collapse", marginTop: "1rem" }}>
              <thead><tr style={{ background: "#f8f9fa", textAlign: "left" }}>
                <th style={{ padding: "0.5rem", borderBottom: "2px solid #ddd" }}>Data</th>
                <th style={{ padding: "0.5rem", borderBottom: "2px solid #ddd" }}>Godzina</th>
                <th style={{ padding: "0.5rem", borderBottom: "2px solid #ddd" }}>Lekarz</th>
                <th style={{ padding: "0.5rem", borderBottom: "2px solid #ddd" }}>Status</th>
                <th style={{ padding: "0.5rem", borderBottom: "2px solid #ddd" }}>Akcje</th>
              </tr></thead>
              <tbody>
                {appointments.map(appt => (
                  <tr key={appt.id} style={{ borderBottom: "1px solid #eee" }}>
                    <td style={{ padding: "0.5rem" }}>{appt.data}</td>
                    <td style={{ padding: "0.5rem" }}>{appt.godzina}</td>
                    <td style={{ padding: "0.5rem" }}>{appt.lekarz_imie} {appt.lekarz_nazwisko} ({appt.specjalizacja})</td>
                    <td style={{ padding: "0.5rem" }}><span style={{ padding: "0.2rem 0.5rem", borderRadius: "12px", background: appt.status === "Potwierdzona" ? "#d4edda" : appt.status === "Anulowana" ? "#f8d7da" : "#fff3cd", color: "#333", fontSize: "0.85rem" }}>{appt.status}</span></td>
                    <td style={{ padding: "0.5rem" }}>
                      {appt.status === "Zarezerwowana" && (<>
                        <button onClick={() => handleCancel(appt.id)} style={{ marginRight: "0.5rem", cursor: "pointer" }}>Anuluj</button>
                        <button onClick={() => setRatingModal({ open: true, appointmentId: appt.id })} style={{ cursor: "pointer" }}>Oceń</button>
                      </>)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}

      {activeTab === "search" && (
        <section>
          <h2>Wyszukiwanie lekarza</h2>
          <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
            <input type="text" placeholder="Specjalizacja lub nazwisko..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} style={{ flex: 1, padding: "0.5rem", borderRadius: "4px", border: "1px solid #ccc" }} />
            <button onClick={searchDoctors} style={{ padding: "0.5rem 1rem", cursor: "pointer" }}>Szukaj</button>
          </div>
          <div style={{ display: "grid", gap: "1rem" }}>
            {doctors.map(doc => (
              <div key={doc.id} style={{ padding: "1rem", border: "1px solid #ddd", borderRadius: "8px", cursor: "pointer" }} onClick={() => { setSelectedDoctor(doc); fetchTerminy(doc.id); setActiveTab("booking"); }}>
                <h3 style={{ margin: "0 0 0.5rem" }}>{doc.imie} {doc.nazwisko}</h3>
                <p style={{ margin: "0 0 0.25rem", color: "#007bff" }}>{doc.specjalizacja}</p>
                <p style={{ margin: "0 0 0.25rem", fontSize: "0.9rem", color: "#555" }}>{doc.opis}</p>
                <p style={{ margin: 0, fontSize: "0.85rem" }}>⭐ Średnia ocen: {doc.srednia_ocen?.toFixed(1) || "Brak"}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {activeTab === "booking" && (
        <section>
          <h2>Rezerwacja wizyty {selectedDoctor ? `u: ${selectedDoctor.imie} ${selectedDoctor.nazwisko}` : ""}</h2>
          {!selectedDoctor ? <p>Wybierz lekarza z zakładki "Znajdź lekarza".</p> : terminy.length === 0 ? <p>Brak dostępnych terminów.</p> : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: "0.5rem" }}>
              {terminy.map(t => (
                <button key={t.id} disabled={!t.dostepny || loading} onClick={() => handleBook(t.id)} style={{ padding: "0.75rem", cursor: t.dostepny ? "pointer" : "not-allowed", background: t.dostepny ? "#28a745" : "#ccc", color: "white", border: "none", borderRadius: "4px" }}>
                  {t.data} {t.godzina}
                </button>
              ))}
            </div>
          )}
        </section>
      )}

      {ratingModal.open && (
        <div style={{ position: "fixed", top: 0, left: 0, width: "100%", height: "100%", background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: "white", padding: "1.5rem", borderRadius: "8px", minWidth: "300px" }}>
            <h3>Oceń wizytę</h3>
            <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
              {[1,2,3,4,5].map(v => (<button key={v} onClick={() => setRatingValue(v)} style={{ padding: "0.5rem 0.75rem", border: ratingValue === v ? "2px solid #007bff" : "1px solid #ccc", background: ratingValue === v ? "#e7f1ff" : "white", borderRadius: "4px", cursor: "pointer" }}>{v} ⭐</button>))}
            </div>
            <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
              <button onClick={() => setRatingModal({ open: false, appointmentId: null })} style={{ padding: "0.5rem 1rem", cursor: "pointer" }}>Anuluj</button>
              <button onClick={submitRating} style={{ padding: "0.5rem 1rem", cursor: "pointer", background: "#007bff", color: "white", border: "none", borderRadius: "4px" }}>Wyślij</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

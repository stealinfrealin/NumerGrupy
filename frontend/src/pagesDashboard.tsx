import { useState, useEffect } from "react";
import { useAuth } from "./AuthContext";
import { useNavigate } from "react-router-dom";

// Typy
interface Appointment {
  id: number;
  data: string;
  godzina: string;
  status: string;
  lekarz_id: number;
  lekarz_imie: string;
  lekarz_nazwisko: string;
  specjalizacja: string;
  ocena_id?: number | null;
  ocena_wartosc?: number | null;
  ocena_komentarz?: string | null;
}
interface Doctor { id: number; imie: string; nazwisko: string; specjalizacja: string; adres: string; opis: string; srednia_ocen?: number | string | null; }
interface Termin {
  id: number;
  data: string;
  godzina: string;
  dostepny: boolean;
  lekarz_id: number;
}

export default function PatientDashboard() {
  const { user, logout } = useAuth();

  console.log("Dashboard render");
  console.log("Dashboard user:", user);

  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<"appointments" | "search" | "booking">("appointments");

  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [appointmentView, setAppointmentView] = useState<"upcoming" | "history">("upcoming");
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [selectedDoctor, setSelectedDoctor] = useState<Doctor | null>(null);
  const [terminy, setTerminy] = useState<Termin[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ratingModal, setRatingModal] = useState<{ open: boolean; appointmentId: number | null }>({ open: false, appointmentId: null });
  const [rescheduleModal, setRescheduleModal] = useState<{
    open: boolean;
    appointmentId: number | null;
    doctorId: number | null;
  }>({
    open: false,
    appointmentId: null,
    doctorId: null
  });
  const [ratingValue, setRatingValue] = useState(5);

  const [specializationQuery, setSpecializationQuery] = useState("");
  const [cityQuery, setCityQuery] = useState("");
  const [lastNameQuery, setLastNameQuery] = useState("");
  const [sortBy, setSortBy] = useState("nazwisko");
  const [sortOrder, setSortOrder] = useState("ASC");
  const [availableTerminy, setAvailableTerminy] = useState<Termin[]>([]);
  const [selectedNewTerminId, setSelectedNewTerminId] = useState<number | null>(null);


  // 🛡️ GUARD: Nie renderuj nic, dopóki user nie zostanie potwierdzony
  if (!user) return <div style={{ padding: "2rem", textAlign: "center" }}>⏳ Ładowanie profilu pacjenta...</div>;

  useEffect(() => {
    if (activeTab === "search") {
      searchDoctors();
    }
  }, [sortBy, sortOrder]);

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
  setLoading(true);
  setError(null);

  const params = new URLSearchParams();

  if (specializationQuery.trim()) {
    params.append("specjalizacja", specializationQuery.trim());
  }

  if (cityQuery.trim()) {
    params.append("miasto", cityQuery.trim());
  }

  if (lastNameQuery.trim()) {
    params.append("nazwisko", lastNameQuery.trim());
  }

  params.append("sortBy", sortBy);
  params.append("order", sortOrder);

  try {
    const res = await fetch(`/api/doctors?${params.toString()}`, {
      credentials: "include",
    });

    if (res.ok) {
      setDoctors(await res.json());
    } else {
      setError("Nie udało się wyszukać lekarzy.");
    }
  } catch {
    setError("Błąd wyszukiwania.");
  }

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

  const openRescheduleModal = async (appointmentId: number, doctorId: number) => {
    setRescheduleModal({
      open: true,
      appointmentId,
      doctorId
    });

    setSelectedNewTerminId(null);

    try {
      const res = await fetch(`/api/doctors/${doctorId}/availability`, {
        credentials: "include"
      });

      if (!res.ok) {
        alert("Nie udało się pobrać dostępnych terminów.");
        return;
      }

      const data: Termin[] = await res.json();

      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(0, 0, 0, 0);

      const futureTerminy = data.filter((termin) => {
        const terminDate = new Date(termin.data);
        return terminDate >= tomorrow;
      });

      setAvailableTerminy(futureTerminy);
    } catch {
      alert("Błąd pobierania terminów.");
    }
  };

  const handleReschedule = async () => {
    if (!rescheduleModal.appointmentId || !selectedNewTerminId) {
      alert("Wybierz nowy termin.");
      return;
    }

    try {
      const res = await fetch(`/api/appointments/${rescheduleModal.appointmentId}/reschedule`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          nowy_termin_id: selectedNewTerminId
        })
      });

      if (res.ok) {
        alert("Termin wizyty został zmieniony.");

        setRescheduleModal({
          open: false,
          appointmentId: null,
          doctorId: null
        });

        setSelectedNewTerminId(null);
        setAvailableTerminy([]);
        fetchAppointments();
      } else {
        alert("Nie udało się zmienić terminu.");
      }
    } catch {
      alert("Błąd zmiany terminu.");
    }
  };

  const submitRating = async () => {
    if (!ratingModal.appointmentId || !user) return;

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
        body: JSON.stringify({
          pacjent_id: user.id,
          lekarz_id: appt.lekarz_id,
          wartosc: ratingValue
        })
      });

      const data = await res.json().catch(() => ({}));

      if (res.ok) {
        alert("Dziękujemy za ocenę!");
        setRatingModal({ open: false, appointmentId: null });
        setRatingValue(5);
        fetchAppointments();
      } else {
        alert(data.error || "Nie udało się wystawić oceny.");
      }
    } catch {
      alert("Błąd wysyłania oceny.");
    }
  };

  const upcomingAppointments = appointments.filter(
    a => a.status === "Zarezerwowana" || a.status === "Potwierdzona"
  );

  const historyAppointments = appointments.filter(
    a => a.status === "Anulowana" || a.status === "Odbyta"
  );

  const pageTitle = 
  activeTab === "appointments"
    ? "Moje wizyty"
    : activeTab === "search"
    ? "Znajdź lekarza"
    : "Zarezerwuj wizytę";



  // --- RENDER ---
  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#f6f8fb", fontFamily: "system-ui, sans-serif" }}>
      <aside style={{
        width: "260px",
        padding: "2rem 1.25rem",
        background: "white",
        borderRight: "1px solid #e5e7eb",
        boxShadow: "0 4px 16px rgba(0,0,0,0.06)"
      }}>
        <h2 style={{ margin: "0 0 2rem", fontSize: "1.75rem" }}>mDoktor</h2>

      <div
        style={{
          marginBottom: "2rem",
          paddingBottom: "1rem",
          borderBottom: "1px solid #e5e7eb"
        }}
      >
        <div
          style={{
            fontSize: "0.85rem",
            color: "#666",
            marginBottom: "0.35rem"
          }}
        >
          Zalogowano jako:
        </div>

        <div
          style={{
            fontWeight: 600,
            wordBreak: "break-word"
          }}
        >
          {user?.email}
        </div>
      </div>

        <nav style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {(["appointments", "search", "booking"] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                padding: "0.85rem 1rem",
                border: "none",
                borderRadius: "8px",
                cursor: "pointer",
                textAlign: "left",
                fontSize: "1rem",
                background: activeTab === tab ? "#007bff" : "#f1f3f5",
                color: activeTab === tab ? "white" : "#333"
              }}
            >
              {tab === "appointments" ? "Moje wizyty" : tab === "search" ? "Znajdź lekarza" : "Zarezerwuj wizytę"}
            </button>
          ))}
        </nav>

        <button
          onClick={() => { logout(); navigate("/login"); }}
          style={{
            marginTop: "2rem",
            width: "100%",
            padding: "0.85rem 1rem",
            cursor: "pointer",
            background: "#fff",
            color: "#ff4d4d",
            border: "1px solid #ff4d4d",
            borderRadius: "8px"
          }}
        >
          Wyloguj się
        </button>
      </aside>

      <main style={{ flex: 1, padding: "2.5rem" }}>
        <header style={{ marginBottom: "2rem" }}>
          <h1 style={{ margin: 0 }}>{pageTitle}</h1>
        </header>

        {error && <p style={{ color: "red", background: "#ffe6e6", padding: "0.5rem", borderRadius: "4px" }}>{error}</p>}
        {loading && <p style={{ color: "#666" }}>⏳ Ładowanie...</p>}

        {activeTab === "appointments" && (
          <section>
            <div style={{
              display: "flex",
              gap: "1.5rem",
              borderBottom: "1px solid #ddd",
              marginBottom: "1.5rem"
            }}>
              <button
                onClick={() => setAppointmentView("upcoming")}
                style={{
                  padding: "0.75rem 0",
                  border: "none",
                  borderBottom: appointmentView === "upcoming" ? "3px solid #007bff" : "3px solid transparent",
                  background: "transparent",
                  color: appointmentView === "upcoming" ? "#007bff" : "#555",
                  fontWeight: appointmentView === "upcoming" ? 600 : 400,
                  cursor: "pointer",
                  fontSize: "1rem"
                }}
              >
                Nadchodzące wizyty
              </button>

              <button
                onClick={() => setAppointmentView("history")}
                style={{
                  padding: "0.75rem 0",
                  border: "none",
                  borderBottom: appointmentView === "history" ? "3px solid #007bff" : "3px solid transparent",
                  background: "transparent",
                  color: appointmentView === "history" ? "#007bff" : "#555",
                  fontWeight: appointmentView === "history" ? 600 : 400,
                  cursor: "pointer",
                  fontSize: "1rem"
                }}
              >
                Historia wizyt
              </button>
            </div>
            {appointments.length === 0 ? <p>Brak zaplanowanych wizyt.</p> : (
              <table style={{ width: "100%", borderCollapse: "collapse", marginTop: "1rem" }}>
                <thead><tr style={{ background: "#f8f9fa", textAlign: "left" }}>
                  <th style={{ padding: "0.5rem", borderBottom: "2px solid #ddd" }}>Data</th>
                  <th style={{ padding: "0.5rem", borderBottom: "2px solid #ddd" }}>Godzina</th>
                  <th style={{ padding: "0.5rem", borderBottom: "2px solid #ddd" }}>Lekarz</th>
                  <th style={{ padding: "0.5rem", borderBottom: "2px solid #ddd" }}>Usługa</th>
                  <th style={{ padding: "0.5rem", borderBottom: "2px solid #ddd" }}>Status</th>
                  <th style={{ padding: "0.5rem", borderBottom: "2px solid #ddd" }}>Akcje</th>
                </tr></thead>
                <tbody>
                  {(appointmentView === "upcoming" ? upcomingAppointments : historyAppointments).map(appt => (
                    <tr key={appt.id} style={{ borderBottom: "1px solid #eee" }}>
                      <td style={{ padding: "0.5rem" }}>{appt.data}</td>
                      <td style={{ padding: "0.5rem" }}>{appt.godzina}</td>
                      <td style={{ padding: "0.5rem" }}>{appt.lekarz_imie} {appt.lekarz_nazwisko}</td>
                      <td style={{ padding: "0.5rem" }}>{appt.specjalizacja}</td>
                      <td style={{ padding: "0.5rem" }}><span style={{ padding: "0.2rem 0.5rem", borderRadius: "12px", background: appt.status === "Potwierdzona" ? "#d4edda" : appt.status === "Anulowana" ? "#f8d7da" : "#fff3cd", color: "#333", fontSize: "0.85rem" }}>{appt.status}</span></td>
                      <td style={{ padding: "0.5rem" }}>
                     {(appt.status === "Zarezerwowana" || appt.status === "Potwierdzona") && (
                      <>
                        <button
                          onClick={() => handleCancel(appt.id)}
                          style={{
                            marginRight: "0.5rem",
                            padding: "0.45rem 0.9rem",
                            cursor: "pointer",
                            background: "white",
                            color: "#ff4d4d",
                            border: "1px solid #ff4d4d",
                            borderRadius: "6px",
                            fontWeight: 500
                          }}
                        >
                          Anuluj
                        </button>

                        <button
                          onClick={() => openRescheduleModal(appt.id, appt.lekarz_id)}
                          style={{
                            marginRight: "0.5rem",
                            padding: "0.45rem 0.9rem",
                            cursor: "pointer",
                            background: "#007bff",
                            color: "white",
                            border: "none",
                            borderRadius: "6px",
                            fontWeight: 500
                          }}
                        >
                          Zmień termin
                        </button>
                      </>
                    )}

                    {(appt.status === "Odbyta" || appt.status === "Anulowana") && (
                      <>
                        {appt.ocena_wartosc ? (
                          <span>Twoja ocena: ⭐ {appt.ocena_wartosc}/5</span>
                        ) : (
                          <button
                            onClick={() => setRatingModal({ open: true, appointmentId: appt.id })}
                            style={{
                              padding: "0.45rem 0.9rem",
                              cursor: "pointer",
                              background: "#007bff",
                              color: "white",
                              border: "none",
                              borderRadius: "6px",
                              fontWeight: 500
                            }}
                          >
                            Wystaw ocenę
                          </button>
                        )}
                      </>
                    )}



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
              <input type="text" placeholder="Specjalizacja, np. Kardiolog" value={specializationQuery} onChange={e => setSpecializationQuery(e.target.value)} style={{ flex: 1, padding: "0.5rem", borderRadius: "4px", border: "1px solid #ccc" }}/>
              <input type="text" placeholder="Miasto, np. Warszawa" value={cityQuery} onChange={e => setCityQuery(e.target.value)} style={{ flex: 1, padding: "0.5rem", borderRadius: "4px", border: "1px solid #ccc" }}/>
              <input type="text" placeholder="Nazwisko, np. Kowalski" value={lastNameQuery} onChange={e => setLastNameQuery(e.target.value)} style={{ flex: 1, padding: "0.5rem", borderRadius: "4px", border: "1px solid #ccc" }}/>
              <select value={`${sortBy}-${sortOrder}`} onChange={(e) => { const [newSortBy, newSortOrder] = e.target.value.split("-"); setSortBy(newSortBy); setSortOrder(newSortOrder); }} style={{ padding: "0.5rem", borderRadius: "4px", border: "1px solid #ccc" }}> <option value="nazwisko-ASC">Nazwisko A-Z</option> <option value="nazwisko-DESC">Nazwisko Z-A</option> <option value="specjalizacja-ASC">Specjalizacja A-Z</option> <option value="specjalizacja-DESC">Specjalizacja Z-A</option> </select>
              <button onClick={searchDoctors} style={{ padding: "0.5rem 1rem", cursor: "pointer" }}>Szukaj</button>
            </div>
            <div style={{ display: "grid", gap: "1rem" }}>
              {doctors.length === 0 && !loading && ( <p>Brak lekarzy spełniających podane kryteria.</p> )}
              {doctors.map(doc => (
                <div key={doc.id} style={{ padding: "1rem", border: "1px solid #ddd", borderRadius: "8px", cursor: "pointer" }} onClick={() => { setSelectedDoctor(doc); fetchTerminy(doc.id); setActiveTab("booking"); }}>
                  <h3 style={{ margin: "0 0 0.5rem" }}>{doc.imie} {doc.nazwisko}</h3>
                  <p style={{ margin: "0 0 0.25rem", color: "#007bff" }}>{doc.specjalizacja}</p>
                  <p style={{ margin: "0 0 0.25rem", fontSize: "0.9rem", color: "#555" }}>Adres: {doc.adres}</p>
                  <p style={{ margin: "0 0 0.25rem", fontSize: "0.9rem", color: "#555" }}>{doc.opis}</p>
                  <p style={{ margin: 0, fontSize: "0.85rem" }}>⭐ Średnia ocen: {doc.srednia_ocen ? Number(doc.srednia_ocen).toFixed(1) : "Brak"}</p>
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

        {rescheduleModal.open && (
          <div
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,0.35)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 1000
            }}
          >
            <div
              style={{
                background: "white",
                padding: "1.5rem",
                borderRadius: "12px",
                width: "420px",
                boxShadow: "0 10px 30px rgba(0,0,0,0.2)"
              }}
            >
              <h3 style={{ marginTop: 0 }}>Zmień termin wizyty</h3>

              {availableTerminy.length === 0 ? (
                <p>Brak dostępnych terminów.</p>
              ) : (
                <select
                  value={selectedNewTerminId ?? ""}
                  onChange={(e) => setSelectedNewTerminId(Number(e.target.value))}
                  style={{
                    width: "100%",
                    padding: "0.6rem",
                    borderRadius: "6px",
                    border: "1px solid #ccc",
                    marginBottom: "1rem"
                  }}
                >
                  <option value="">Wybierz nowy termin</option>

                  {availableTerminy.map((termin) => (
                    <option key={termin.id} value={termin.id}>
                      {termin.data} {termin.godzina}
                    </option>
                  ))}
                </select>
              )}

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem" }}>
                <button
                  onClick={() => {
                    setRescheduleModal({
                      open: false,
                      appointmentId: null,
                      doctorId: null
                    });
                    setSelectedNewTerminId(null);
                    setAvailableTerminy([]);
                  }}
                  style={{
                    padding: "0.5rem 0.9rem",
                    borderRadius: "6px",
                    border: "1px solid #ccc",
                    background: "white",
                    cursor: "pointer"
                  }}
                >
                  Anuluj
                </button>

                <button
                  onClick={handleReschedule}
                  style={{
                    padding: "0.5rem 0.9rem",
                    borderRadius: "6px",
                    border: "none",
                    background: "#007bff",
                    color: "white",
                    cursor: "pointer"
                  }}
                >
                  Zatwierdź
                </button>
              </div>
            </div>
          </div>
        )}

      </main>  
    </div>
  );
}

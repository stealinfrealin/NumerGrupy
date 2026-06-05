import { Fragment, useState, useEffect } from "react";
import { useAuth } from "./AuthContext";
import { useNavigate } from "react-router-dom";

interface Appointment {
  id: number;
  data: string;
  godzina: string;
  status: string;
  lekarz_id: number;
  lekarz_imie: string;
  lekarz_nazwisko: string;
  specjalizacja: string;
  usluga_id?: number;
  usluga_nazwa?: string;
}

interface Doctor {
  id: number;
  imie: string;
  nazwisko: string;
  specjalizacja: string;
  adres: string;
  opis: string;
  srednia_ocen: number;
  services?: Service[];
  reviews?: Review[];
}

interface Service {
  id: number;
  nazwa: string;
  opis: string;
  cena: number;
}

interface Review {
  id: number;
  wartosc: number;
  komentarz: string;
  pacjent_imie: string;
}

interface Termin {
  id: number;
  data: string;
  godzina: string;
  dostepny: boolean;
  lekarz_id: number;
  usluga_id?: number;
  usluga_nazwa?: string;
}

interface PatientProfile {
  imie: string;
  nazwisko: string;
  email: string;
  data_urodzenia: string;
}

const formatDate = (value: string) => value ? value.split("T")[0] : "";
const formatTime = (value: string) => value ? value.substring(0, 5) : "";
const isCancelled = (status: string) => status.toLowerCase() === "anulowana";

export default function PatientDashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<"appointments" | "search" | "profile">("appointments");

  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [selectedDoctor, setSelectedDoctor] = useState<Doctor | null>(null);
  const [terminy, setTerminy] = useState<Termin[]>([]);
  const [selectedServiceId, setSelectedServiceId] = useState<number | "">("");
  const [selectedTerminId, setSelectedTerminId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [hasSearchedDoctors, setHasSearchedDoctors] = useState(false);
  const [patientProfile, setPatientProfile] = useState<PatientProfile>({ imie: "", nazwisko: "", email: "", data_urodzenia: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ratingModal, setRatingModal] = useState<{ open: boolean; appointmentId: number | null }>({ open: false, appointmentId: null });
  const [ratingValue, setRatingValue] = useState(5);
  const [ratingComment, setRatingComment] = useState("");
  const [reschedule, setReschedule] = useState<{ open: boolean; appointment: Appointment | null; terminId: number | null }>({ open: false, appointment: null, terminId: null });

  const [specializationQuery, setSpecializationQuery] = useState("");
  const [cityQuery, setCityQuery] = useState("");
  const [lastNameQuery, setLastNameQuery] = useState("");
  const [sortBy, setSortBy] = useState("nazwisko");
  const [sortOrder, setSortOrder] = useState("ASC");

  useEffect(() => {
    if (user) {
      fetchAppointments();
      fetchPatientProfile();
    }
  }, [user]);

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

  const fetchPatientProfile = async () => {
    if (!user) return;
    try {
      const res = await fetch(`/api/patients/${user.id}`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setPatientProfile({ ...data, data_urodzenia: formatDate(data.data_urodzenia) });
      }
    } catch { /* Profil nie blokuje reszty panelu. */ }
  };

  const searchDoctors = async (
    customSortBy = sortBy,
    customSortOrder = sortOrder
  ) => {
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

    params.append("sortBy", customSortBy);
    params.append("order", customSortOrder);

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

  const fetchTerminy = async (doctorId: number, serviceId: number | "" = "") => {
    setLoading(true);
    try {
      const query = serviceId ? `?usluga_id=${serviceId}` : "";
      const res = await fetch(`/api/doctors/${doctorId}/availability${query}`, { credentials: "include" });
      if (res.ok) setTerminy(await res.json());
    } catch { setError("Błąd pobierania terminów."); }
    setLoading(false);
  };

  const openDoctorProfile = async (doctorId: number) => {
    setLoading(true); setError(null);
    try {
      const res = await fetch(`/api/doctors/${doctorId}`, { credentials: "include" });
      if (!res.ok) throw new Error();
      const doctor = await res.json();
      const firstServiceId = doctor.services?.[0]?.id || "";
      setSelectedDoctor(doctor);
      setSelectedServiceId(firstServiceId);
      setSelectedTerminId(null);
      setActiveTab("profile");
      await fetchTerminy(doctor.id, firstServiceId);
    } catch {
      setError("Nie udało się pobrać profilu lekarza.");
    }
    setLoading(false);
  };

  const handleBook = async () => {
    if (!user || !selectedTerminId) return;
    const selectedTermin = terminy.find(t => t.id === selectedTerminId);
    const selectedService = selectedDoctor?.services?.find(s => s.id === selectedServiceId);
    const confirmText = selectedTermin && selectedDoctor
      ? `Czy potwierdzasz rezerwację wizyty?\n\nLekarz: ${selectedDoctor.imie} ${selectedDoctor.nazwisko}\nUsługa: ${selectedService?.nazwa || selectedTermin.usluga_nazwa || "Brak"}\nTermin: ${formatDate(selectedTermin.data)} ${formatTime(selectedTermin.godzina)}`
      : "Czy potwierdzasz rezerwację wizyty?";
    if (!confirm(confirmText)) return;

    setLoading(true);
    try {
      const res = await fetch("/api/appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ pacjent_id: user.id, termin_id: selectedTerminId, usluga_id: selectedServiceId || undefined })
      });
      const data = await res.json();
      if (res.ok) {
        alert("Wizyta zarezerwowana pomyślnie!");
        setSelectedTerminId(null);
        fetchAppointments();
        if (selectedDoctor) fetchTerminy(selectedDoctor.id, selectedServiceId);
      } else {
        alert(data.error || "Nie udało się zarezerwować wizyty.");
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

  const handleReschedule = async () => {
    if (!reschedule.appointment || !reschedule.terminId) return;
    try {
      const res = await fetch(`/api/appointments/${reschedule.appointment.id}/reschedule`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ nowy_termin_id: reschedule.terminId })
      });
      if (res.ok) {
        alert("Termin zmieniony.");
        setReschedule({ open: false, appointment: null, terminId: null });
        fetchAppointments();
      } else alert("Nie udało się zmienić terminu.");
    } catch { alert("Błąd zmiany terminu."); }
  };

  const openReschedule = async (appointment: Appointment) => {
    setReschedule({ open: true, appointment, terminId: null });
    await fetchTerminy(appointment.lekarz_id, appointment.usluga_id || "");
  };

  const submitRating = async () => {
    if (!ratingModal.appointmentId || !user) return;
    const appt = appointments.find(a => a.id === ratingModal.appointmentId);
    if (!appt) return;

    try {
      const res = await fetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ pacjent_id: user.id, lekarz_id: appt.lekarz_id, wartosc: ratingValue, komentarz: ratingComment })
      });
      if (res.ok) {
        alert("Dziękujemy za ocenę!");
        setRatingModal({ open: false, appointmentId: null });
        setRatingComment("");
      }
    } catch { alert("Błąd wysyłania oceny."); }
  };

  const savePatientProfile = async () => {
    if (!user) return;
    try {
      const res = await fetch(`/api/patients/${user.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(patientProfile)
      });
      if (res.ok) alert("Dane zaktualizowane.");
      else alert("Nie udało się zapisać danych.");
    } catch { alert("Błąd zapisu danych."); }
  };

  const deleteAccount = async () => {
    if (!user || !confirm("Czy na pewno usunąć konto? Tej operacji nie można cofnąć.")) return;
    try {
      const res = await fetch(`/api/patients/${user.id}`, { method: "DELETE", credentials: "include" });
      if (res.ok) {
        await logout();
        navigate("/login", { replace: true });
      } else alert("Nie udało się usunąć konta.");
    } catch { alert("Błąd usuwania konta."); }
  };

  const renderCalendar = (slots: Termin[], selected: number | null, onSelect: (id: number) => void) => {
    const days = Array.from(new Set(slots.map(t => formatDate(t.data)))).slice(0, 7);
    const hours = Array.from(new Set(slots.map(t => formatTime(t.godzina)))).sort();

    if (slots.length === 0) return <p>Brak terminów dla wybranej usługi.</p>;

    return (
      <div className="calendar">
        <div className="calendar-grid" style={{ gridTemplateColumns: `110px repeat(${days.length}, minmax(120px, 1fr))` }}>
          <div className="calendar-head">Godzina</div>
          {days.map(day => <div key={day} className="calendar-head">{day}</div>)}
          {hours.map(hour => (
            <Fragment key={hour}>
              <div key={`h-${hour}`} className="calendar-hour">{hour}</div>
              {days.map(day => {
                const slot = slots.find(t => formatDate(t.data) === day && formatTime(t.godzina) === hour);
                if (!slot) return <div key={`${day}-${hour}`} className="calendar-empty" />;
                return (
                  <button
                    key={slot.id}
                    className={`calendar-slot ${slot.dostepny ? "free" : "busy"} ${selected === slot.id ? "selected" : ""}`}
                    disabled={!slot.dostepny}
                    onClick={() => onSelect(slot.id)}
                  >
                    {slot.dostepny ? "Wolny" : "Zajęty"}
                  </button>
                );
              })}
            </Fragment>
          ))}
        </div>
      </div>
    );
  };

  if (!user) return <div className="page-shell">Ładowanie profilu pacjenta...</div>;

  return (
    <div className="page-shell">
      <header className="panel-header">
        <div>
          <h1>Panel Pacjenta</h1>
          <p>Zalogowano jako: <strong>{user.email}</strong></p>
        </div>
        <button className="btn danger" onClick={() => { logout(); navigate("/login"); }}>Wyloguj się</button>
      </header>

      <nav className="tabs-bar">
        <button className={activeTab === "appointments" ? "active" : ""} onClick={() => setActiveTab("appointments")}>Moje wizyty</button>
        <button className={activeTab === "search" ? "active" : ""} onClick={() => setActiveTab("search")}>Znajdź lekarza</button>
        <button className={activeTab === "profile" ? "active" : ""} onClick={() => setActiveTab("profile")}>Profil lekarza</button>
      </nav>

      {error && <p className="alert error">{error}</p>}
      {loading && <p className="muted">Ładowanie...</p>}

      {activeTab === "appointments" && (
        <section className="panel-card">
          <div className="section-title">
            <h2>Historia i nadchodzące wizyty</h2>
          </div>
          {appointments.length === 0 ? <p>Brak zaplanowanych wizyt.</p> : (
            <div className="table-wrap">
              <table>
                <thead><tr>
                  <th>Data</th><th>Godzina</th><th>Lekarz</th><th>Usługa</th><th>Status</th><th>Akcje</th>
                </tr></thead>
                <tbody>
                  {appointments.map(appt => (
                    <tr key={appt.id}>
                      <td>{formatDate(appt.data)}</td>
                      <td>{formatTime(appt.godzina)}</td>
                      <td>{appt.lekarz_imie} {appt.lekarz_nazwisko} ({appt.specjalizacja})</td>
                      <td>{appt.usluga_nazwa || "Brak"}</td>
                      <td><span className={`status ${isCancelled(appt.status) ? "cancelled" : "planned"}`}>{appt.status}</span></td>
                      <td className="actions">
                        {!isCancelled(appt.status) && <button className="btn small" onClick={() => openReschedule(appt)}>Zmień termin</button>}
                        {!isCancelled(appt.status) && <button className="btn small danger-light" onClick={() => handleCancel(appt.id)}>Anuluj</button>}
                        {!isCancelled(appt.status) && <button className="btn small" onClick={() => setRatingModal({ open: true, appointmentId: appt.id })}>Wystaw ocenę</button>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="profile-edit">
            <h3>Edycja danych</h3>
            <div className="form-grid">
              <input placeholder="Imię" value={patientProfile.imie} onChange={e => setPatientProfile({...patientProfile, imie: e.target.value})} />
              <input placeholder="Nazwisko" value={patientProfile.nazwisko} onChange={e => setPatientProfile({...patientProfile, nazwisko: e.target.value})} />
              <input type="date" value={patientProfile.data_urodzenia} onChange={e => setPatientProfile({...patientProfile, data_urodzenia: e.target.value})} />
              <input type="email" placeholder="Email" value={patientProfile.email} onChange={e => setPatientProfile({...patientProfile, email: e.target.value})} />
            </div>
            <div className="actions">
              <button className="btn" onClick={savePatientProfile}>Zapisz dane</button>
              <button className="btn danger" onClick={deleteAccount}>Usuń konto</button>
            </div>
          </div>
        </section>
      )}

      {activeTab === "search" && (
        <section className="panel-card">
          <div className="section-title">
            <h2>Wyszukiwanie lekarza</h2>
            <p>Wpisz specjalizację, miasto, imię albo nazwisko.</p>
          </div>
          <div className="search-row">
              <input
                type="text"
                placeholder="Specjalizacja, np. Kardiolog"
                value={specializationQuery}
                onChange={(e) => setSpecializationQuery(e.target.value)}
              />

              <input
                type="text"
                placeholder="Miasto, np. Warszawa"
                value={cityQuery}
                onChange={(e) => setCityQuery(e.target.value)}
              />

              <input
                type="text"
                placeholder="Nazwisko, np. Kowalski"
                value={lastNameQuery}
                onChange={(e) => setLastNameQuery(e.target.value)}
              />

              <select
                value={`${sortBy}-${sortOrder}`}
                onChange={(e) => {
                const [newSortBy, newSortOrder] = e.target.value.split("-");
                setSortBy(newSortBy);
                setSortOrder(newSortOrder);
                searchDoctors(newSortBy, newSortOrder);
}}  
              >
                <option value="nazwisko-ASC">Nazwisko A-Z</option>
                <option value="nazwisko-DESC">Nazwisko Z-A</option>
                <option value="specjalizacja-ASC">Specjalizacja A-Z</option>
                <option value="specjalizacja-DESC">Specjalizacja Z-A</option>
              </select>

              <button className="btn" onClick={() => searchDoctors()}>
                Szukaj
              </button>
            </div>
          <div className="doctor-grid">
            {doctors.map(doc => (
              <button key={doc.id} className="doctor-card" onClick={() => openDoctorProfile(doc.id)}>
                <strong>{doc.imie} {doc.nazwisko}</strong>
                <span>{doc.specjalizacja}</span>
                <small>{doc.adres}</small>
                <small>Średnia ocen: {Number(doc.srednia_ocen || 0).toFixed(1)}</small>
              </button>
            ))}
          </div>
          {hasSearchedDoctors && !loading && doctors.length === 0 && (
            <p className="empty-state">Nie odnaleziono lekarzy o podanych parametrach.</p>
          )}
        </section>
      )}

      {activeTab === "profile" && (
        <section className="panel-card">
          {!selectedDoctor ? <p>Wybierz lekarza z zakładki „Znajdź lekarza”.</p> : (
            <>
              <div className="doctor-profile">
                <div>
                  <h2>{selectedDoctor.imie} {selectedDoctor.nazwisko}</h2>
                  <p className="muted">{selectedDoctor.specjalizacja} | {selectedDoctor.adres}</p>
                  <h3>Opis</h3>
                  <p>{selectedDoctor.opis}</p>
                </div>
                <div className="score-box">
                  <span>Średnia ocen</span>
                  <strong>{Number(selectedDoctor.srednia_ocen || 0).toFixed(1)}</strong>
                </div>
              </div>

              <h3>Usługi i cennik</h3>
              <div className="service-grid">
                {selectedDoctor.services?.map(service => (
                  <label key={service.id} className={`service-card ${selectedServiceId === service.id ? "selected" : ""}`}>
                    <input
                      type="radio"
                      name="service"
                      checked={selectedServiceId === service.id}
                      onChange={() => { setSelectedServiceId(service.id); setSelectedTerminId(null); fetchTerminy(selectedDoctor.id, service.id); }}
                    />
                    <strong>{service.nazwa}</strong>
                    <span>{service.opis}</span>
                    <b>{Number(service.cena).toFixed(2)} zł</b>
                  </label>
                ))}
              </div>

              <h3>Dostępne terminy</h3>
              {renderCalendar(terminy, selectedTerminId, setSelectedTerminId)}
              <div className="actions">
                <button className="btn danger-light" onClick={() => setActiveTab("search")}>Anuluj</button>
                <button className="btn success" disabled={!selectedTerminId || loading} onClick={handleBook}>Zapisz się na wizytę</button>
              </div>

              <h3>Oceny pacjentów</h3>
              <div className="reviews">
                {selectedDoctor.reviews?.length ? selectedDoctor.reviews.map(review => (
                  <div key={review.id} className="review-item">
                    <strong>{review.pacjent_imie}: {review.wartosc}/5</strong>
                    <p>{review.komentarz || "Brak komentarza."}</p>
                  </div>
                )) : <p>Brak opinii.</p>}
              </div>
            </>
          )}
        </section>
      )}

      {ratingModal.open && (
        <div className="modal-backdrop">
          <div className="modal">
            <h3>Wystaw ocenę</h3>
            <div className="rating-row">
              {[1,2,3,4,5].map(v => <button key={v} className={ratingValue === v ? "selected" : ""} onClick={() => setRatingValue(v)}>{v}</button>)}
            </div>
            <textarea placeholder="Komentarz" value={ratingComment} onChange={e => setRatingComment(e.target.value)} />
            <div className="actions right">
              <button className="btn danger-light" onClick={() => setRatingModal({ open: false, appointmentId: null })}>Anuluj</button>
              <button className="btn" onClick={submitRating}>Wyślij</button>
            </div>
          </div>
        </div>
      )}

      {reschedule.open && (
        <div className="modal-backdrop">
          <div className="modal wide">
            <h3>Zmień termin wizyty</h3>
            {renderCalendar(terminy, reschedule.terminId, id => setReschedule({...reschedule, terminId: id}))}
            <div className="actions right">
              <button className="btn danger-light" onClick={() => setReschedule({ open: false, appointment: null, terminId: null })}>Anuluj</button>
              <button className="btn" disabled={!reschedule.terminId} onClick={handleReschedule}>Zapisz termin</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

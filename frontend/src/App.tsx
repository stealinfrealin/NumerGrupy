import { useEffect, useState } from "react";

function App() {
    const [lekarze, setLekarze] = useState<any[]>([]);

    useEffect(() => {
        fetch("/api/lekarze")
            .then(res => res.json())
            .then(data => setLekarze(data))
            .catch(err => console.error(err));
    }, []);

    return (
        <div>
            <h1>Frontend is Working!</h1>
            <h2>Lekarze:</h2>
            <ul>
                {lekarze.map((l) => (
                    <li key={l.id}>
                        {l.imie} {l.nazwisko}, {l.specjalizacja}, {l.adres}, {l.opis}
                    </li>
                ))}
            </ul>
        </div>
    );
}

export default App;
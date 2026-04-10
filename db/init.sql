CREATE DATABASE IF NOT EXISTS med_system;
USE med_system;

-- PACJENT
CREATE TABLE pacjent (
    id INT AUTO_INCREMENT PRIMARY KEY,
    imie VARCHAR(100),
    nazwisko VARCHAR(100),
    data_urodzenia DATE,
    email VARCHAR(150) UNIQUE,
    haslo VARCHAR(255)
);

-- LEKARZ
CREATE TABLE lekarz (
    id INT AUTO_INCREMENT PRIMARY KEY,
    imie VARCHAR(100),
    nazwisko VARCHAR(100),
    specjalizacja VARCHAR(100),
    adres VARCHAR(255),
    opis TEXT
);

-- TERMIN
CREATE TABLE termin (
    id INT AUTO_INCREMENT PRIMARY KEY,
    data DATE,
    godzina TIME,
    dostepny BOOLEAN DEFAULT TRUE,
    lekarz_id INT,
    FOREIGN KEY (lekarz_id) REFERENCES lekarz(id)
);

-- WIZYTA
CREATE TABLE wizyta (
    id INT AUTO_INCREMENT PRIMARY KEY,
    data DATE,
    godzina TIME,
    status VARCHAR(50),
    pacjent_id INT,
    termin_id INT UNIQUE,
    FOREIGN KEY (pacjent_id) REFERENCES pacjent(id),
    FOREIGN KEY (termin_id) REFERENCES termin(id)
);

-- OCENA
CREATE TABLE ocena (
    id INT AUTO_INCREMENT PRIMARY KEY,
    wartosc INT,
    komentarz TEXT,
    pacjent_id INT,
    lekarz_id INT,
    FOREIGN KEY (pacjent_id) REFERENCES pacjent(id),
    FOREIGN KEY (lekarz_id) REFERENCES lekarz(id)
);

-- ADMIN
CREATE TABLE admin (
    id INT AUTO_INCREMENT PRIMARY KEY,
    email VARCHAR(150),
    haslo VARCHAR(255)
);

-- SAMPLE DATA
INSERT INTO lekarz (imie, nazwisko, specjalizacja, adres, opis)
VALUES ('Jan', 'Kowalski', 'Kardiolog', 'Warszawa, ul. Okopowa 1', 'Specjalista serca');

INSERT INTO termin (data, godzina, dostepny, lekarz_id)
VALUES ('2026-05-01', '10:00:00', true, 1);
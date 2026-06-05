SET NAMES utf8mb4 COLLATE utf8mb4_polish_ci;
CREATE DATABASE IF NOT EXISTS med_system CHARACTER SET utf8mb4 COLLATE utf8mb4_polish_ci;
USE med_system;
ALTER DATABASE med_system CHARACTER SET utf8mb4 COLLATE utf8mb4_polish_ci;

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

-- USLUGA
CREATE TABLE usluga (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nazwa VARCHAR(150),
    opis TEXT,
    cena DECIMAL(10,2)
);

-- LEKARZ_USLUGA
CREATE TABLE lekarz_usluga (
    lekarz_id INT,
    usluga_id INT,
    PRIMARY KEY (lekarz_id, usluga_id),
    FOREIGN KEY (lekarz_id) REFERENCES lekarz(id),
    FOREIGN KEY (usluga_id) REFERENCES usluga(id)
);

-- TERMIN
CREATE TABLE termin (
    id INT AUTO_INCREMENT PRIMARY KEY,
    data DATE,
    godzina TIME,
    dostepny BOOLEAN DEFAULT TRUE,
    lekarz_id INT,
    usluga_id INT,
    FOREIGN KEY (lekarz_id) REFERENCES lekarz(id),
    FOREIGN KEY (usluga_id) REFERENCES usluga(id)
);

-- WIZYTA
CREATE TABLE wizyta (
    id INT AUTO_INCREMENT PRIMARY KEY,
    data DATE,
    godzina TIME,
    status VARCHAR(50),
    pacjent_id INT,
    termin_id INT UNIQUE,
    usluga_id INT,
    FOREIGN KEY (pacjent_id) REFERENCES pacjent(id),
    FOREIGN KEY (termin_id) REFERENCES termin(id),
    FOREIGN KEY (usluga_id) REFERENCES usluga(id)
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
    email VARCHAR(150) UNIQUE,
    haslo VARCHAR(255)
);

-- SAMPLE DATA
INSERT INTO lekarz (imie, nazwisko, specjalizacja, adres, opis)
VALUES
('Jan', 'Kowalski', 'Kardiolog', 'Warszawa, ul. Okopowa 1', 'Specjalista chorób serca z 15-letnim doświadczeniem.'),
('Anna', 'Nowak', 'Dermatolog', 'Kraków, ul. Długa 15', 'Leczenie chorób skóry oraz konsultacje dermatologiczne.'),
('Piotr', 'Wiśniewski', 'Ortopeda', 'Wrocław, ul. Legnicka 22', 'Specjalista ortopedii i traumatologii narządu ruchu.'),
('Katarzyna', 'Wójcik', 'Pediatra', 'Poznań, ul. Głogowska 45', 'Opieka medyczna nad dziećmi i młodzieżą.'),
('Marek', 'Kamiński', 'Neurolog', 'Gdańsk, ul. Grunwaldzka 88', 'Diagnostyka i leczenie schorzeń układu nerwowego.'),
('Ewa', 'Lewandowska', 'Okulista', 'Łódź, ul. Piotrkowska 120', 'Badania wzroku oraz leczenie chorób oczu.'),
('Tomasz', 'Zieliński', 'Laryngolog', 'Lublin, ul. Narutowicza 17', 'Specjalista chorób uszu, nosa i gardła.'),
('Magdalena', 'Szymańska', 'Ginekolog', 'Szczecin, ul. Wojska Polskiego 34', 'Prowadzenie ciąży i opieka ginekologiczna.'),
('Paweł', 'Dąbrowski', 'Psychiatra', 'Katowice, ul. Chorzowska 9', 'Diagnostyka i leczenie zaburzeń psychicznych.'),
('Joanna', 'Kaczmarek', 'Endokrynolog', 'Białystok, ul. Lipowa 27', 'Leczenie chorób hormonalnych i metabolicznych.');

INSERT INTO usluga (nazwa, opis, cena)
VALUES
('Konsultacja lekarska', 'Podstawowa konsultacja ze specjalistą.', 180.00),
('Kontrola', 'Wizyta kontrolna po leczeniu lub badaniach.', 120.00),
('Badanie specjalistyczne', 'Rozszerzone badanie dobrane do specjalizacji lekarza.', 250.00);

INSERT INTO lekarz_usluga (lekarz_id, usluga_id)
VALUES
(1, 1), (1, 2), (1, 3),
(2, 1), (2, 2), (2, 3),
(3, 1), (3, 2), (3, 3),
(4, 1), (4, 2), (4, 3),
(5, 1), (5, 2), (5, 3),
(6, 1), (6, 2), (6, 3),
(7, 1), (7, 2), (7, 3),
(8, 1), (8, 2), (8, 3),
(9, 1), (9, 2), (9, 3),
(10, 1), (10, 2), (10, 3);

INSERT INTO termin (data, godzina, dostepny, lekarz_id, usluga_id)
VALUES
('2026-06-10', '09:00:00', true, 1, 1),
('2026-06-10', '10:00:00', false, 1, 2),
('2026-06-10', '11:00:00', true, 1, 3),
('2026-06-11', '08:30:00', true, 2, 1),
('2026-06-11', '09:30:00', true, 2, 2),
('2026-06-11', '10:30:00', false, 2, 3),
('2026-06-12', '09:00:00', true, 3, 1),
('2026-06-12', '10:00:00', true, 3, 2),
('2026-06-12', '11:00:00', false, 3, 3),
('2026-06-13', '13:00:00', true, 4, 1),
('2026-06-13', '14:00:00', true, 4, 2),
('2026-06-13', '15:00:00', false, 4, 3),
('2026-06-14', '08:00:00', true, 5, 1),
('2026-06-14', '09:00:00', false, 5, 2),
('2026-06-14', '10:00:00', true, 5, 3),
('2026-06-15', '11:00:00', true, 6, 1),
('2026-06-15', '12:00:00', true, 6, 2),
('2026-06-15', '13:00:00', false, 6, 3),
('2026-06-16', '09:00:00', true, 7, 1),
('2026-06-16', '10:00:00', true, 7, 2),
('2026-06-16', '11:00:00', false, 7, 3),
('2026-06-17', '14:00:00', true, 8, 1),
('2026-06-17', '15:00:00', false, 8, 2),
('2026-06-17', '16:00:00', true, 8, 3),
('2026-06-18', '08:00:00', true, 9, 1),
('2026-06-18', '09:00:00', true, 9, 2),
('2026-06-18', '10:00:00', false, 9, 3),
('2026-06-19', '12:00:00', true, 10, 1),
('2026-06-19', '13:00:00', false, 10, 2),
('2026-06-19', '14:00:00', true, 10, 3);

INSERT INTO admin (email, haslo) VALUES ('admin@mdoktor.pl', '$2b$12$D4cnHz38l.t4OdyhpkaZpe6SQBwNhEWLt/jPpzptocG464A44ysuq');

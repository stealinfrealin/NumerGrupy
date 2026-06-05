/**
 * Required environment variables (.env):
 * PORT=3000
 * DB_HOST=db
 * DB_USER=root
 * DB_PASSWORD=root
 * DB_NAME=med_system
 * JWT_SECRET=your_very_secret_jwt_key
 * NODE_ENV=production
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { body, param, query, validationResult } = require('express-validator');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('./db');
const cookieParser = require('cookie-parser');
const app = express();

// --- Security & Middleware ---
app.use(cookieParser());
app.use(helmet());
app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:5173', credentials: true }));
app.use(express.json());

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Zbyt wiele żądań z tego IP, spróbuj ponownie za 15 minut'
});
app.use(limiter);

// --- Helper Functions ---
const validateRequest = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  next();
};

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = req.cookies?.jwt_token || (authHeader && authHeader.split(' ')[1]);
  if (!token) return res.sendStatus(401);

  jwt.verify(token, process.env.JWT_SECRET || 'fallback_secret', (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
};

const authorizeRole = (...roles) => (req, res, next) => {
  if (!req.user || !roles.includes(req.user.role)) {
    return res.status(403).json({ error: 'Brak uprawnień' });
  }
  next();
};

// Email service template
const sendEmail = async (to, subject, text) => {
  console.log(`[EMAIL] To: ${to} | Subject: ${subject} | Text: ${text}`);
  return true;
};

const fixPolishText = (value) => {
  if (typeof value !== 'string') return value;
  return value
    .replace(/Ä…/g, 'ą').replace(/Ä‡/g, 'ć').replace(/Ä™/g, 'ę')
    .replace(/Äł/g, 'ł').replace(/Ĺ‚/g, 'ł').replace(/Ĺ„/g, 'ń')
    .replace(/Ăł/g, 'ó').replace(/Ĺ›/g, 'ś').replace(/Ĺş/g, 'ź')
    .replace(/ĹĽ/g, 'ż').replace(/Ä„/g, 'Ą').replace(/Ä†/g, 'Ć')
    .replace(/Ä/g, 'Ę').replace(/Ĺ/g, 'Ł').replace(/Ĺ/g, 'Ń')
    .replace(/Ă“/g, 'Ó').replace(/Ĺš/g, 'Ś').replace(/Ĺą/g, 'Ź')
    .replace(/Ĺ»/g, 'Ż');
};

const fixPolishRow = (row) => {
  const fixed = { ...row };
  Object.keys(fixed).forEach(key => { fixed[key] = fixPolishText(fixed[key]); });
  return fixed;
};

const normalizeSearchText = (value) => fixPolishText(value || '')
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '');

// --- Endpoints ---

// Health Check
app.get('/', (req, res) => res.status(200).json({ status: 'OK', message: 'Backend działa' }));

// Session Verification
app.get('/api/auth/verify', authenticateToken, (req, res) => {
    res.json({ valid: true, user: req.user });
});

// 1. Patient Registration
app.post('/api/register', [
  body('imie').trim().notEmpty(), body('nazwisko').trim().notEmpty(),
  body('email').isEmail(), body('haslo').isLength({ min: 8 }),
  body('data_urodzenia').isDate()
], validateRequest, async (req, res) => {
  const { imie, nazwisko, data_urodzenia, email, haslo } = req.body;
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [existingUsers] = await connection.query('SELECT id FROM pacjent WHERE email = ?', [email]);
    if (existingUsers.length > 0) {
        await connection.rollback();
        return res.status(409).json({ error: 'Email jest już zajęty' });
    }

    const hashedPassword = await bcrypt.hash(haslo, 10);
    const [result] = await connection.query(
      'INSERT INTO pacjent (imie, nazwisko, data_urodzenia, email, haslo) VALUES (?, ?, ?, ?, ?)',
      [imie, nazwisko, data_urodzenia, email, hashedPassword]
    );
    await connection.commit();
    res.status(201).json({ message: 'Zarejestrowano pomyślnie', id: result.insertId });
  } catch (error) {
    console.error('Błąd rejestracji:', error);
    await connection.rollback();
    res.status(500).json({ error: 'Rejestracja nieudana' });
  } finally { connection.release(); }
});

// 2a. Patient Login
app.post('/api/login', [body('email').isEmail(), body('haslo').notEmpty()], validateRequest, async (req, res) => {
  const { email, haslo } = req.body;
  try {
    const [rows] = await pool.query('SELECT * FROM pacjent WHERE email = ?', [email]);
    if (rows.length === 0) return res.status(401).json({ error: 'Błędne dane' });

    const user = rows[0];
    const match = await bcrypt.compare(haslo, user.haslo);
    if (!match) return res.status(401).json({ error: 'Błędne dane' });

    const token = jwt.sign({ id: user.id, role: 'patient', email: user.email, imie: user.imie, nazwisko: user.nazwisko }, process.env.JWT_SECRET || 'fallback_secret', { expiresIn: '24h' });
    res.cookie('jwt_token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 24 * 60 * 60 * 1000
    });
    res.json({ message: 'Zalogowano', user: { id: user.id, imie: user.imie, nazwisko: user.nazwisko, email: user.email, role: 'patient' } });
  } catch (error) { res.status(500).json({ error: 'Błąd logowania' }); }
});

// 2b. Admin Login
app.post('/api/admin/login', [body('email').isEmail(), body('haslo').notEmpty()], validateRequest, async (req, res) => {
  const { email, haslo } = req.body;
  try {
    const [rows] = await pool.query('SELECT * FROM admin WHERE email = ?', [email]);
    if (rows.length === 0) return res.status(401).json({ error: 'Błędne dane logowania' });

    const admin = rows[0];
    const match = await bcrypt.compare(haslo, admin.haslo);
    if (!match) return res.status(401).json({ error: 'Błędne dane logowania' });

    const token = jwt.sign({ id: admin.id, role: 'admin', email: admin.email }, process.env.JWT_SECRET || 'fallback_secret', { expiresIn: '24h' });
    res.cookie('jwt_token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 24 * 60 * 60 * 1000
    });
    res.json({ message: 'Zalogowano jako administrator', user: { id: admin.id, email: admin.email, role: 'admin' } });
  } catch (error) { res.status(500).json({ error: 'Błąd logowania administratora' }); }
});

// 3. Password Reset
app.post('/api/reset-password', [
    body('email').isEmail(),
    body('newPassword').isLength({ min: 8 })
], validateRequest, async (req, res) => {
    const { email, newPassword } = req.body;
    try {
        const hashedPassword = await bcrypt.hash(newPassword, 10);
        const [result] = await pool.query('UPDATE pacjent SET haslo = ? WHERE email = ?', [hashedPassword, email]);
        if (result.affectedRows === 0) return res.status(404).json({ error: 'Użytkownik nie znaleziony' });
        res.json({ message: 'Hasło zresetowane' });
    } catch (error) { res.status(500).json({ error: 'Reset nieudany' }); }
});

// 4. Search Doctors
app.get('/api/doctors', [
  query('search').optional().trim(),
  query('specjalizacja').optional().trim(),
  query('miasto').optional().trim(),
  query('nazwisko').optional().trim(),
  query('sortBy').optional().isIn(['nazwisko', 'specjalizacja', 'ocena']),
  query('order').optional().isIn(['ASC', 'DESC'])
], validateRequest, async (req, res) => {
  const { search, specjalizacja, miasto, nazwisko, sortBy = 'nazwisko', order = 'ASC' } = req.query;
  try {
    let queryStr = `
      SELECT l.*, COALESCE(AVG(o.wartosc), 0) as srednia_ocen
      FROM lekarz l
      LEFT JOIN ocena o ON o.lekarz_id = l.id
      WHERE 1=1`;
    const params = [];

    // Parametr search filtrujemy po pobraniu danych, bo część istniejących baz
    // może mieć już zapisane krzaczki w danych lekarzy.
    if (specjalizacja) { queryStr += ' AND l.specjalizacja LIKE ?'; params.push(`%${specjalizacja}%`); }
    if (miasto) { queryStr += ' AND l.adres LIKE ?'; params.push(`%${miasto}%`); }
    if (nazwisko) { queryStr += ' AND l.nazwisko LIKE ?'; params.push(`%${nazwisko}%`); }

    queryStr += ' GROUP BY l.id';
    const allowedSort = { nazwisko: 'l.nazwisko', specjalizacja: 'l.specjalizacja', ocena: 'srednia_ocen' };
    const safeSort = allowedSort[sortBy] || 'l.nazwisko';
    const safeOrder = String(order).toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
    queryStr += ` ORDER BY ${safeSort} ${safeOrder}`;

    const [rows] = await pool.query(queryStr, params);
    let fixedRows = rows.map(fixPolishRow);

    if (search) {
      const normalizedSearch = normalizeSearchText(search);
      fixedRows = fixedRows.filter(row => {
        const searchable = normalizeSearchText(`${row.imie} ${row.nazwisko} ${row.specjalizacja} ${row.adres}`);
        return searchable.includes(normalizedSearch);
      });
    }

    res.json(fixedRows);
  } catch (error) { res.status(500).json({ error: 'Wyszukiwanie nieudane' }); }
});

// 5. Doctor Profile
app.get('/api/doctors/:id', [param('id').isInt()], validateRequest, async (req, res) => {
  try {
    const [doctor] = await pool.query('SELECT * FROM lekarz WHERE id = ?', [req.params.id]);
    if (doctor.length === 0) return res.status(404).json({ error: 'Lekarz nie znaleziony' });

    const [ratings] = await pool.query('SELECT AVG(wartosc) as srednia_ocen FROM ocena WHERE lekarz_id = ?', [req.params.id]);
    const [reviews] = await pool.query(
      `SELECT o.id, o.wartosc, o.komentarz, p.imie as pacjent_imie
       FROM ocena o JOIN pacjent p ON o.pacjent_id = p.id
       WHERE o.lekarz_id = ? ORDER BY o.id DESC`, [req.params.id]
    );
    const [services] = await pool.query(
      `SELECT u.id, u.nazwa, u.opis, u.cena
       FROM usluga u JOIN lekarz_usluga lu ON u.id = lu.usluga_id
       WHERE lu.lekarz_id = ? ORDER BY u.nazwa ASC`, [req.params.id]
    );

    res.json({ ...fixPolishRow(doctor[0]), srednia_ocen: parseFloat(ratings[0].srednia_ocen || 0), services: services.map(fixPolishRow), reviews: reviews.map(fixPolishRow) });
  } catch (error) { res.status(500).json({ error: 'Błąd pobierania profilu' }); }
});

app.get('/api/patients/:id', [param('id').isInt()], authenticateToken, validateRequest, async (req, res) => {
  if (req.user.role !== 'admin' && req.user.id !== parseInt(req.params.id)) return res.status(403).json({ error: 'Brak dostępu' });
  try {
    const [rows] = await pool.query('SELECT id, imie, nazwisko, data_urodzenia, email FROM pacjent WHERE id = ?', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Pacjent nie znaleziony' });
    res.json(rows[0]);
  } catch (error) { res.status(500).json({ error: 'Błąd pobierania profilu pacjenta' }); }
});

// 6. Patient Profile (Appointments)
app.get('/api/patients/:id/appointments', [param('id').isInt()], authenticateToken, validateRequest, async (req, res) => {
  if (req.user.role !== 'admin' && req.user.id !== parseInt(req.params.id)) return res.status(403).json({ error: 'Brak dostępu' });
  try {
    const [visits] = await pool.query(
      `SELECT w.id, w.data, w.godzina, w.status, w.usluga_id, l.id as lekarz_id, l.imie as lekarz_imie,
       l.nazwisko as lekarz_nazwisko, l.specjalizacja, u.nazwa as usluga_nazwa
       FROM wizyta w
       JOIN termin t ON w.termin_id = t.id
       JOIN lekarz l ON t.lekarz_id = l.id
       LEFT JOIN usluga u ON w.usluga_id = u.id
       WHERE w.pacjent_id = ? ORDER BY w.data ASC, w.godzina ASC`, [req.params.id]
    );
    res.json(visits.map(fixPolishRow));
  } catch (error) { res.status(500).json({ error: 'Błąd pobierania wizyt' }); }
});

// 7. Calendar (Available Slots)
app.get('/api/doctors/:id/availability', [
  param('id').isInt(),
  query('usluga_id').optional().isInt()
], validateRequest, async (req, res) => {
  try {
    let queryStr = `
      SELECT t.*, u.nazwa as usluga_nazwa
      FROM termin t LEFT JOIN usluga u ON t.usluga_id = u.id
      WHERE t.lekarz_id = ?`;
    const params = [req.params.id];
    if (req.query.usluga_id) { queryStr += ' AND t.usluga_id = ?'; params.push(req.query.usluga_id); }
    queryStr += ' ORDER BY t.data ASC, t.godzina ASC';
    const [slots] = await pool.query(queryStr, params);
    res.json(slots.map(fixPolishRow));
  } catch (error) { res.status(500).json({ error: 'Błąd pobierania terminów' }); }
});

// 8. Book Appointment (Transaction + Row Lock)
app.post('/api/appointments', [
  body('pacjent_id').isInt(),
  body('termin_id').isInt(),
  body('usluga_id').optional().isInt()
], authenticateToken, validateRequest, async (req, res) => {
  const { pacjent_id, termin_id, usluga_id } = req.body;
  if (req.user.role !== 'admin' && req.user.id !== pacjent_id) return res.status(403).json({ error: 'Brak dostępu' });

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [slots] = await connection.query('SELECT * FROM termin WHERE id = ? AND dostepny = TRUE FOR UPDATE', [termin_id]);
    if (slots.length === 0) { await connection.rollback(); return res.status(400).json({ error: 'Termin zajęty' }); }

    const slot = slots[0];
    const serviceId = usluga_id || slot.usluga_id || null;
    await connection.query('INSERT INTO wizyta (data, godzina, status, pacjent_id, termin_id, usluga_id) VALUES (?, ?, \'Zarezerwowana\', ?, ?, ?)', [slot.data, slot.godzina, pacjent_id, termin_id, serviceId]);
    await connection.query('UPDATE termin SET dostepny = FALSE WHERE id = ?', [termin_id]);
    await connection.commit();

    const [patient] = await pool.query('SELECT email FROM pacjent WHERE id = ?', [pacjent_id]);
    if (patient.length > 0) await sendEmail(patient[0].email, 'Potwierdzenie wizyty', `Wizyta zarezerwowana na ${slot.data} ${slot.godzina}.`);
    res.status(201).json({ message: 'Wizyta zarezerwowana' });
  } catch (error) { await connection.rollback(); res.status(500).json({ error: 'Rezerwacja nieudana' }); }
  finally { connection.release(); }
});

// 9. Cancel Appointment
app.put('/api/appointments/:id/cancel', [param('id').isInt()], authenticateToken, validateRequest, async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [visits] = await connection.query('SELECT * FROM wizyta WHERE id = ?', [req.params.id]);
    if (visits.length === 0) { await connection.rollback(); return res.status(404).json({ error: 'Wizyta nie znaleziona' }); }
    const visit = visits[0];
    if (req.user.role !== 'admin' && req.user.id !== visit.pacjent_id) { await connection.rollback(); return res.status(403).json({ error: 'Brak dostępu' }); }

    await connection.query("UPDATE wizyta SET status = 'Anulowana' WHERE id = ?", [req.params.id]);
    await connection.query('UPDATE termin SET dostepny = TRUE WHERE id = ?', [visit.termin_id]);
    await connection.commit();

    const [patient] = await pool.query('SELECT email FROM pacjent WHERE id = ?', [visit.pacjent_id]);
    if (patient.length > 0) await sendEmail(patient[0].email, 'Anulowanie wizyty', 'Twoja wizyta została anulowana.');
    res.json({ message: 'Wizyta anulowana' });
  } catch (error) { await connection.rollback(); res.status(500).json({ error: 'Anulowanie nieudane' }); }
  finally { connection.release(); }
});

// 10. Review Doctor
app.post('/api/reviews', [
  body('pacjent_id').isInt(), body('lekarz_id').isInt(),
  body('wartosc').isInt({ min: 1, max: 5 }), body('komentarz').optional().trim()
], authenticateToken, validateRequest, async (req, res) => {
  const { pacjent_id, lekarz_id, wartosc, komentarz } = req.body;
  if (req.user.role !== 'admin' && req.user.id !== pacjent_id) return res.status(403).json({ error: 'Brak dostępu' });
  try {
    await pool.query('INSERT INTO ocena (wartosc, komentarz, pacjent_id, lekarz_id) VALUES (?, ?, ?, ?)', [wartosc, komentarz || '', pacjent_id, lekarz_id]);
    res.status(201).json({ message: 'Ocena dodana' });
  } catch (error) { res.status(500).json({ error: 'Błąd dodawania oceny' }); }
});

// 11-25. Administrator Endpoints (Role Protected)
app.get('/api/admin/doctors', authenticateToken, authorizeRole('admin'), async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT id, imie, nazwisko, specjalizacja, adres, opis FROM lekarz ORDER BY nazwisko ASC');
    res.json(rows.map(fixPolishRow));
  } catch (error) {
    res.status(500).json({ error: 'Błąd pobierania listy lekarzy' });
  }
});

app.get('/api/admin/users', authenticateToken, authorizeRole('admin'), async (req, res) => {
  try {
    const [patients] = await pool.query('SELECT id, imie, nazwisko, data_urodzenia, email FROM pacjent');
    const [doctors] = await pool.query('SELECT id, imie, nazwisko, specjalizacja FROM lekarz');

    res.json({ patients: patients.map(fixPolishRow), doctors: doctors.map(fixPolishRow) });
  } catch (error) {
    console.error('Błąd SQL przy pobieraniu użytkowników:', error);
    res.status(500).json({ error: 'Błąd pobierania użytkowników' });
  }
});

app.post('/api/admin/doctors', [body('imie').trim().notEmpty(), body('nazwisko').trim().notEmpty(), body('specjalizacja').trim().notEmpty(), body('adres').trim().notEmpty(), body('opis').optional().trim()], authenticateToken, authorizeRole('admin'), validateRequest, async (req, res) => {
  try {
    const [result] = await pool.query('INSERT INTO lekarz (imie, nazwisko, specjalizacja, adres, opis) VALUES (?, ?, ?, ?, ?)', [req.body.imie, req.body.nazwisko, req.body.specjalizacja, req.body.adres, req.body.opis]);
    await pool.query('INSERT INTO lekarz_usluga (lekarz_id, usluga_id) SELECT ?, id FROM usluga', [result.insertId]);
    res.status(201).json({ message: 'Lekarz dodany', id: result.insertId });
  } catch (error) { res.status(500).json({ error: 'Błąd dodawania lekarza' }); }
});

app.post('/api/admin/availability', [body('lekarz_id').isInt(), body('data').isDate(), body('godzina').matches(/^([01]\d|2[0-3]):([0-5]\d)$/), body('usluga_id').optional().isInt()], authenticateToken, authorizeRole('admin'), validateRequest, async (req, res) => {
  try {
    await pool.query('INSERT INTO termin (data, godzina, dostepny, lekarz_id, usluga_id) VALUES (?, ?, TRUE, ?, ?)', [req.body.data, req.body.godzina, req.body.lekarz_id, req.body.usluga_id || null]);
    res.status(201).json({ message: 'Termin dodany' });
  } catch (error) { res.status(500).json({ error: 'Błąd dodawania terminu' }); }
});

app.put('/api/patients/:id', [param('id').isInt(), body('imie').optional().trim(), body('nazwisko').optional().trim(), body('email').optional().isEmail(), body('data_urodzenia').optional().isDate()], authenticateToken, validateRequest, async (req, res) => {
  if (req.user.role !== 'admin' && req.user.id !== parseInt(req.params.id)) return res.status(403).json({ error: 'Brak dostępu' });
  try {
    await pool.query('UPDATE pacjent SET imie = COALESCE(?, imie), nazwisko = COALESCE(?, nazwisko), data_urodzenia = COALESCE(?, data_urodzenia), email = COALESCE(?, email) WHERE id = ?', [req.body.imie, req.body.nazwisko, req.body.data_urodzenia, req.body.email, req.params.id]);
    res.json({ message: 'Dane zaktualizowane' });
  } catch (error) { res.status(500).json({ error: 'Błąd aktualizacji' }); }
});

app.put('/api/appointments/:id/reschedule', [param('id').isInt(), body('nowy_termin_id').isInt()], authenticateToken, validateRequest, async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [visits] = await connection.query('SELECT * FROM wizyta WHERE id = ?', [req.params.id]);
    if (visits.length === 0) { await connection.rollback(); return res.status(404).json({ error: 'Wizyta nie znaleziona' }); }
    const visit = visits[0];
    if (req.user.role !== 'admin' && req.user.id !== visit.pacjent_id) { await connection.rollback(); return res.status(403).json({ error: 'Brak dostępu' }); }

    const [newSlots] = await connection.query('SELECT * FROM termin WHERE id = ? AND dostepny = TRUE FOR UPDATE', [req.body.nowy_termin_id]);
    if (newSlots.length === 0) { await connection.rollback(); return res.status(400).json({ error: 'Nowy termin zajęty' }); }
    const newSlot = newSlots[0];

    await connection.query('UPDATE wizyta SET data = ?, godzina = ?, termin_id = ?, usluga_id = COALESCE(?, usluga_id), status = \'Zarezerwowana\' WHERE id = ?', [newSlot.data, newSlot.godzina, req.body.nowy_termin_id, newSlot.usluga_id, req.params.id]);
    await connection.query('UPDATE termin SET dostepny = FALSE WHERE id = ?', [req.body.nowy_termin_id]);
    await connection.query('UPDATE termin SET dostepny = TRUE WHERE id = ?', [visit.termin_id]);
    await connection.commit();
    res.json({ message: 'Termin zmieniony' });
  } catch (error) { await connection.rollback(); res.status(500).json({ error: 'Błąd zmiany terminu' }); }
  finally { connection.release(); }
});

app.put('/api/appointments/:id/confirm', [param('id').isInt()], authenticateToken, authorizeRole('admin'), validateRequest, async (req, res) => {
  try { await pool.query("UPDATE wizyta SET status = 'Potwierdzona' WHERE id = ?", [req.params.id]); res.json({ message: 'Wizyta potwierdzona' }); }
  catch (error) { res.status(500).json({ error: 'Błąd potwierdzenia' }); }
});

app.put('/api/reviews/:id', [param('id').isInt(), body('wartosc').isInt({ min: 1, max: 5 }), body('komentarz').optional().trim()], authenticateToken, validateRequest, async (req, res) => {
  const [ratings] = await pool.query('SELECT pacjent_id FROM ocena WHERE id = ?', [req.params.id]);
  if (ratings.length === 0) return res.status(404).json({ error: 'Ocena nie znaleziona' });
  if (req.user.role !== 'admin' && req.user.id !== ratings[0].pacjent_id) return res.status(403).json({ error: 'Brak dostępu' });
  try { await pool.query('UPDATE ocena SET wartosc = ?, komentarz = ? WHERE id = ?', [req.body.wartosc, req.body.komentarz || '', req.params.id]); res.json({ message: 'Ocena zaktualizowana' }); }
  catch (error) { res.status(500).json({ error: 'Błąd aktualizacji oceny' }); }
});

app.delete('/api/reviews/:id', [param('id').isInt()], authenticateToken, validateRequest, async (req, res) => {
  const [ratings] = await pool.query('SELECT pacjent_id FROM ocena WHERE id = ?', [req.params.id]);
  if (ratings.length === 0) return res.status(404).json({ error: 'Ocena nie znaleziona' });
  if (req.user.role !== 'admin' && req.user.id !== ratings[0].pacjent_id) return res.status(403).json({ error: 'Brak dostępu' });
  try { await pool.query('DELETE FROM ocena WHERE id = ?', [req.params.id]); res.json({ message: 'Ocena usunięta' }); }
  catch (error) { res.status(500).json({ error: 'Błąd usuwania oceny' }); }
});

app.get('/api/admin/appointments', authenticateToken, authorizeRole('admin'), async (req, res) => {
  try {
    const [visits] = await pool.query(
      `SELECT w.id, w.data, w.godzina, w.status, p.imie as pacjent_imie, p.nazwisko as pacjent_nazwisko,
       l.imie as lekarz_imie, l.nazwisko as lekarz_nazwisko, u.nazwa as usluga_nazwa
       FROM wizyta w
       JOIN pacjent p ON w.pacjent_id = p.id
       JOIN termin t ON w.termin_id = t.id
       JOIN lekarz l ON t.lekarz_id = l.id
       LEFT JOIN usluga u ON w.usluga_id = u.id
       ORDER BY w.data ASC, w.godzina ASC`
    );
    res.json(visits.map(fixPolishRow));
  } catch (error) { res.status(500).json({ error: 'Błąd pobierania wizyt' }); }
});

app.delete('/api/admin/users/:id', [param('id').isInt()], authenticateToken, authorizeRole('admin'), validateRequest, async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.query('UPDATE termin SET dostepny = TRUE WHERE id IN (SELECT termin_id FROM wizyta WHERE pacjent_id = ?)', [req.params.id]);
    await connection.query('DELETE FROM ocena WHERE pacjent_id = ?', [req.params.id]);
    await connection.query('DELETE FROM wizyta WHERE pacjent_id = ?', [req.params.id]);
    await connection.query('DELETE FROM pacjent WHERE id = ?', [req.params.id]);
    await connection.commit();
    res.json({ message: 'Użytkownik usunięty' });
  } catch (error) { await connection.rollback(); res.status(500).json({ error: 'Błąd usuwania użytkownika' }); }
  finally { connection.release(); }
});

app.put('/api/admin/users/:id', [param('id').isInt(), body('imie').optional().trim(), body('nazwisko').optional().trim(), body('email').optional().isEmail(), body('data_urodzenia').optional().isDate(), body('haslo').optional().isLength({ min: 8 })], authenticateToken, authorizeRole('admin'), validateRequest, async (req, res) => {
  try {
    let query = 'UPDATE pacjent SET imie = COALESCE(?, imie), nazwisko = COALESCE(?, nazwisko), data_urodzenia = COALESCE(?, data_urodzenia), email = COALESCE(?, email)';
    const params = [req.body.imie, req.body.nazwisko, req.body.data_urodzenia, req.body.email];
    if (req.body.haslo) { query += ', haslo = ?'; params.push(await bcrypt.hash(req.body.haslo, 10)); }
    query += ' WHERE id = ?'; params.push(req.params.id);
    await pool.query(query, params);
    res.json({ message: 'Użytkownik zaktualizowany' });
  } catch (error) { res.status(500).json({ error: 'Błąd aktualizacji użytkownika' }); }
});

app.put('/api/admin/doctors/:id', [param('id').isInt(), body('imie').optional().trim(), body('nazwisko').optional().trim(), body('specjalizacja').optional().trim(), body('adres').optional().trim(), body('opis').optional().trim()], authenticateToken, authorizeRole('admin'), validateRequest, async (req, res) => {
  try { await pool.query('UPDATE lekarz SET imie = COALESCE(?, imie), nazwisko = COALESCE(?, nazwisko), specjalizacja = COALESCE(?, specjalizacja), adres = COALESCE(?, adres), opis = COALESCE(?, opis) WHERE id = ?', [req.body.imie, req.body.nazwisko, req.body.specjalizacja, req.body.adres, req.body.opis, req.params.id]); res.json({ message: 'Lekarz zaktualizowany' }); }
  catch (error) { res.status(500).json({ error: 'Błąd aktualizacji lekarza' }); }
});

app.delete('/api/admin/doctors/:id', [param('id').isInt()], authenticateToken, authorizeRole('admin'), validateRequest, async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.query('DELETE FROM ocena WHERE lekarz_id = ?', [req.params.id]);
    await connection.query('DELETE FROM wizyta WHERE termin_id IN (SELECT id FROM termin WHERE lekarz_id = ?)', [req.params.id]);
    await connection.query('DELETE FROM termin WHERE lekarz_id = ?', [req.params.id]);
    await connection.query('DELETE FROM lekarz_usluga WHERE lekarz_id = ?', [req.params.id]);
    await connection.query('DELETE FROM lekarz WHERE id = ?', [req.params.id]);
    await connection.commit();
    res.json({ message: 'Lekarz usunięty' });
  }
  catch (error) { await connection.rollback(); res.status(500).json({ error: 'Błąd usuwania lekarza' }); }
  finally { connection.release(); }
});

app.put('/api/admin/availability/:id', [param('id').isInt(), body('data').optional().isDate(), body('godzina').optional().matches(/^([01]\d|2[0-3]):([0-5]\d)$/), body('dostepny').optional().isBoolean(), body('usluga_id').optional().isInt()], authenticateToken, authorizeRole('admin'), validateRequest, async (req, res) => {
  try { await pool.query('UPDATE termin SET data = COALESCE(?, data), godzina = COALESCE(?, godzina), dostepny = COALESCE(?, dostepny), usluga_id = COALESCE(?, usluga_id) WHERE id = ?', [req.body.data, req.body.godzina, req.body.dostepny, req.body.usluga_id, req.params.id]); res.json({ message: 'Termin zaktualizowany' }); }
  catch (error) { res.status(500).json({ error: 'Błąd aktualizacji terminu' }); }
});

app.delete('/api/admin/availability/:id', [param('id').isInt()], authenticateToken, authorizeRole('admin'), validateRequest, async (req, res) => {
  try { await pool.query('DELETE FROM termin WHERE id = ?', [req.params.id]); res.json({ message: 'Termin usunięty' }); }
  catch (error) { res.status(500).json({ error: 'Błąd usuwania terminu' }); }
});

// 26. Delete Patient Account
app.delete('/api/patients/:id', [param('id').isInt()], authenticateToken, validateRequest, async (req, res) => {
  if (req.user.role !== 'admin' && req.user.id !== parseInt(req.params.id)) return res.status(403).json({ error: 'Brak dostępu' });
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.query('UPDATE termin SET dostepny = TRUE WHERE id IN (SELECT termin_id FROM wizyta WHERE pacjent_id = ?)', [req.params.id]);
    await connection.query('DELETE FROM ocena WHERE pacjent_id = ?', [req.params.id]);
    await connection.query('DELETE FROM wizyta WHERE pacjent_id = ?', [req.params.id]);
    await connection.query('DELETE FROM pacjent WHERE id = ?', [req.params.id]);
    await connection.commit();
    res.clearCookie('jwt_token');
    res.json({ message: 'Konto usunięte' });
  } catch (error) { await connection.rollback(); res.status(500).json({ error: 'Błąd usuwania konta' }); }
  finally { connection.release(); }
});

// 27. Logout
app.post('/api/logout', (req, res) => {
    res.clearCookie('jwt_token');
    res.json({ message: 'Wylogowano pomyślnie' });
});

// --- Central Error Handling ---
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({ error: process.env.NODE_ENV === 'production' ? 'Wewnętrzny błąd serwera' : err.message });
});

// --- Start Server ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running in mode ${process.env.NODE_ENV || 'development'} port ${PORT}`));

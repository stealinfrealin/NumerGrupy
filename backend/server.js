/**
 * Required environment variables (.env):
 * PORT=3000
 * DB_HOST=localhost
 * DB_USER=root
 * DB_PASSWORD=your_password
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
  console.log(`[EMAIL] To: ${to} | Subject: ${subject}`);
  return true;
};

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

    // Check if email already exists
    const [existingUsers] = await connection.query('SELECT id FROM pacjent WHERE email = ?', [email]);
    if (existingUsers.length > 0) {
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

    const token = jwt.sign({ id: user.id, role: 'pacjent', email: user.email }, process.env.JWT_SECRET || 'fallback_secret', { expiresIn: '24h' });
    res.cookie('jwt_token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 24 * 60 * 60 * 1000
    });
    res.json({ message: 'Zalogowano', user: { id: user.id, imie: user.imie, nazwisko: user.nazwisko, email: user.email } });
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
  query('specjalizacja').optional().trim(), query('miasto').optional().trim(),
  query('nazwisko').optional().trim(), query('sortBy').optional().isIn(['nazwisko', 'specjalizacja']),
  query('order').optional().isIn(['ASC', 'DESC'])
], validateRequest, async (req, res) => {
  const { specjalizacja, miasto, nazwisko, sortBy = 'nazwisko', order = 'ASC' } = req.query;
  try {
    let queryStr = 'SELECT * FROM lekarz WHERE 1=1';
    const params = [];
    if (specjalizacja) { queryStr += ' AND specjalizacja = ?'; params.push(specjalizacja); }
    if (miasto) { queryStr += ' AND adres LIKE ?'; params.push(`%${miasto}%`); }
    if (nazwisko) { queryStr += ' AND nazwisko LIKE ?'; params.push(`%${nazwisko}%`); }

    const allowedSort = ['nazwisko', 'specjalizacja'];
    const safeSort = allowedSort.includes(sortBy) ? sortBy : 'nazwisko';
    const safeOrder = order.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
    queryStr += ` ORDER BY ${safeSort} ${safeOrder}`;

    const [rows] = await pool.query(queryStr, params);
    res.json(rows);
  } catch (error) { res.status(500).json({ error: 'Wyszukiwanie nieudane' }); }
});

// 5. Doctor Profile
app.get('/api/doctors/:id', [param('id').isInt()], validateRequest, async (req, res) => {
  try {
    const [doctor] = await pool.query('SELECT * FROM lekarz WHERE id = ?', [req.params.id]);
    if (doctor.length === 0) return res.status(404).json({ error: 'Lekarz nie znaleziony' });
    const [ratings] = await pool.query('SELECT AVG(wartosc) as average_rating FROM ocena WHERE lekarz_id = ?', [req.params.id]);
    res.json({ ...doctor[0], average_rating: parseFloat(ratings[0].average_rating || 0) });
  } catch (error) { res.status(500).json({ error: 'Błąd pobierania profilu' }); }
});

// 6. Patient Profile (Appointments)
app.get('/api/patients/:id/appointments', [param('id').isInt()], authenticateToken, validateRequest, async (req, res) => {
  if (req.user.role !== 'admin' && req.user.id !== parseInt(req.params.id)) return res.status(403).json({ error: 'Brak dostępu' });
  try {
    const [visits] = await pool.query(
		`SELECT w.id, w.data, w.godzina, w.status, l.id as lekarz_id, l.imie as lekarz_imie, l.nazwisko as lekarz_nazwisko, l.specjalizacja
		FROM wizyta w JOIN termin t ON w.termin_id = t.id JOIN lekarz l ON t.lekarz_id = l.id
		WHERE w.pacjent_id = ? ORDER BY w.data ASC, w.godzina ASC`, [req.params.id]
    );
    res.json(visits);
  } catch (error) { res.status(500).json({ error: 'Błąd pobierania wizyt' }); }
});

// 7. Calendar (Available Slots)
app.get('/api/doctors/:id/availability', [param('id').isInt()], validateRequest, async (req, res) => {
  try {
    const [slots] = await pool.query('SELECT * FROM termin WHERE lekarz_id = ? AND dostepny = TRUE ORDER BY data ASC, godzina ASC', [req.params.id]);
    res.json(slots);
  } catch (error) { res.status(500).json({ error: 'Błąd pobierania terminów' }); }
});

// 8. Book Appointment (Transaction + Row Lock)
app.post('/api/appointments', [body('pacjent_id').isInt(), body('termin_id').isInt()], authenticateToken, validateRequest, async (req, res) => {
  const { pacjent_id, termin_id } = req.body;
  if (req.user.role !== 'admin' && req.user.id !== pacjent_id) return res.status(403).json({ error: 'Brak dostępu' });

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [slots] = await connection.query('SELECT * FROM termin WHERE id = ? AND dostepny = TRUE FOR UPDATE', [termin_id]);
    if (slots.length === 0) { await connection.rollback(); return res.status(400).json({ error: 'Termin zajęty' }); }

    const slot = slots[0];
    await connection.query('INSERT INTO wizyta (data, godzina, status, pacjent_id, termin_id) VALUES (?, ?, \'Zarezerwowana\', ?, ?)', [slot.data, slot.godzina, pacjent_id, termin_id]);
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
    res.json(rows);
  } catch (error) { 
    res.status(500).json({ error: 'Błąd pobierania listy lekarzy' }); 
  }
});

app.get('/api/admin/users', authenticateToken, authorizeRole('admin'), async (req, res) => {
  try {
    const [patients] = await pool.query('SELECT id, imie, nazwisko, email FROM pacjent');
    const [doctors] = await pool.query('SELECT id, imie, nazwisko, specjalizacja FROM lekarz');

    res.json({ patients, doctors });
  } catch (error) { 
    console.error("Błąd SQL przy pobieraniu użytkowników:", error);
    res.status(500).json({ error: 'Błąd pobierania użytkowników' }); 
  }
});

app.post('/api/admin/doctors', [body('imie').trim().notEmpty(), body('nazwisko').trim().notEmpty(), body('specjalizacja').trim().notEmpty(), body('adres').trim().notEmpty(), body('opis').optional().trim()], authenticateToken, authorizeRole('admin'), validateRequest, async (req, res) => {
  try {
    const [result] = await pool.query('INSERT INTO lekarz (imie, nazwisko, specjalizacja, adres, opis) VALUES (?, ?, ?, ?, ?)', [req.body.imie, req.body.nazwisko, req.body.specjalizacja, req.body.adres, req.body.opis]);
    res.status(201).json({ message: 'Lekarz dodany', id: result.insertId });
  } catch (error) { res.status(500).json({ error: 'Błąd dodawania lekarza' }); }
});

app.post('/api/admin/availability', [body('lekarz_id').isInt(), body('data').isDate(), body('godzina').matches(/^([01]\d|2[0-3]):([0-5]\d)$/)], authenticateToken, authorizeRole('admin'), validateRequest, async (req, res) => {
  try {
    await pool.query('INSERT INTO termin (data, godzina, dostepny, lekarz_id) VALUES (?, ?, TRUE, ?)', [req.body.data, req.body.godzina, req.body.lekarz_id]);
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

    await connection.query('UPDATE wizyta SET data = ?, godzina = ?, termin_id = ? WHERE id = ?', [newSlot.data, newSlot.godzina, req.body.nowy_termin_id, req.params.id]);
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
    const [visits] = await pool.query(`SELECT w.id, w.data, w.godzina, w.status, p.imie as pacjent_imie, p.nazwisko as pacjent_nazwisko, l.imie as lekarz_imie, l.nazwisko as lekarz_nazwisko FROM wizyta w JOIN pacjent p ON w.pacjent_id = p.id JOIN termin t ON w.termin_id = t.id JOIN lekarz l ON t.lekarz_id = l.id ORDER BY w.data ASC, w.godzina ASC`);
    res.json(visits);
  } catch (error) { res.status(500).json({ error: 'Błąd pobierania wizyt' }); }
});

app.delete('/api/admin/users/:id', [param('id').isInt()], authenticateToken, authorizeRole('admin'), validateRequest, async (req, res) => {
  try { await pool.query('DELETE FROM pacjent WHERE id = ?', [req.params.id]); res.json({ message: 'Użytkownik usunięty' }); }
  catch (error) { res.status(500).json({ error: 'Błąd usuwania użytkownika' }); }
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
  try { await pool.query('DELETE FROM lekarz WHERE id = ?', [req.params.id]); res.json({ message: 'Lekarz usunięty' }); }
  catch (error) { res.status(500).json({ error: 'Błąd usuwania lekarza' }); }
});

app.put('/api/admin/availability/:id', [param('id').isInt(), body('data').optional().isDate(), body('godzina').optional().matches(/^([01]\d|2[0-3]):([0-5]\d)$/), body('dostepny').optional().isBoolean()], authenticateToken, authorizeRole('admin'), validateRequest, async (req, res) => {
  try { await pool.query('UPDATE termin SET data = COALESCE(?, data), godzina = COALESCE(?, godzina), dostepny = COALESCE(?, dostepny) WHERE id = ?', [req.body.data, req.body.godzina, req.body.dostepny, req.params.id]); res.json({ message: 'Termin zaktualizowany' }); }
  catch (error) { res.status(500).json({ error: 'Błąd aktualizacji terminu' }); }
});

app.delete('/api/admin/availability/:id', [param('id').isInt()], authenticateToken, authorizeRole('admin'), validateRequest, async (req, res) => {
  try { await pool.query('DELETE FROM termin WHERE id = ?', [req.params.id]); res.json({ message: 'Termin usunięty' }); }
  catch (error) { res.status(500).json({ error: 'Błąd usuwania terminu' }); }
});

// 26. Delete Patient Account
app.delete('/api/patients/:id', [param('id').isInt()], authenticateToken, validateRequest, async (req, res) => {
  if (req.user.role !== 'admin' && req.user.id !== parseInt(req.params.id)) return res.status(403).json({ error: 'Brak dostępu' });
  try { await pool.query('DELETE FROM pacjent WHERE id = ?', [req.params.id]); res.json({ message: 'Konto usunięte' }); }
  catch (error) { res.status(500).json({ error: 'Błąd usuwania konta' }); }
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

const express = require('express');
const multer = require('multer');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
const PORT = 4000;

app.use(cors());
app.use(express.json());

// Pasta para uploads
const UPLOADS_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR);

// Configuração do multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const bookId = req.body.bookId || req.params.id;
    const bookDir = path.join(UPLOADS_DIR, bookId);
    if (!fs.existsSync(bookDir)) fs.mkdirSync(bookDir);
    cb(null, bookDir);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname);
  }
});
const upload = multer({ storage });

// Mock simples de livros (em memória)
let books = [];

// Usuários em memória: { email, passwordHash, id }
const users = [];

// Middleware de autenticação
function auth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Token ausente' });
  const token = authHeader.split(' ')[1];
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    next();
  } catch {
    return res.status(401).json({ error: 'Token inválido' });
  }
}

// Cadastro
app.post('/api/auth/register', async (req, res) => {
  const { email, password } = req.body;
  if (users.find(u => u.email === email)) return res.status(400).json({ error: 'Email já cadastrado' });
  const passwordHash = await bcrypt.hash(password, 10);
  const id = Date.now().toString();
  users.push({ email, passwordHash, id });
  res.json({ ok: true });
});

// Login
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  const user = users.find(u => u.email === email);
  if (!user) return res.status(400).json({ error: 'Usuário não encontrado' });
  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) return res.status(400).json({ error: 'Senha inválida' });
  const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET);
  res.json({ token });
});

// Progresso em memória: { [userId]: { [bookId]: { [audioName]: currentTime } } }
const progressData = {};

// Criar novo livro
app.post('/api/books', (req, res) => {
  const { title } = req.body;
  const id = Date.now().toString();
  books.push({ id, title });
  res.json({ id, title });
});

// Listar livros
app.get('/api/books', (req, res) => {
  res.json(books);
});

// Upload de MP3 para um livro
app.post('/api/books/:id/upload', upload.array('files'), (req, res) => {
  res.json({ files: req.files.map(f => ({ name: f.originalname, url: `/uploads/${req.params.id}/${f.filename}` })) });
});

// Listar áudios de um livro
app.get('/api/books/:id/audios', (req, res) => {
  const bookDir = path.join(UPLOADS_DIR, req.params.id);
  if (!fs.existsSync(bookDir)) return res.json([]);
  const files = fs.readdirSync(bookDir).map(filename => ({
    name: filename,
    url: `/uploads/${req.params.id}/${filename}`
  }));
  res.json(files);
});

// Salvar progresso (autenticado)
app.post('/api/books/:id/progress', auth, (req, res) => {
  const { audioName, currentTime } = req.body;
  const bookId = req.params.id;
  const userId = req.user.id;
  if (!progressData[userId]) progressData[userId] = {};
  if (!progressData[userId][bookId]) progressData[userId][bookId] = {};
  progressData[userId][bookId][audioName] = currentTime;
  res.json({ ok: true });
});

// Recuperar progresso (autenticado)
app.get('/api/books/:id/progress', auth, (req, res) => {
  const bookId = req.params.id;
  const userId = req.user.id;
  res.json(progressData[userId]?.[bookId] || {});
});

// Atualizar livro (nome/capa)
app.put('/api/books/:id', upload.single('cover'), (req, res) => {
  const book = books.find(b => b.id === req.params.id);
  if (!book) return res.status(404).json({ error: 'Livro não encontrado' });
  if (req.body.title) book.title = req.body.title;
  if (req.file) book.coverUrl = `/uploads/${book.id}/${req.file.filename}`;
  res.json(book);
});

// Servir arquivos estáticos
app.use('/uploads', express.static(UPLOADS_DIR));

app.listen(PORT, () => {
  console.log(`Backend rodando em http://localhost:${PORT}`);
}); 
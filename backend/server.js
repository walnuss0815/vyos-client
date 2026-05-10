'use strict';

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const express   = require('express');
const path      = require('path');
const https     = require('https');
const helmet    = require('helmet');
const cors      = require('cors');
const rateLimit = require('express-rate-limit');
const jwt       = require('jsonwebtoken');
const bcrypt    = require('bcryptjs');
const fetch     = require('node-fetch');
const FormData  = require('form-data');
const morgan    = require('morgan');

const PORT        = Number(process.env.PORT             || 3001);
const APP_USER    = process.env.APP_USER                || 'admin';
const APP_PASSWORD= process.env.APP_PASSWORD            || 'changeme';
const JWT_SECRET  = process.env.JWT_SECRET              || 'replace-me';
const JWT_EXPIRES = process.env.JWT_EXPIRES             || '8h';
const VYOS_HOST   = (process.env.VYOS_HOST              || 'https://vyos').replace(/\/$/, '');
const VYOS_KEY    = process.env.VYOS_KEY                || '';
const VERIFY_TLS  = process.env.VYOS_VERIFY_TLS         === 'true';
const CORS_ORIGIN = process.env.CORS_ORIGIN             || '*';

const app          = express();
const passwordHash = bcrypt.hashSync(APP_PASSWORD, 10);
const httpsAgent   = new https.Agent({ rejectUnauthorized: VERIFY_TLS });
const frontendDist = path.resolve(__dirname, '../frontend-dist');

app.disable('x-powered-by');
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: CORS_ORIGIN, credentials: true }));
app.use(express.json({ limit: '1mb' }));
app.use(morgan('combined'));

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 600,
  standardHeaders: true,
  legacyHeaders: false,
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Please try again later.' },
});

app.use('/api',  apiLimiter);
app.use('/auth', apiLimiter);

function createToken(username) {
  return jwt.sign({ sub: username }, JWT_SECRET, { expiresIn: JWT_EXPIRES });
}

function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing Bearer token.' });
  }
  try {
    req.user = jwt.verify(header.slice(7), JWT_SECRET);
    return next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token.' });
  }
}

async function vyosPost(endpoint, payload) {
  if (!VYOS_KEY) throw new Error('VYOS_KEY is not set.');
  const form = new FormData();
  form.append('key',  VYOS_KEY);
  form.append('data', JSON.stringify(payload));
  const response = await fetch(`${VYOS_HOST}${endpoint}`, {
    method: 'POST',
    body:   form,
    agent:  httpsAgent,
  });
  const body = await response.json();
  return { status: response.status, body };
}

async function vyosGet(endpoint) {
  const response = await fetch(`${VYOS_HOST}${endpoint}`, {
    method: 'GET',
    agent:  httpsAgent,
  });
  const body = await response.json();
  return { status: response.status, body };
}

// Health
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// Auth
app.post('/auth/login', loginLimiter, async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required.' });
  }
  const userMatches     = username === APP_USER;
  const passwordMatches = await bcrypt.compare(password, passwordHash);
  if (!userMatches || !passwordMatches) {
    return res.status(401).json({ error: 'Invalid credentials.' });
  }
  return res.json({ token: createToken(username), expiresIn: JWT_EXPIRES, user: username });
});

app.get('/auth/verify', requireAuth, (req, res) => {
  res.json({ valid: true, user: req.user.sub });
});

app.post('/auth/logout', requireAuth, (_req, res) => {
  res.json({ success: true });
});

// VyOS proxy
app.get('/api/info', requireAuth, async (_req, res) => {
  try {
    const result = await vyosGet('/info');
    res.status(result.status).json(result.body);
  } catch (error) {
    res.status(502).json({ error: error.message });
  }
});

app.post('/api/retrieve', requireAuth, async (req, res) => {
  try {
    const op           = req.body?.op || 'showConfig';
    const pathSegments = Array.isArray(req.body?.path) ? req.body.path : [];
    const result       = await vyosPost('/retrieve', { op, path: pathSegments });
    res.status(result.status).json(result.body);
  } catch (error) {
    res.status(502).json({ error: error.message });
  }
});

app.post('/api/configure', requireAuth, async (req, res) => {
  try {
    const commands = req.body?.commands;
    if (!Array.isArray(commands) || commands.length === 0) {
      return res.status(400).json({ error: 'commands must be a non-empty array.' });
    }
    const result = await vyosPost('/configure', commands);
    return res.status(result.status).json(result.body);
  } catch (error) {
    return res.status(502).json({ error: error.message });
  }
});

app.post('/api/save', requireAuth, async (req, res) => {
  try {
    const file   = typeof req.body?.file === 'string' && req.body.file.trim()
      ? req.body.file.trim()
      : undefined;
    const result = await vyosPost('/config-file', file ? { op: 'save', file } : { op: 'save' });
    return res.status(result.status).json(result.body);
  } catch (error) {
    return res.status(502).json({ error: error.message });
  }
});

app.post('/api/load', requireAuth, async (req, res) => {
  try {
    const file = req.body?.file;
    if (!file) return res.status(400).json({ error: 'file is required.' });
    const result = await vyosPost('/config-file', { op: 'load', file });
    return res.status(result.status).json(result.body);
  } catch (error) {
    return res.status(502).json({ error: error.message });
  }
});

app.post('/api/reset-node', requireAuth, async (req, res) => {
  try {
    const pathSegments = Array.isArray(req.body?.path) ? req.body.path : [];
    const result       = await vyosPost('/reset', { op: 'reset', path: pathSegments });
    return res.status(result.status).json(result.body);
  } catch (error) {
    return res.status(502).json({ error: error.message });
  }
});

app.post('/api/show', requireAuth, async (req, res) => {
  try {
    const pathSegments = Array.isArray(req.body?.path) ? req.body.path : [];
    const result       = await vyosPost('/show', { op: 'show', path: pathSegments });
    return res.status(result.status).json(result.body);
  } catch (error) {
    return res.status(502).json({ error: error.message });
  }
});

// SPA static hosting
app.use(express.static(frontendDist));
app.get('*', (_req, res) => {
  res.sendFile(path.join(frontendDist, 'index.html'));
});

app.listen(PORT, () => {
  console.log(JSON.stringify({
    event:     'startup',
    port:      PORT,
    vyosHost:  VYOS_HOST,
    verifyTls: VERIFY_TLS,
  }));
});

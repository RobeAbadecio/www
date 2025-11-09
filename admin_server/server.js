const express = require('express');
const session = require('express-session');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const AdmZip = require('adm-zip');

const app = express();
const WEBROOT = path.join(__dirname, '..'); // c:\wamp64\www
const PORT = 3001;
const HOST = '127.0.0.1'; // bind to localhost only

// Simple credentials - change these for security
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || 'password';

// Session setup
app.use(session({
    secret: 'local-admin-secret-change-me',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false }
}));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Serve admin static UI
app.use('/admin', express.static(path.join(__dirname, 'public')));

// Simple auth middleware for POST actions / admin API
function ensureAuth(req, res, next) {
    if (req.session && req.session.authenticated) return next();
    return res.status(401).json({ error: 'Unauthorized' });
}

// Login endpoint (POST)
app.post('/admin/login', (req, res) => {
    const { username, password } = req.body;
    if (username === ADMIN_USER && password === ADMIN_PASS) {
        req.session.authenticated = true;
        return res.redirect('/admin/');
    }
    return res.redirect('/admin/?error=1');
});

app.get('/admin/logout', (req, res) => {
    req.session.destroy(() => res.redirect('/admin/'));
});

// Upload zip and extract into webroot
const upload = multer({ dest: path.join(__dirname, 'tmp') });
app.post('/admin/upload', ensureAuth, upload.single('projectZip'), (req, res) => {
    if (!req.file) return res.status(400).send('No file uploaded');
    const name = req.body.destinationName || req.file.originalname.replace(/\.[^.]+$/, '');
    // sanitize name
    const safeName = name.replace(/[^a-zA-Z0-9-_]/g, '-').replace(/^-+|-+$/g, '') || ('project-' + Date.now());
    const destFolder = path.join(WEBROOT, safeName);
    if (destFolder.indexOf(WEBROOT) !== 0) return res.status(400).send('Invalid destination');

    try {
        if (!fs.existsSync(destFolder)) fs.mkdirSync(destFolder);
        const zip = new AdmZip(req.file.path);
        zip.extractAllTo(destFolder, true);
        // cleanup upload
        fs.unlinkSync(req.file.path);
        return res.redirect('/admin/?uploaded=1');
    } catch (err) {
        console.error(err);
        return res.status(500).send('Extraction failed: ' + err.message);
    }
});

// Add a web-app entry to apps.json in webroot
app.post('/admin/add-app', ensureAuth, (req, res) => {
    const { title, link } = req.body;
    if (!title || !link) return res.status(400).json({ error: 'title and link required' });
    const appsFile = path.join(WEBROOT, 'apps.json');
    let apps = [];
    if (fs.existsSync(appsFile)) {
        try { apps = JSON.parse(fs.readFileSync(appsFile, 'utf8') || '[]'); } catch (e) { apps = []; }
    }
    // create simple id
    const id = 'srv-' + Math.random().toString(36).slice(2, 9);
    apps.push({ id, title: String(title), link: String(link) });
    fs.writeFileSync(appsFile, JSON.stringify(apps, null, 2), 'utf8');
    return res.json({ ok: true });
});

// Health endpoint
app.get('/admin/ping', ensureAuth, (req, res) => res.json({ ok: true }));

// Start only on localhost
app.listen(PORT, HOST, () => {
    console.log(`Admin server running at http://${HOST}:${PORT}/admin`);
    console.log('Change ADMIN_USER/ADMIN_PASS environment variables to secure the admin area.');
});
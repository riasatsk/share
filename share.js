const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const express = require('express');
const qrcode = require('qrcode-terminal');
const multer = require('multer');

/**
 * Share CLI - Transfer files over WiFi via QR Code
 */

// --- Configuration & Constants ---
const DEFAULT_PORT = 3000;
const MAX_PORT_RETRIES = 10;
const TOKEN = crypto.randomBytes(8).toString('hex');
const DOWNLOADS_DIR = path.join(os.homedir(), 'Downloads');

if (!fs.existsSync(DOWNLOADS_DIR)) {
    fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });
}

// --- Minimal Dark CSS Template ---
const SHARED_CSS = `
:root { color-scheme: dark; }
body { font-family: system-ui; display: grid; place-items: center; min-height: 100vh; margin: 0; text-align: center; }
.card { padding: 2rem; border: 1px solid #444; border-radius: 1rem; max-width: 320px; }
.btn { display: inline-block; padding: 0.6rem 1.2rem; background: #fff; color: #000; text-decoration: none; border-radius: 0.5rem; font-weight: bold; margin-top: 1rem; border: none; cursor: pointer; }
input { display: block; width: 100%; margin: 1rem 0; }
`;

// --- Argument Parsing ---
const args = process.argv.slice(2);
const mode = args[0] === 'seek' ? 'seek' : 'share';
const files = args.filter(arg => !arg.startsWith('--') && arg !== 'seek');
const flags = args.filter(arg => arg.startsWith('--')).reduce((acc, flag) => {
    const [key, value] = flag.replace(/^--/, '').split('=');
    acc[key] = value || true;
    return acc;
}, {});

if (mode === 'share' && files.length === 0) {
    console.error('Error: Please specify a file to share.');
    process.exit(1);
}

const filePath = mode === 'share' ? path.resolve(files[0]) : null;
const limit = parseInt(flags.limit) || 1;
const password = flags.password;
let sessionCount = 0;

// --- Helper Functions ---
function getLocalIP() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) return iface.address;
        }
    }
    return '127.0.0.1';
}

function formatSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// --- Multer Setup ---
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, DOWNLOADS_DIR),
    filename: (req, file, cb) => {
        // Fix for non-English filenames (Multer defaults to latin1)
        const originalName = Buffer.from(file.originalname, 'latin1').toString('utf8');
        const ext = path.extname(originalName);
        const name = path.basename(originalName, ext);
        
        const finalName = fs.existsSync(path.join(DOWNLOADS_DIR, originalName)) 
            ? `${name}-${Date.now()}${ext}` 
            : originalName;
        cb(null, finalName);
    }
});
const upload = multer({ storage });

// --- Server Implementation ---
const app = express();
app.use(express.urlencoded({ extended: true }));

const authMiddleware = (req, res, next) => {
    if (!password) return next();
    if (req.query.pw === password || req.body?.pw === password) return next();
    res.status(401).send(`
        <html><head><meta name="viewport" content="width=device-width, initial-scale=1.0"><style>${SHARED_CSS}</style></head>
        <body><div class="card"><h2>Locked</h2><p>Please enter the password</p>
        <form method="GET"><input type="password" name="pw" placeholder="Password" autofocus><button type="submit" class="btn">Unlock</button></form>
        </div></body></html>
    `);
};

// --- ROUTES ---
if (mode === 'share') {
    const fileName = path.basename(filePath);
    const fileSize = formatSize(fs.statSync(filePath).size);

    app.get(`/download/${TOKEN}`, authMiddleware, (req, res) => {
        const pwQuery = password ? `?pw=${password}` : '';
        res.send(`
            <html><head><meta name="viewport" content="width=device-width, initial-scale=1.0"><style>${SHARED_CSS}</style></head>
            <body><div class="card"><h3>${fileName}</h3><p>${fileSize}</p>
            <a href="/download/${TOKEN}/file${pwQuery}" class="btn">Download</a>
            </div></body></html>
        `);
    });

    app.get(`/download/${TOKEN}/file`, authMiddleware, (req, res) => {
        res.download(filePath, fileName, (err) => {
            if (!err) {
                sessionCount++;
                if (sessionCount >= limit) process.exit(0);
            }
        });
    });
}

if (mode === 'seek') {
    app.get(`/upload/${TOKEN}`, authMiddleware, (req, res) => {
        res.send(`
            <html><head><meta name="viewport" content="width=device-width, initial-scale=1.0"><style>${SHARED_CSS}</style></head>
            <body><div class="card"><h2>Upload</h2><p>To computer downloads</p>
            <form action="/upload/${TOKEN}" method="POST" enctype="multipart/form-data">
                ${password ? `<input type="hidden" name="pw" value="${password}">` : ''}
                <input type="file" name="files" multiple required>
                <button type="submit" class="btn">Send Files</button>
            </form></div></body></html>
        `);
    });

    app.post(`/upload/${TOKEN}`, upload.array('files'), (req, res) => {
        console.log(`[${new Date().toLocaleTimeString()}] Received ${req.files.length} file(s)`);
        res.send(`
            <html><head><meta name="viewport" content="width=device-width, initial-scale=1.0"><style>${SHARED_CSS}</style></head>
            <body><div class="card"><h2 style="color:var(--success)">Done!</h2><p>Files saved successfully.</p>
            <a href="/upload/${TOKEN}${password ? `?pw=${password}` : ''}" class="btn">Upload More</a>
            </div></body></html>
        `);
        sessionCount++;
        if (sessionCount >= limit) setTimeout(() => process.exit(0), 1000);
    });
}

function startServer(port) {
    app.listen(port, () => {
        const localIP = getLocalIP();
        const endpoint = mode === 'share' ? `download/${TOKEN}` : `upload/${TOKEN}`;
        const url = `http://${localIP}:${port}/${endpoint}`;
        console.log(`\n SHARE CLI - ${mode.toUpperCase()} MODE\n ${'='.repeat(30)}\n URL: ${url}\n ${'='.repeat(30)}`);
        qrcode.generate(url, { small: true });
    }).on('error', (err) => {
        if (err.code === 'EADDRINUSE') startServer(port + 1);
        else process.exit(1);
    });
}

startServer(DEFAULT_PORT);

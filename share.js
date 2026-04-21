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

// Ensure Downloads directory exists (usually does)
if (!fs.existsSync(DOWNLOADS_DIR)) {
    fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });
}

// --- Argument Parsing ---
const args = process.argv.slice(2);
const mode = args[0] === 'seek' ? 'seek' : 'share';
const files = args.filter(arg => !arg.startsWith('--') && arg !== 'seek');
const flags = args.filter(arg => arg.startsWith('--')).reduce((acc, flag) => {
    const [key, value] = flag.replace(/^--/, '').split('=');
    acc[key] = value || true;
    return acc;
}, {});

// Validation for "share" mode
if (mode === 'share' && files.length === 0) {
    console.error('Error: Please specify a file to share.');
    console.log('Usage:');
    console.log('  node share.js <filename>      (Share a file)');
    console.log('  node share.js seek            (Receive files)');
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
            if (iface.family === 'IPv4' && !iface.internal) {
                return iface.address;
            }
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

// Share validation
if (mode === 'share') {
    if (!fs.existsSync(filePath)) {
        console.error(`Error: File not found: ${filePath}`);
        process.exit(1);
    }
    const stats = fs.statSync(filePath);
    if (!stats.isFile()) {
        console.error(`Error: Path is not a file: ${filePath}`);
        process.exit(1);
    }
}

// --- Multer Setup (for seek mode) ---
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, DOWNLOADS_DIR),
    filename: (req, file, cb) => {
        // Prevent overwriting: append timestamp if file exists
        const ext = path.extname(file.originalname);
        const name = path.basename(file.originalname, ext);
        const finalName = fs.existsSync(path.join(DOWNLOADS_DIR, file.originalname)) 
            ? `${name}-${Date.now()}${ext}` 
            : file.originalname;
        cb(null, finalName);
    }
});
const upload = multer({ storage });

// --- Server Implementation ---
const app = express();

const authMiddleware = (req, res, next) => {
    if (!password) return next();
    if (req.query.pw === password || req.body?.pw === password) return next();
    
    res.status(401).send(`
        <html>
            <body style="font-family: sans-serif; text-align: center; padding-top: 50px;">
                <h2>Password Protected</h2>
                <form method="GET">
                    <input type="password" name="pw" placeholder="Enter Password" style="padding: 10px; border-radius: 5px; border: 1px solid #ccc;">
                    <button type="submit" style="padding: 10px 20px; background: #007bff; color: white; border: none; border-radius: 5px; cursor: pointer;">Submit</button>
                </form>
            </body>
        </html>
    `);
};

app.use((req, res, next) => {
    console.log(`[${new Date().toLocaleTimeString()}] Access from ${req.ip} to ${req.path}`);
    next();
});

// --- ROUTES: SHARE MODE ---
if (mode === 'share') {
    const fileName = path.basename(filePath);
    const fileSize = formatSize(fs.statSync(filePath).size);

    app.get(`/download/${TOKEN}`, authMiddleware, (req, res) => {
        const pwQuery = password ? `?pw=${password}` : '';
        res.send(`
            <!DOCTYPE html>
            <html>
            <head>
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <style>
                    body { font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #f0f2f5; }
                    .card { background: white; padding: 2rem; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); text-align: center; width: 320px; }
                    .btn { display: inline-block; background: #007bff; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold; margin-top: 1rem; }
                </style>
            </head>
            <body>
                <div class="card">
                    <h3>${fileName}</h3>
                    <p>Size: ${fileSize}</p>
                    <a href="/download/${TOKEN}/file${pwQuery}" class="btn">Download File</a>
                </div>
            </body>
            </html>
        `);
    });

    app.get(`/download/${TOKEN}/file`, authMiddleware, (req, res) => {
        res.download(filePath, fileName, (err) => {
            if (!err) {
                sessionCount++;
                console.log(`[${new Date().toLocaleTimeString()}] Successfully shared (${sessionCount}/${limit})`);
                if (sessionCount >= limit) {
                    console.log('Limit reached. Shutting down...');
                    process.exit(0);
                }
            }
        });
    });
}

// --- ROUTES: SEEK MODE ---
if (mode === 'seek') {
    app.get(`/upload/${TOKEN}`, authMiddleware, (req, res) => {
        res.send(`
            <!DOCTYPE html>
            <html>
            <head>
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <style>
                    body { font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #e9ecef; }
                    .card { background: white; padding: 2rem; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); text-align: center; width: 320px; }
                    input[type="file"] { margin: 1.5rem 0; width: 100%; }
                    .btn { background: #28a745; color: white; padding: 12px 24px; border-radius: 8px; border: none; font-weight: bold; cursor: pointer; width: 100%; }
                </style>
            </head>
            <body>
                <div class="card">
                    <h2>Upload to Computer</h2>
                    <form action="/upload/${TOKEN}" method="POST" enctype="multipart/form-data">
                        ${password ? `<input type="hidden" name="pw" value="${password}">` : ''}
                        <input type="file" name="files" multiple required>
                        <button type="submit" class="btn">Upload Files</button>
                    </form>
                </div>
            </body>
            </html>
        `);
    });

    app.post(`/upload/${TOKEN}`, upload.array('files'), (req, res) => {
        if (!req.files || req.files.length === 0) {
            return res.status(400).send('No files uploaded.');
        }
        
        console.log(`[${new Date().toLocaleTimeString()}] Received ${req.files.length} file(s):`);
        req.files.forEach(f => console.log(` - ${f.originalname} -> Downloads/`));

        res.send(`
            <html>
                <body style="font-family: sans-serif; text-align: center; padding-top: 50px;">
                    <h2 style="color: #28a745;">Upload Successful!</h2>
                    <p>Files saved to the Downloads folder on the computer.</p>
                    <a href="/upload/${TOKEN}${password ? `?pw=${password}` : ''}">Upload more</a>
                </body>
            </html>
        `);

        sessionCount++;
        if (sessionCount >= limit) {
            console.log('Upload limit reached. Shutting down...');
            setTimeout(() => process.exit(0), 1000); // Small delay to let response finish
        }
    });
}

// --- Start Server ---
function startServer(port) {
    app.listen(port, () => {
        const localIP = getLocalIP();
        const endpoint = mode === 'share' ? `download/${TOKEN}` : `upload/${TOKEN}`;
        const url = `http://${localIP}:${port}/${endpoint}`;

        console.log('\n' + '='.repeat(40));
        console.log(` SHARE CLI - ${mode.toUpperCase()} MODE `);
        console.log('='.repeat(40));
        if (mode === 'share') {
            console.log(`File:     ${path.basename(filePath)}`);
        } else {
            console.log(`Target:   ${DOWNLOADS_DIR}`);
        }
        console.log(`Limit:    ${limit} session(s)`);
        if (password) console.log(`Password: enabled`);
        console.log('='.repeat(40));

        qrcode.generate(url, { small: true });

        console.log('\nScan the QR code above or open this URL:');
        console.log(`\x1b[36m${url}\x1b[0m\n`);
        console.log('Waiting for connections...');
    }).on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
            startServer(port + 1);
        } else {
            console.error('Server error:', err.message);
            process.exit(1);
        }
    });
}

startServer(DEFAULT_PORT);

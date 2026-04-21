# 🚀 Share CLI

**Share CLI** is a lightweight, zero-config Node.js tool that lets you transfer files between your computer and mobile devices over the same Wi-Fi network using QR codes. No cloud, no external servers—just fast, local transfers.

---

## ✨ Features

- **📤 Share Mode (Computer → Mobile):** Share any file from your PC to your phone instantly.
- **📥 Seek Mode (Mobile → Computer):** Upload files from your phone directly to your computer's `Downloads` folder.
- **📱 QR Code Generation:** Scan a code in your terminal to open the transfer page on your mobile.
- **🔒 Security:** 
  - Unique, session-based random tokens for every run.
  - Optional password protection for download/upload routes.
- **⚙️ Smart Networking:** 
  - Auto-detects your local IPv4 address.
  - Auto-finds an available port if the default (3000) is busy.
- **💾 Safe Uploads:** Prevents overwriting existing files by appending timestamps to duplicate filenames.
- **⌛ Session Control:** Automatically shuts down the server after a configurable number of transfers.

---

## 🛠️ Installation

1. **Clone or download** this repository.
2. **Install dependencies** using npm:

```bash
npm install
```

*Alternatively, manually install the required packages:*
```bash
npm install express qrcode-terminal multer
```

---

## 🚀 Usage

### 1. Share a File (PC to Mobile)
To share a specific file, simply run:
```bash
node share.js my-presentation.pdf
```
Scan the QR code on your phone to download the file.

### 2. Seek Mode (Mobile to PC)
To receive files from your mobile device:
```bash
node share.js seek
```
This opens an upload page on your phone. Uploaded files are saved to your `Downloads` folder.

---

## 🔧 Advanced Options

You can combine flags with either mode:

| Flag | Description | Example |
| :--- | :--- | :--- |
| `--limit=n` | Shut down the server after `n` successful transfers (Default: 1). | `node share.js seek --limit=5` |
| `--password=...` | Protect the link with a password. | `node share.js file.zip --password=secret123` |

### Examples:
- **Share with password:** `node share.js top-secret.docx --password=1234`
- **Receive up to 10 files:** `node share.js seek --limit=10`

---

## 📝 Requirements

- **Node.js:** v12.0.0 or higher.
- **Network:** Both devices must be connected to the **same Wi-Fi/Local Network**.

---

## 🛠️ Built With

- [Express.js](https://expressjs.com/) - Web framework for the transfer server.
- [Multer](https://github.com/expressjs/multer) - Middleware for handling file uploads.
- [QRCode-Terminal](https://github.com/gtanner/qrcode-terminal) - Displays QR codes directly in your console.

---

## ⚖️ License

This project is open-source and available under the [ISC License](LICENSE).

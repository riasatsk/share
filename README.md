# 🚀 Share CLI (Go Version)

**Share CLI** is a high-performance, single-binary tool designed for lightning-fast file transfers between your computer and mobile devices over a local Wi-Fi network using QR codes. No internet, no cloud, and no configuration required.

---

## ✨ Features

- **⚡ Single Binary:** No runtime (Node.js/Python) required. Just run the `share.exe`.
- **📤 Share Mode (PC → Mobile):** Share any file from your computer to your phone.
- **📥 Seek Mode (Mobile → PC):** Receive files from your phone directly into your `Downloads` folder.
- **📱 QR Code Integration:** Instantly generate a terminal-based QR code for easy mobile access.
- **🔒 Security First:** 
  - Random session tokens to prevent unauthorized access.
  - Optional password protection for all transfers.
- **🌑 Native Dark Mode:** Minimalist, high-performance web interface that respects system dark mode.
- **⌛ Session Control:** Automatically shuts down the server after a set number of transfers.
- **🌍 International Support:** Full UTF-8 support for non-English filenames (Arabic, Chinese, etc.).

---

## 🛠️ Getting Started

### 1. Download/Build
You can use the pre-compiled `share.exe` or build it yourself:
```bash
go build -o share.exe main.go
```

### 2. Basic Usage
**To share a file:**
```bash
./share.exe my-presentation.pdf
```

**To receive files (Seek Mode):**
```bash
./share.exe seek
```

---

## 🔧 Advanced Commands

| Feature | Command |
| :--- | :--- |
| **Password Protect** | `./share.exe <file> -password=secret123` |
| **Limit Sessions** | `./share.exe <file> -limit=5` (Shuts down after 5 downloads) |
| **Combine Flags** | `./share.exe seek -password=123 -limit=10` |

---

## 📶 No Wi-Fi? No Problem! (Mobile Hotspot)

If you are traveling or have no router:
1.  Turn on your **Mobile Hotspot** on your phone.
2.  Connect your laptop to that hotspot.
3.  Run the app as usual. The transfer will happen **directly** over the phone's Wi-Fi signal without using any cellular data.

---

## 🏗️ Project Structure

- **`share.exe`**: The standalone Windows binary (Run this!).
- **`main.go`**: The Go source code.
- **`node-share/`**: The original Node.js implementation (Legacy version).

---

## 🛠️ Build Requirements

To recompile the project, you need:
- **Go 1.18+**
- Dependency: `github.com/mdp/qrterminal/v3`

```bash
go get github.com/mdp/qrterminal/v3
go build -o share.exe main.go
```

---

## ⚖️ License
This project is open-source and available under the [ISC License](LICENSE).

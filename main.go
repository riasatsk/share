package main

import (
	"crypto/rand"
	"encoding/hex"
	"flag"
	"fmt"
	"io"
	"log"
	"mime/multipart"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"time"

	"github.com/mdp/qrterminal/v3"
)

// --- Configuration & Constants ---
const (
	DefaultPort    = 3000
	MaxPortRetries = 10
)

var (
	token          = generateToken(8)
	downloadsDir   = filepath.Join(homeDir(), "Downloads")
	sessionCount   = 0
	limit          int
	password       string
	mode           string
	filePath       string
	fileName       string
	fileSizeStr    string
)

// --- CSS Template ---
const sharedCSS = `
:root { color-scheme: dark; }
body { font-family: system-ui; display: grid; place-items: center; min-height: 100vh; margin: 0; text-align: center; }
.card { padding: 2rem; border: 1px solid #444; border-radius: 1rem; max-width: 320px; width: 90%; }
.btn { display: inline-block; padding: 0.6rem 1.2rem; background: #fff; color: #000; text-decoration: none; border-radius: 0.5rem; font-weight: bold; margin-top: 1rem; border: none; cursor: pointer; width: 100%; }
input { display: block; width: 100%; margin: 1rem 0; padding: 0.5rem; border-radius: 0.4rem; border: 1px solid #666; background: #222; color: #fff; }
`

// --- Main Application ---
func main() {
	flag.IntVar(&limit, "limit", 1, "Number of sessions before shutdown")
	flag.StringVar(&password, "password", "", "Password for protection")
	flag.Parse()

	args := flag.Args()
	if len(args) == 0 {
		fmt.Println("Usage:")
		fmt.Println("  share <filename>  (Share mode)")
		fmt.Println("  share seek        (Seek mode)")
		os.Exit(1)
	}

	if args[0] == "seek" {
		mode = "seek"
		if _, err := os.Stat(downloadsDir); os.IsNotExist(err) {
			os.MkdirAll(downloadsDir, 0755)
		}
	} else {
		mode = "share"
		filePath, _ = filepath.Abs(args[0])
		info, err := os.Stat(filePath)
		if err != nil {
			fmt.Printf("Error: File not found: %s\n", filePath)
			os.Exit(1)
		}
		fileName = filepath.Base(filePath)
		fileSizeStr = formatSize(info.Size())
	}

	startServer(DefaultPort)
}

// --- Handlers ---

func authMiddleware(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if password == "" {
			next(w, r)
			return
		}

		enteredPw := r.URL.Query().Get("pw")
		if enteredPw == "" {
			enteredPw = r.FormValue("pw")
		}

		if enteredPw == password {
			next(w, r)
			return
		}

		w.WriteHeader(http.StatusUnauthorized)
		fmt.Fprintf(w, `<html><head><meta name="viewport" content="width=device-width, initial-scale=1.0"><style>%s</style></head>
			<body><div class="card"><h2>Locked</h2><p>Please enter the password</p>
			<form method="GET"><input type="password" name="pw" placeholder="Password" autofocus><button type="submit" class="btn">Unlock</button></form>
			</div></body></html>`, sharedCSS)
	}
}

func shareHandler(w http.ResponseWriter, r *http.Request) {
	pwParam := ""
	if password != "" {
		pwParam = "?pw=" + password
	}
	fmt.Fprintf(w, `<html><head><meta name="viewport" content="width=device-width, initial-scale=1.0"><style>%s</style></head>
		<body><div class="card"><h3>%s</h3><p>%s</p>
		<a href="/download/%s/file%s" class="btn">Download</a>
		</div></body></html>`, sharedCSS, fileName, fileSizeStr, token, pwParam)
}

func fileHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=\"%s\"", fileName))
	http.ServeFile(w, r, filePath)
	log.Printf("File shared successfully.")
	sessionCount++
	if sessionCount >= limit {
		go func() {
			time.Sleep(1 * time.Second)
			os.Exit(0)
		}()
	}
}

func seekHandler(w http.ResponseWriter, r *http.Request) {
	pwField := ""
	if password != "" {
		pwField = fmt.Sprintf(`<input type="hidden" name="pw" value="%s">`, password)
	}
	fmt.Fprintf(w, `<html><head><meta name="viewport" content="width=device-width, initial-scale=1.0"><style>%s</style></head>
		<body><div class="card"><h2>Upload</h2><p>To computer downloads</p>
		<form action="/upload/%s" method="POST" enctype="multipart/form-data">
			%s
			<input type="file" name="files" multiple required>
			<button type="submit" class="btn">Send Files</button>
		</form></div></body></html>`, sharedCSS, token, pwField)
}

func uploadHandler(w http.ResponseWriter, r *http.Request) {
	err := r.ParseMultipartForm(100 << 20) // 100MB
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	files := r.MultipartForm.File["files"]
	for _, fileHeader := range files {
		saveFile(fileHeader)
	}

	log.Printf("Received %d file(s)", len(files))
	pwParam := ""
	if password != "" {
		pwParam = "?pw=" + password
	}
	fmt.Fprintf(w, `<html><head><meta name="viewport" content="width=device-width, initial-scale=1.0"><style>%s</style></head>
		<body><div class="card"><h2 style="color:#22c55e">Done!</h2><p>Files saved successfully.</p>
		<a href="/upload/%s%s" class="btn">Upload More</a>
		</div></body></html>`, sharedCSS, token, pwParam)

	sessionCount++
	if sessionCount >= limit {
		go func() {
			time.Sleep(1 * time.Second)
			os.Exit(0)
		}()
	}
}

// --- Utils ---

func saveFile(fileHeader *multipart.FileHeader) {
	file, _ := fileHeader.Open()
	defer file.Close()

	originalName := fileHeader.Filename
	ext := filepath.Ext(originalName)
	nameOnly := strings.TrimSuffix(originalName, ext)
	
	savePath := filepath.Join(downloadsDir, originalName)
	if _, err := os.Stat(savePath); err == nil {
		savePath = filepath.Join(downloadsDir, fmt.Sprintf("%s-%d%s", nameOnly, time.Now().Unix(), ext))
	}

	dst, _ := os.Create(savePath)
	defer dst.Close()
	io.Copy(dst, file)
	log.Printf(" - Saved: %s", filepath.Base(savePath))
}

func startServer(port int) {
	mux := http.NewServeMux()
	if mode == "share" {
		mux.HandleFunc("/download/"+token, authMiddleware(shareHandler))
		mux.HandleFunc("/download/"+token+"/file", authMiddleware(fileHandler))
	} else {
		mux.HandleFunc("/upload/"+token, authMiddleware(seekHandler))
		mux.HandleFunc("/upload/"+token, authMiddleware(uploadHandler))
	}

	localIP := getLocalIP()
	endpoint := "download/" + token
	if mode == "seek" {
		endpoint = "upload/" + token
	}
	url := fmt.Sprintf("http://%s:%d/%s", localIP, port, endpoint)

	fmt.Printf("\n SHARE CLI - %s MODE\n %s\n URL: %s\n %s\n", strings.ToUpper(mode), strings.Repeat("=", 30), url, strings.Repeat("=", 30))
	
	config := qrterminal.Config{
		Level:     qrterminal.L,
		Writer:    os.Stdout,
		BlackChar: qrterminal.BLACK,
		WhiteChar: qrterminal.WHITE,
		QuietZone: 1,
	}
	qrterminal.GenerateWithConfig(url, config)

	addr := fmt.Sprintf(":%d", port)
	err := http.ListenAndServe(addr, mux)
	if err != nil {
		if strings.Contains(err.Error(), "address already in use") && port < DefaultPort+MaxPortRetries {
			startServer(port + 1)
		} else {
			log.Fatal(err)
		}
	}
}

func getLocalIP() string {
	addrs, _ := net.InterfaceAddrs()
	for _, address := range addrs {
		if ipnet, ok := address.(*net.IPNet); ok && !ipnet.IP.IsLoopback() {
			if ipnet.IP.To4() != nil {
				return ipnet.IP.String()
			}
		}
	}
	return "127.0.0.1"
}

func generateToken(n int) string {
	b := make([]byte, n)
	rand.Read(b)
	return hex.EncodeToString(b)
}

func formatSize(bytes int64) string {
	const unit = 1024
	if bytes < unit {
		return fmt.Sprintf("%d B", bytes)
	}
	div, exp := int64(unit), 0
	for n := bytes / unit; n >= unit; n /= unit {
		div *= unit
		exp++
	}
	return fmt.Sprintf("%.2f %cB", float64(bytes)/float64(div), "KMGTPE"[exp])
}

func homeDir() string {
	if runtime.GOOS == "windows" {
		return os.Getenv("USERPROFILE")
	}
	return os.Getenv("HOME")
}

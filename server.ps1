# Built-in Windows PowerShell HTTP + Local Multiplayer Room Relay Server
# Zero external dependencies required (uses .NET System.Net.HttpListener)

param(
    [int]$Port = 8080
)

$ErrorActionPreference = "Continue"
$rootDir = $PSScriptRoot

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")

try {
    $listener.Start()
} catch {
    Write-Host "Could not bind to port $Port." -ForegroundColor Red
    exit 1
}

# Find LAN IPv4 address for mobile/tablet cross-device access
$lanIps = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
    Where-Object { $_.IPAddress -notlike "127.*" -and $_.IPAddress -notlike "169.254.*" } |
    Select-Object -ExpandProperty IPAddress

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  3D 正負數加減法操場賽跑 - 遊戲與跨載具聯動伺服器已啟動！" -ForegroundColor Green
Write-Host "  本機網址: http://localhost:$Port" -ForegroundColor Yellow
foreach ($ip in $lanIps) {
    Write-Host "  區網載具聯動網址: http://${ip}:$Port" -ForegroundColor Green
}
Write-Host "============================================================" -ForegroundColor Cyan

$mimeTypes = @{
    ".html" = "text/html; charset=utf-8"
    ".css"  = "text/css; charset=utf-8"
    ".js"   = "application/javascript; charset=utf-8"
    ".json" = "application/json; charset=utf-8"
    ".glb"  = "model/gltf-binary"
    ".png"  = "image/png"
    ".jpg"  = "image/jpeg"
    ".svg"  = "image/svg+xml"
    ".ico"  = "image/x-icon"
}

# In-memory room message queues for LAN cross-device sync
$roomQueues = @{}

while ($listener.IsListening) {
    $context = $listener.GetContext()
    $req = $context.Request
    $res = $context.Response
    $res.Headers.Add("Access-Control-Allow-Origin", "*")

    $path = $req.Url.AbsolutePath

    if ($path -eq "/api/room") {
        $room = $req.QueryString["room"]
        $client = $req.QueryString["client"]
        if (-not $room) { $room = "0000" }
        if (-not $roomQueues.ContainsKey($room)) {
            $roomQueues[$room] = New-Object System.Collections.ArrayList
        }

        if ($req.HttpMethod -eq "POST") {
            $reader = New-Object System.IO.StreamReader($req.InputStream, [System.Text.Encoding]::UTF8)
            $body = $reader.ReadToEnd()
            $reader.Close()
            try {
                $obj = $body | ConvertFrom-Json
                $obj | Add-Member -NotePropertyName "_ts" -NotePropertyValue ([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()) -Force
                [void]$roomQueues[$room].Add($obj)
                # Keep last 60 messages per room
                while ($roomQueues[$room].Count -gt 60) {
                    $roomQueues[$room].RemoveAt(0)
                }
            } catch {}

            $outBytes = [System.Text.Encoding]::UTF8.GetBytes('{"ok":true}')
            $res.ContentType = "application/json"
            $res.OutputStream.Write($outBytes, 0, $outBytes.Length)
            $res.Close()
            continue
        } else {
            # Return messages from the last 3 seconds
            $nowMs = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
            $recent = @($roomQueues[$room] | Where-Object { ($nowMs - $_._ts) -lt 2500 })
            $payload = @{ messages = $recent } | ConvertTo-Json -Depth 8 -Compress
            $outBytes = [System.Text.Encoding]::UTF8.GetBytes($payload)
            $res.ContentType = "application/json"
            $res.OutputStream.Write($outBytes, 0, $outBytes.Length)
            $res.Close()
            continue
        }
    }

    if ($path -eq "/") { $path = "/index.html" }
    $relPath = $path.TrimStart('/').Replace('/', '\')
    $fullPath = Join-Path $rootDir $relPath

    if (Test-Path $fullPath -PathType Leaf) {
        $ext = [System.IO.Path]::GetExtension($fullPath).ToLower()
        $res.ContentType = if ($mimeTypes.ContainsKey($ext)) { $mimeTypes[$ext] } else { "application/octet-stream" }
        $bytes = [System.IO.File]::ReadAllBytes($fullPath)
        $res.ContentLength64 = $bytes.Length
        $res.OutputStream.Write($bytes, 0, $bytes.Length)
    } else {
        $res.StatusCode = 404
        $msg = [System.Text.Encoding]::UTF8.GetBytes("404 Not Found")
        $res.OutputStream.Write($msg, 0, $msg.Length)
    }
    $res.Close()
}

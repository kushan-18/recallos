# TEMP deploy test — production npm start on :5001 (delete after use)
$backend = "C:\Users\GOLDEN AURA\OneDrive\Documents\health website\recallos\backend"
$env:PORT = "5001"
$env:NODE_ENV = "production"

$proc = Start-Process -FilePath "node" -ArgumentList "src\server.js" `
  -WorkingDirectory $backend -PassThru -NoNewWindow `
  -RedirectStandardOutput "$env:TEMP\prod-out.txt" `
  -RedirectStandardError "$env:TEMP\prod-err.txt"

Start-Sleep -Seconds 5

Write-Host "=== production server on :5001 ==="
try {
  $h = Invoke-RestMethod http://localhost:5001/api/health -TimeoutSec 10
  Write-Host "status: $($h.status) | env: $($h.environment) | db: $($h.database) | retrieval: $($h.retrieval) | aiConfigured: $($h.aiConfigured)"
} catch {
  Write-Host "FAILED: $($_.Exception.Message)"
}

Write-Host "=== CORS: allowed origin (localhost:5173) ==="
try {
  $ok = Invoke-WebRequest -Uri http://localhost:5001/api/health -Method Options `
    -Headers @{ "Origin" = "http://localhost:5173"; "Access-Control-Request-Method" = "GET" } `
    -TimeoutSec 10 -NoKeepAlive
  Write-Host "allow-origin: '$($ok.Headers['Access-Control-Allow-Origin'])'"
} catch {
  Write-Host "status: $($_.Exception.Response.StatusCode.value__)"
}

Write-Host "=== CORS: disallowed origin (fake-site.netlify.app) ==="
try {
  $bad = Invoke-WebRequest -Uri http://localhost:5001/api/health -Method Options `
    -Headers @{ "Origin" = "https://fake-site.netlify.app"; "Access-Control-Request-Method" = "GET" } `
    -TimeoutSec 10 -NoKeepAlive
  Write-Host "allow-origin: '$($bad.Headers['Access-Control-Allow-Origin'])' (expect empty)"
} catch {
  Write-Host "status: $($_.Exception.Response.StatusCode.value__)"
}

Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
Write-Host "=== stdout ==="
Get-Content "$env:TEMP\prod-out.txt" -ErrorAction SilentlyContinue
Write-Host "=== stderr ==="
Get-Content "$env:TEMP\prod-err.txt" -ErrorAction SilentlyContinue
Remove-Item "$env:TEMP\prod-out.txt","$env:TEMP\prod-err.txt" -ErrorAction SilentlyContinue

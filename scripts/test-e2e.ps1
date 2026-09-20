Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
Write-Host "=== Pruebas E2E HU ABC-158 Fase 3 ==="

function Test-Url($url, $desc) {
  try {
    $r = Invoke-WebRequest $url -UseBasicParsing -TimeoutSec 5
    Write-Host "OK  $desc -> $($r.StatusCode) $($r.Content.Substring(0,[Math]::Min(120,$r.Content.Length)))"
    return $true
  } catch {
    Write-Host "FAIL $desc -> $_"
    return $false
  }
}

Write-Host "`n-- Frontend -> Gateway --"
Test-Url "http://localhost:3000/health" "Gateway /health"
Test-Url "http://localhost:5173" "Frontend /"

Write-Host "`n-- Gateway -> Auth --"
Test-Url "http://localhost:3001/health" "Auth directo"
Test-Url "http://localhost:3000/api/auth/health" "Gateway -> Auth"

Write-Host "`n-- Gateway -> Produccion --"
Test-Url "http://localhost:3002/health" "Produccion directo"
Test-Url "http://localhost:3000/api/produccion/health" "Gateway -> Produccion"

Write-Host "`n-- Gateway -> Logistica --"
Test-Url "http://localhost:3003/health" "Logistica directo"
Test-Url "http://localhost:3000/api/logistica/health" "Gateway -> Logistica"

Write-Host "`n-- Produccion -> PostgreSQL (consulta real) --"
Test-Url "http://localhost:3002/health/database" "Produccion -> PG directo"
Test-Url "http://localhost:3000/api/produccion/health/database" "Gateway -> Produccion -> PG"

Write-Host "`n-- Flujo completo Frontend -> Gateway -> Produccion -> PG --"
Write-Host "Abrir http://localhost:5173/estado debe mostrar Gateway: OK, Producción: OK, Base de datos: OK (skipped si sin Docker)"
Test-Url "http://localhost:3000/api/produccion/health/database" "Verificacion final E2E"

Write-Host "`n=== Fin pruebas ==="

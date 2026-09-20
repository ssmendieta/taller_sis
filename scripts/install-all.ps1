Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
$root = Split-Path -Parent $PSScriptRoot
Write-Host "Instalando dependencias..."
npm install --prefix "$root\frontend"
npm install --prefix "$root\api-gateway"
npm install --prefix "$root\services\auth-service"
npm install --prefix "$root\services\produccion-service"
npm install --prefix "$root\services\logistica-service"
Write-Host "Listo."

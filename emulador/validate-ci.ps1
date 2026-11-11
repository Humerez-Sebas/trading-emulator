# validate-ci.ps1
# Runs local validation gates (tsc app, tsc spec, test suite, and lint checks).

$ErrorActionPreference = "Stop"

Write-Host "=== Starting CI Validation checks ===" -ForegroundColor Cyan

Write-Host "`n1. Running TypeScript compiler check for Application code..." -ForegroundColor Yellow
npx tsc -p tsconfig.app.json --noEmit
if ($LASTEXITCODE -ne 0) {
    Write-Error "TypeScript compilation for Application code failed!"
}
Write-Host "-> Application code compilation PASSED." -ForegroundColor Green

Write-Host "`n2. Running TypeScript compiler check for Spec/Test code..." -ForegroundColor Yellow
npx tsc -p tsconfig.spec.json --noEmit
if ($LASTEXITCODE -ne 0) {
    Write-Error "TypeScript compilation for Spec code failed!"
}
Write-Host "-> Spec code compilation PASSED." -ForegroundColor Green

Write-Host "`n3. Running Vitest Test Suite..." -ForegroundColor Yellow
npx ng test --watch=false
if ($LASTEXITCODE -ne 0) {
    Write-Error "Unit tests failed!"
}
Write-Host "-> Test suite PASSED." -ForegroundColor Green

Write-Host "`n4. Running ESLint Code Quality Checks..." -ForegroundColor Yellow
npm run lint
if ($LASTEXITCODE -ne 0) {
    Write-Error "ESLint checks failed!"
}
Write-Host "-> ESLint checks PASSED." -ForegroundColor Green

Write-Host "`n=== CI Validation Checks: ALL PASSED ===" -ForegroundColor Green

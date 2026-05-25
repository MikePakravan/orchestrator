Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$backendDir = Join-Path $repoRoot "backend"
$frontendDir = Join-Path $repoRoot "frontend"
$backendVenv = Join-Path $backendDir ".venv"
$backendPython = Join-Path $backendVenv "Scripts\python.exe"
$results = [ordered]@{}

function Require-Command {
    param([string] $Name)

    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "Required command '$Name' was not found on PATH."
    }
}

function Test-PythonLauncher {
    param(
        [string] $FilePath,
        [string[]] $ArgumentList = @()
    )

    $version = & $FilePath @ArgumentList -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')" 2>$null
    if ($LASTEXITCODE -ne 0) {
        return $false
    }

    $parts = $version.Split(".")
    return ([int] $parts[0] -gt 3) -or ([int] $parts[0] -eq 3 -and [int] $parts[1] -ge 12)
}

function Get-PythonLauncher {
    $configuredPython = [Environment]::GetEnvironmentVariable("PYTHON_EXE")
    if (-not [string]::IsNullOrWhiteSpace($configuredPython)) {
        if (Test-PythonLauncher -FilePath $configuredPython) {
            return [pscustomobject]@{ FilePath = $configuredPython; Arguments = @() }
        }

        throw "PYTHON_EXE must point to Python 3.12 or newer."
    }

    $pyCommand = Get-Command "py" -ErrorAction SilentlyContinue
    if ($pyCommand -and (Test-PythonLauncher -FilePath $pyCommand.Source -ArgumentList @("-3.12"))) {
        return [pscustomobject]@{ FilePath = $pyCommand.Source; Arguments = @("-3.12") }
    }

    $pythonCommand = Get-Command "python" -ErrorAction SilentlyContinue
    if ($pythonCommand -and (Test-PythonLauncher -FilePath $pythonCommand.Source)) {
        return [pscustomobject]@{ FilePath = $pythonCommand.Source; Arguments = @() }
    }

    throw "Python 3.12 or newer is required. Install Python 3.12, or set PYTHON_EXE to a Python 3.12+ executable."
}

function Invoke-Native {
    param(
        [string] $FilePath,
        [string[]] $ArgumentList,
        [string] $WorkingDirectory = (Get-Location).Path
    )

    Push-Location $WorkingDirectory
    try {
        & $FilePath @ArgumentList
        if ($LASTEXITCODE -ne 0) {
            throw "'$FilePath $($ArgumentList -join ' ')' failed with exit code $LASTEXITCODE."
        }
    }
    finally {
        Pop-Location
    }
}

function Invoke-Check {
    param(
        [string] $Name,
        [scriptblock] $Command
    )

    Write-Host ""
    Write-Host "Running $Name..."
    try {
        & $Command
        $results[$Name] = "PASS"
        Write-Host "PASS: $Name"
    }
    catch {
        $results[$Name] = "FAIL"
        Write-Host "FAIL: $Name"
        Write-Host $_.Exception.Message
    }
}

Require-Command "npm"
$pythonLauncher = Get-PythonLauncher
$npmCommand = (Get-Command "npm.cmd" -ErrorAction SilentlyContinue).Source
if (-not $npmCommand) {
    $npmCommand = (Get-Command "npm").Source
}

if (-not (Test-Path $backendPython)) {
    Write-Host "Creating backend virtual environment..."
    Invoke-Native -FilePath $pythonLauncher.FilePath -ArgumentList ($pythonLauncher.Arguments + @("-m", "venv", ".venv")) -WorkingDirectory $backendDir
}

$backendMarker = Join-Path $backendVenv ".requirements-dev-installed"
if (
    -not (Test-Path $backendMarker) -or
    (Get-Item (Join-Path $backendDir "requirements-dev.txt")).LastWriteTimeUtc -gt (Get-Item $backendMarker).LastWriteTimeUtc
) {
    Write-Host "Installing backend dependencies..."
    Invoke-Native -FilePath $backendPython -ArgumentList @("-m", "pip", "install", "-r", (Join-Path $backendDir "requirements-dev.txt"))
    Set-Content -Path $backendMarker -Value (Get-Date).ToString("O") -Encoding UTF8
}

if (-not (Test-Path (Join-Path $frontendDir "node_modules"))) {
    Write-Host "Installing frontend dependencies..."
    if (Test-Path (Join-Path $frontendDir "package-lock.json")) {
        Invoke-Native -FilePath $npmCommand -ArgumentList @("ci") -WorkingDirectory $frontendDir
    }
    else {
        Invoke-Native -FilePath $npmCommand -ArgumentList @("install") -WorkingDirectory $frontendDir
    }
}

$env:APP_ENV = "test"
$env:USE_MOCK_AGENTS = "true"

Invoke-Check "Backend lint" {
    Invoke-Native -FilePath $backendPython -ArgumentList @("-m", "ruff", "check", ".") -WorkingDirectory $backendDir
}

Invoke-Check "Backend tests" {
    Invoke-Native -FilePath $backendPython -ArgumentList @("-m", "pytest", "--basetemp", ".pytest_tmp", "-o", "cache_dir=.pytest_cache") -WorkingDirectory $backendDir
}

Invoke-Check "Frontend lint" {
    Invoke-Native -FilePath $npmCommand -ArgumentList @("run", "lint") -WorkingDirectory $frontendDir
}

Invoke-Check "Frontend tests" {
    Invoke-Native -FilePath $npmCommand -ArgumentList @("test") -WorkingDirectory $frontendDir
}

Invoke-Check "Frontend build" {
    Invoke-Native -FilePath $npmCommand -ArgumentList @("run", "build") -WorkingDirectory $frontendDir
}

Write-Host ""
Write-Host "Summary"
Write-Host "-------"
$hasFailure = $false
foreach ($item in $results.GetEnumerator()) {
    Write-Host ("{0}: {1}" -f $item.Key, $item.Value)
    if ($item.Value -eq "FAIL") {
        $hasFailure = $true
    }
}

if ($hasFailure) {
    Write-Host ""
    Write-Host "FAIL: One or more checks failed."
    exit 1
}

Write-Host ""
Write-Host "PASS: All checks passed."

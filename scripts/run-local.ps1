Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$backendDir = Join-Path $repoRoot "backend"
$frontendDir = Join-Path $repoRoot "frontend"
$backendVenv = Join-Path $backendDir ".venv"
$backendPython = Join-Path $backendVenv "Scripts\python.exe"

function Get-AvailablePort {
    param([int] $PreferredPort)

    for ($port = $PreferredPort; $port -lt ($PreferredPort + 20); $port++) {
        $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Parse("127.0.0.1"), $port)
        try {
            $listener.Start()
            return $port
        }
        catch {
            continue
        }
        finally {
            $listener.Stop()
        }
    }

    throw "Could not find an available local port starting at $PreferredPort."
}

$backendPort = 8000
$frontendPort = Get-AvailablePort -PreferredPort 5173
$backendUrl = "http://127.0.0.1:$backendPort"
$frontendUrl = "http://127.0.0.1:$frontendPort"

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

function Start-ManagedProcess {
    param(
        [string] $FilePath,
        [string[]] $ArgumentList,
        [string] $WorkingDirectory
    )

    return Start-Process -FilePath $FilePath -ArgumentList $ArgumentList -WorkingDirectory $WorkingDirectory -PassThru -WindowStyle Hidden
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

Write-Host "Starting local services with mocked providers..."
$env:APP_ENV = "dev"
$env:USE_MOCK_AGENTS = "true"
$env:TASK_HISTORY_PATH = ".\data\tasks.json"
$backendProcess = Start-ManagedProcess -FilePath $backendPython -ArgumentList @("-m", "uvicorn", "app.main:app", "--reload", "--host", "127.0.0.1", "--port", "$backendPort") -WorkingDirectory $backendDir
$frontendProcess = Start-ManagedProcess -FilePath $npmCommand -ArgumentList @("run", "dev", "--", "--host", "127.0.0.1", "--port", "$frontendPort", "--strictPort") -WorkingDirectory $frontendDir

Write-Host ""
Write-Host "Backend:  $backendUrl"
Write-Host "Frontend: $frontendUrl"
Write-Host "Mocked providers are enabled. Real API keys are not required."
Write-Host "Press Ctrl+C to stop both services."

try {
    while (-not $backendProcess.HasExited -and -not $frontendProcess.HasExited) {
        Start-Sleep -Seconds 1
    }

    if ($backendProcess.HasExited) {
        throw "Backend exited with code $($backendProcess.ExitCode)."
    }

    if ($frontendProcess.HasExited) {
        throw "Frontend exited with code $($frontendProcess.ExitCode)."
    }
}
finally {
    foreach ($process in @($backendProcess, $frontendProcess)) {
        if ($process -and -not $process.HasExited) {
            Stop-Process -Id $process.Id -Force
        }
    }
}

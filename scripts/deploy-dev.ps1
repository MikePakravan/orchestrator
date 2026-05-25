Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$infraDir = Join-Path $repoRoot "infra"
$backendDir = Join-Path $repoRoot "backend"
$frontendDir = Join-Path $repoRoot "frontend"
$templateFile = Join-Path $infraDir "main.bicep"
$deployRoot = Join-Path $repoRoot ".deploy"
$packageRoot = Join-Path $deployRoot "package"
$zipPath = Join-Path $deployRoot "ai-orchestrator-dev.zip"

function Require-Command {
    param([string] $Name)

    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "Required command '$Name' was not found on PATH."
    }
}

function Require-EnvironmentValue {
    param([string] $Name)

    $value = [Environment]::GetEnvironmentVariable($Name)
    if ([string]::IsNullOrWhiteSpace($value)) {
        throw "Required environment variable '$Name' is not set."
    }

    return $value.Trim()
}

function Get-EnvironmentValue {
    param(
        [string] $Name,
        [string] $DefaultValue
    )

    $value = [Environment]::GetEnvironmentVariable($Name)
    if ([string]::IsNullOrWhiteSpace($value)) {
        return $DefaultValue
    }

    return $value.Trim()
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

function Clear-LocalPath {
    param([string] $Path)

    $resolvedRoot = $null
    if (Test-Path $deployRoot) {
        $resolvedRoot = Resolve-Path $deployRoot
    }

    if (Test-Path $Path) {
        $resolvedPath = Resolve-Path $Path
        if ($resolvedRoot -and -not $resolvedPath.Path.StartsWith($resolvedRoot.Path, [System.StringComparison]::OrdinalIgnoreCase)) {
            throw "Refusing to clean path outside .deploy: $Path"
        }

        Remove-Item -LiteralPath $resolvedPath.Path -Recurse -Force
    }
}

Require-Command "az"
Require-Command "npm"

$tenantId = Require-EnvironmentValue "AZURE_TENANT_ID"
$subscriptionId = Require-EnvironmentValue "AZURE_SUBSCRIPTION_ID"
$region = Get-EnvironmentValue "AZURE_REGION" "australiaeast"
$resourceGroup = Get-EnvironmentValue "AZURE_RESOURCE_GROUP" "rg-ai-orchestrator-dev"

if ($region -ne "australiaeast") {
    throw "This dev MVP only supports AZURE_REGION=australiaeast."
}

$resourcePrefix = ($resourceGroup.ToLowerInvariant() -replace "^rg-", "" -replace "[^a-z0-9-]", "-").Trim("-")
if ([string]::IsNullOrWhiteSpace($resourcePrefix)) {
    $resourcePrefix = "ai-orchestrator-dev"
}
if ($resourcePrefix.Length -gt 32) {
    $resourcePrefix = $resourcePrefix.Substring(0, 32).Trim("-")
}

Write-Host "This script deploys the dev MVP only."
Write-Host "It will create or update Azure resources and zip-deploy the app package."
Write-Host "It does not support production deployment and does not delete Azure resources."
Write-Host ""
Write-Host "Region:         $region"
Write-Host "Resource group: $resourceGroup"
Write-Host "Resource prefix: $resourcePrefix"
Write-Host "Provider mode:  mock"
Write-Host ""

$confirmation = Read-Host "Type DEPLOY DEV to continue"
if ($confirmation -ne "DEPLOY DEV") {
    Write-Host "Deployment cancelled."
    exit 0
}

Write-Host "Building frontend for same-origin App Service hosting..."
$previousApiBaseUrl = $env:VITE_API_BASE_URL
try {
    $env:VITE_API_BASE_URL = ""
    if (-not (Test-Path (Join-Path $frontendDir "node_modules"))) {
        Invoke-Native -FilePath "npm.cmd" -ArgumentList @("ci") -WorkingDirectory $frontendDir
    }
    Invoke-Native -FilePath "npm.cmd" -ArgumentList @("run", "build") -WorkingDirectory $frontendDir
}
finally {
    $env:VITE_API_BASE_URL = $previousApiBaseUrl
}

Write-Host "Creating deployment package..."
if (-not (Test-Path $deployRoot)) {
    New-Item -ItemType Directory -Path $deployRoot | Out-Null
}
Clear-LocalPath $packageRoot
if (Test-Path $zipPath) {
    Remove-Item -LiteralPath $zipPath -Force
}
New-Item -ItemType Directory -Path $packageRoot | Out-Null
Copy-Item -Path (Join-Path $backendDir "app") -Destination (Join-Path $packageRoot "app") -Recurse
Copy-Item -Path (Join-Path $backendDir "requirements.txt") -Destination (Join-Path $packageRoot "requirements.txt")
Copy-Item -Path (Join-Path $frontendDir "dist") -Destination (Join-Path $packageRoot "static") -Recurse
Compress-Archive -Path (Get-ChildItem $packageRoot).FullName -DestinationPath $zipPath -Force

Write-Host "Checking Azure login..."
$accountJson = az account show --output json 2>$null
if (-not $accountJson) {
    az login --tenant $tenantId
}

az account set --subscription $subscriptionId

Write-Host "Creating or updating dev resource group..."
az group create `
    --name $resourceGroup `
    --location $region `
    --output table

Write-Host "Deploying dev Bicep template..."
$deploymentJson = az deployment group create `
    --resource-group $resourceGroup `
    --template-file $templateFile `
    --parameters environmentName=dev location=$region resourcePrefix=$resourcePrefix `
    --output json
$deployment = $deploymentJson | ConvertFrom-Json
$appServiceName = $deployment.properties.outputs.appServiceName.value
$appServiceUrl = $deployment.properties.outputs.appServiceUrl.value

Write-Host "Deploying app package to App Service..."
az webapp deploy `
    --resource-group $resourceGroup `
    --name $appServiceName `
    --src-path $zipPath `
    --type zip `
    --restart true `
    --output table

Write-Host ""
Write-Host "App Service URL: $appServiceUrl"
Write-Host "Checking health endpoint..."
try {
    Start-Sleep -Seconds 10
    $health = Invoke-RestMethod -Uri "$appServiceUrl/api/health" -Method Get -TimeoutSec 30
    Write-Host "Health: $($health.status) ($($health.environment))"
}
catch {
    Write-Host "Health check did not complete yet: $($_.Exception.Message)"
    Write-Host "Retry manually: $appServiceUrl/api/health"
}

Write-Host ""
Write-Host "Next manual check: open $appServiceUrl and submit a mocked workflow request."
Write-Host "PASS: Dev Azure deployment completed."

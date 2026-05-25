Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$infraDir = Join-Path $repoRoot "infra"
$templateFile = Join-Path $infraDir "main.bicep"

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

Require-Command "az"

$tenantId = Require-EnvironmentValue "AZURE_TENANT_ID"
$subscriptionId = Require-EnvironmentValue "AZURE_SUBSCRIPTION_ID"
$region = Require-EnvironmentValue "AZURE_REGION"
$resourceGroup = Require-EnvironmentValue "AZURE_RESOURCE_GROUP"

if ($region -ne "australiaeast") {
    throw "This dev MVP only supports AZURE_REGION=australiaeast."
}

$resourcePrefix = ($resourceGroup.ToLowerInvariant() -replace "[^a-z0-9-]", "-").Trim("-")
if ([string]::IsNullOrWhiteSpace($resourcePrefix)) {
    throw "Could not derive a safe resource prefix from AZURE_RESOURCE_GROUP."
}
if ($resourcePrefix.Length -gt 32) {
    $resourcePrefix = $resourcePrefix.Substring(0, 32).Trim("-")
}

Write-Host "This script deploys dev infrastructure only."
Write-Host "It will create or update Azure resources from infra/main.bicep."
Write-Host "It does not deploy production resources and does not delete resources."
Write-Host ""
Write-Host "Region:         $region"
Write-Host "Resource group: $resourceGroup"
Write-Host "Resource prefix: $resourcePrefix"
Write-Host ""

$confirmation = Read-Host "Type DEPLOY DEV to continue"
if ($confirmation -ne "DEPLOY DEV") {
    Write-Host "Deployment cancelled."
    exit 0
}

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
az deployment group create `
    --resource-group $resourceGroup `
    --template-file $templateFile `
    --parameters environmentName=dev location=$region resourcePrefix=$resourcePrefix `
    --output table

Write-Host ""
Write-Host "PASS: Dev Azure deployment completed."

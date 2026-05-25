@description('Deployment environment. Dev only for this MVP.')
@allowed([
  'dev'
])
param environmentName string = 'dev'

@description('Azure region for all resources.')
@allowed([
  'australiaeast'
])
param location string = 'australiaeast'

@description('Lowercase resource prefix, for example orchestrator-dev. Do not include subscription or tenant identifiers.')
param resourcePrefix string

@description('Startup command for the Python App Service container.')
param startupCommand string = 'python -m uvicorn app.main:app --host 0.0.0.0 --port 8000'

var normalizedPrefix = toLower(resourcePrefix)
var tags = {
  app: 'multi-agent-orchestrator'
  environment: environmentName
  managedBy: 'bicep'
}

resource logAnalytics 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: '${normalizedPrefix}-law'
  location: location
  tags: tags
  properties: {
    sku: {
      name: 'PerGB2018'
    }
    retentionInDays: 30
  }
}

resource appInsights 'Microsoft.Insights/components@2020-02-02' = {
  name: '${normalizedPrefix}-appi'
  location: location
  kind: 'web'
  tags: tags
  properties: {
    Application_Type: 'web'
    WorkspaceResourceId: logAnalytics.id
  }
}

resource storage 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: take(replace('${normalizedPrefix}tasks', '-', ''), 24)
  location: location
  tags: tags
  sku: {
    name: 'Standard_LRS'
  }
  kind: 'StorageV2'
  properties: {
    allowBlobPublicAccess: false
    minimumTlsVersion: 'TLS1_2'
    supportsHttpsTrafficOnly: true
  }
}

resource keyVault 'Microsoft.KeyVault/vaults@2023-07-01' = {
  name: '${normalizedPrefix}-kv'
  location: location
  tags: tags
  properties: {
    sku: {
      family: 'A'
      name: 'standard'
    }
    tenantId: tenant().tenantId
    enableRbacAuthorization: true
    enableSoftDelete: true
    softDeleteRetentionInDays: 7
  }
}

resource plan 'Microsoft.Web/serverfarms@2023-12-01' = {
  name: '${normalizedPrefix}-asp'
  location: location
  tags: tags
  sku: {
    name: 'B1'
    tier: 'Basic'
  }
  kind: 'linux'
  properties: {
    reserved: true
  }
}

resource appService 'Microsoft.Web/sites@2023-12-01' = {
  name: '${normalizedPrefix}-app'
  location: location
  tags: tags
  kind: 'app,linux'
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    serverFarmId: plan.id
    httpsOnly: true
    siteConfig: {
      linuxFxVersion: 'PYTHON|3.12'
      alwaysOn: false
      appCommandLine: startupCommand
      appSettings: [
        {
          name: 'ENVIRONMENT'
          value: environmentName
        }
        {
          name: 'APP_ENV'
          value: environmentName
        }
        {
          name: 'PROVIDER_MODE'
          value: 'mock'
        }
        {
          name: 'USE_MOCK_AGENTS'
          value: 'true'
        }
        {
          name: 'ALLOWED_ORIGINS'
          value: 'https://${normalizedPrefix}-app.azurewebsites.net'
        }
        {
          name: 'TASK_HISTORY_PATH'
          value: './data/tasks.json'
        }
        {
          name: 'SCM_DO_BUILD_DURING_DEPLOYMENT'
          value: 'true'
        }
        {
          name: 'APPLICATIONINSIGHTS_CONNECTION_STRING'
          value: appInsights.properties.ConnectionString
        }
        {
          name: 'AZURE_STORAGE_ACCOUNT_NAME'
          value: storage.name
        }
        {
          name: 'KEY_VAULT_NAME'
          value: keyVault.name
        }
      ]
    }
  }
}

output appServiceName string = appService.name
output appServiceUrl string = 'https://${appService.properties.defaultHostName}'
output keyVaultName string = keyVault.name
output storageAccountName string = storage.name

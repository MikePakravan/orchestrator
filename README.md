# Multi-Agent Orchestrator

Dev MVP for a multi-agent orchestration app that can run locally with mocked providers and deploy to Azure App Service.

## What It Does

The app runs a fixed orchestration workflow:

1. The React UI submits a user request.
2. FastAPI sends it to the Gemini Boss Agent for goals, requirements, and acceptance criteria.
3. FastAPI sends Gemini's output to the OpenAI Architect/Builder Agent for an initial solution.
4. FastAPI sends Gemini and OpenAI outputs to the Claude Reviewer Agent.
5. FastAPI sends Claude feedback to Gemini for approve/reject decisions.
6. FastAPI sends only Gemini-approved or Gemini-modified fixes back to OpenAI.
7. The UI displays task status, every agent step, and the final output.

Mocked providers are enabled by default with `USE_MOCK_AGENTS=true`, so local development and unit tests do not need real API keys.

## Repository Layout

- `backend/`: FastAPI API, provider connectors, orchestration logic, JSON task history, and backend tests.
- `frontend/`: React/Vite UI for submitting tasks and viewing workflow traces.
- `infra/`: Dev-only Azure Bicep infrastructure.
- `scripts/`: Root-level PowerShell commands for local run, checks, and dev deployment.
- `.github/workflows/ci.yml`: CI for backend lint/tests and frontend lint/build.
- `.env.example`: Placeholder local settings only.

## Run Locally

Run from the repository root:

```powershell
.\scripts\run-local.ps1
```

The script installs missing backend and frontend dependencies, starts both services, enables mocked providers, and prints the URLs. It uses Python 3.12 or newer; if your default `python` is older, set `PYTHON_EXE` to a Python 3.12+ executable before running the script.

- Backend: `http://127.0.0.1:8000`
- Frontend: `http://127.0.0.1:5173` or the next available local port

The frontend reads `VITE_API_BASE_URL` when set. If it is not set, it safely falls back to same-origin `/api` requests for the local Vite proxy.

## Provider Configuration

Local mocks are the default:

```env
USE_MOCK_AGENTS=true
```

To enable real providers later, set `USE_MOCK_AGENTS=false` and provide real values through local environment variables, a local uncommitted `.env`, Azure App Service settings, or Key Vault-backed configuration:

```env
GEMINI_API_KEY=<real local value>
OPENAI_API_KEY=<real local value>
ANTHROPIC_API_KEY=<real local value>
```

Placeholder values such as `placeholder-openai-api-key` are treated as not configured. Unit tests must continue to run without real provider credentials.

## Test And Build

Run all checks from the repository root:

```powershell
.\scripts\test-all.ps1
```

The script runs backend lint, backend tests, frontend lint, frontend tests, frontend build, and prints a PASS/FAIL summary.

## Deploy to Azure Dev

The dev deployment uses one public Azure App Service for the MVP. FastAPI serves `/api/*` and also serves the built React app from the same App Service host. This keeps the dev deployment simple and avoids separate frontend hosting or cross-origin browser calls.

The IaC in `infra/main.bicep` is restricted to dev deployment in `australiaeast` and creates:

- Linux App Service Plan
- Azure App Service
- Key Vault
- Storage Account
- Application Insights
- Log Analytics workspace

Set the required Azure tenant and subscription values, then deploy from the repository root. `AZURE_REGION` defaults to `australiaeast` and `AZURE_RESOURCE_GROUP` defaults to `rg-ai-orchestrator-dev` when omitted.

```powershell
$env:AZURE_TENANT_ID="<tenant-id>"
$env:AZURE_SUBSCRIPTION_ID="<subscription-id>"
.\scripts\deploy-dev.ps1
```

The deploy script asks for `DEPLOY DEV` confirmation before applying changes. It builds the frontend, packages it with the backend, deploys dev resources, zip-deploys the app, prints the App Service URL, and attempts `/api/health`. It sets mock provider mode (`PROVIDER_MODE=mock`, `USE_MOCK_AGENTS=true`) and does not require real API keys.

After deployment, open the printed App Service URL and submit a mocked workflow request.

The repository does not include production deployment or Azure resource deletion capability.

## Security Notes

- Do not commit `.env` files.
- Do not commit API keys, tenant IDs, subscription IDs, Confluence tokens, client secrets, or generated secret values.
- Keep provider keys in local environment variables, Azure App Service settings, or Key Vault.
- Do not log provider request headers, API keys, tokens, or secret-bearing payload fields.
- `.env.example` must contain placeholders only.

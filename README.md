# Multi-Agent Orchestrator

Dev MVP for a multi-agent orchestration app that can run locally with mocked providers and later be deployed to Azure App Service.

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
- `.github/workflows/ci.yml`: CI for backend lint/tests and frontend lint/build.
- `.env.example`: Placeholder local settings only.

## Run The Backend Locally

Run from `backend/`:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements-dev.txt
Copy-Item ..\.env.example .env
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Check the API:

```powershell
curl http://127.0.0.1:8000/api/health
curl -Method POST http://127.0.0.1:8000/api/tasks/start -ContentType "application/json" -Body '{"request":"Build a dev MVP"}'
curl http://127.0.0.1:8000/api/tasks/<task-id>
```

Task history is stored at `TASK_HISTORY_PATH`, which defaults to `./data/tasks.json` under `backend/` when running locally.

## Run The Frontend Locally

Run from `frontend/`:

```powershell
npm install
npm run dev
```

Open `http://localhost:5173`. Vite proxies `/api` calls to `http://127.0.0.1:8000`.

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

Run backend checks from `backend/`:

```powershell
ruff check .
pytest
```

Run frontend checks from `frontend/`:

```powershell
npm run lint
npm run build
```

## Azure Dev Infrastructure

The first IaC version is in `infra/main.bicep`. It is restricted to dev deployment in `australiaeast` and creates:

- Linux App Service Plan
- Azure App Service
- Key Vault
- Storage Account
- Application Insights
- Log Analytics workspace

Create or update dev infrastructure from `infra/`:

```powershell
az group create --name <dev-resource-group-name> --location australiaeast
az deployment group create --resource-group <dev-resource-group-name> --template-file main.bicep --parameters environmentName=dev resourcePrefix=<dev-prefix>
```

This repository does not include production deployment, tenant-specific parameters, subscription-specific parameters, delete-resource scripts, or delete-resource workflows.

## Security Notes

- Do not commit `.env` files.
- Do not commit API keys, tenant IDs, subscription IDs, Confluence tokens, client secrets, or generated secret values.
- Keep provider keys in local environment variables, Azure App Service settings, or Key Vault.
- Do not log provider request headers, API keys, tokens, or secret-bearing payload fields.
- `.env.example` must contain placeholders only.

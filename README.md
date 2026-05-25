# Multi-Agent Orchestrator

First dev MVP for a multi-agent orchestration app hosted on Azure App Service.

## What It Does

The app runs a structured workflow:

1. User submits a request in the React UI.
2. FastAPI sends it to the Gemini Boss Agent for goals, requirements, and acceptance criteria.
3. FastAPI sends Gemini's output to the OpenAI Architect/Builder Agent.
4. FastAPI sends Gemini and OpenAI outputs to the Claude Reviewer Agent.
5. FastAPI sends Claude feedback to Gemini for approval decisions.
6. FastAPI sends only Gemini-approved fixes back to OpenAI.
7. The UI displays every workflow step and the final output.

Provider connectors use real provider HTTP APIs only when local or hosted environment variables are configured. In dev, `USE_MOCK_AGENTS=true` returns deterministic responses without secrets.

## Repository Layout

- `backend/`: Python FastAPI API and agent orchestration.
- `frontend/`: React/Vite UI.
- `infra/`: Azure Bicep infrastructure for dev.
- `.github/workflows/ci.yml`: build/test workflow only.

## Run The Backend

Run these commands from `backend/`:

```bash
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements-dev.txt
copy ..\.env.example .env
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Health check:

```bash
curl http://127.0.0.1:8000/api/health
```

## Run The Frontend

Run these commands from `frontend/`:

```bash
npm install
npm run dev
```

Open `http://localhost:5173`.

## Test And Build

Run backend checks from `backend/`:

```bash
pytest
```

Run frontend checks from `frontend/`:

```bash
npm run lint
npm run build
```

## Azure Dev Infrastructure

The first IaC version is in `infra/main.bicep`. It creates dev-only resources in `australiaeast`:

- Linux App Service Plan
- Azure App Service
- Key Vault
- Storage Account
- Application Insights
- Log Analytics workspace

Create a resource group and deploy from `infra/`:

```bash
az group create --name <dev-resource-group-name> --location australiaeast
az deployment group create --resource-group <dev-resource-group-name> --template-file main.bicep --parameters environmentName=dev resourcePrefix=<dev-prefix>
```

Do not use this MVP for production deployment. No workflow in this repository deploys or deletes Azure resources.

## Security Notes

- Do not commit `.env` files.
- Do not commit API keys, tenant IDs, subscription IDs, or generated secret values.
- Keep provider keys in local environment variables, Azure App Service settings, or Key Vault.
- Logs intentionally avoid request headers and provider credentials.


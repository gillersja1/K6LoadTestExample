# Azure Load Testing Example

A load testing example using [Azure App Testing](https://azure.microsoft.com/en-us/products/app-testing)'s
**Azure Load Testing** service — a fully managed, cloud-scale load testing
service that runs existing Apache JMeter (or Locust) scripts under the
hood, with no infrastructure to provision or manage.

This reuses the same JMeter test plan as the local
[JMeterLoadTestExample](../JMeterLoadTestExample) project in this
portfolio, targeting the public [reqres.in](https://reqres.in/) test API,
but runs it from Azure's managed load-generation engines instead of a
local machine — and drives it from a GitHub Actions pipeline.

## Why this repo exists

`JMeterLoadTestExample` shows JMeter run locally/in a self-hosted CI
runner. This project shows the same test plan running through a managed
cloud service instead — useful context for comparing "run JMeter yourself"
vs. "let Azure run JMeter for you at scale" (up to 400 engine instances /
~100,000 virtual users, per Microsoft's published limits).

## Project structure

```
AzureLoadTestingExample/
├── test-plans/
│   └── reqres-api-load-test.jmx   # Same JMeter script as JMeterLoadTestExample,
│                                   # with local listeners removed (Azure Load
│                                   # Testing provides its own metrics dashboard)
├── loadtest-config.yaml            # Azure Load Testing test configuration
└── .github/workflows/azure-load-test.yml
```

## One-time Azure setup

You'll need an Azure subscription. Using the Azure CLI:

```bash
# 1. Install the load testing CLI extension
az extension add --name load

# 2. Create a resource group (skip if you already have one)
az group create --name loadtest-portfolio-rg --location eastus

# 3. Create the Azure Load Testing resource
az load create \
  --name loadtest-portfolio \
  --resource-group loadtest-portfolio-rg \
  --location eastus

# 4. Create a service principal scoped to just this resource, with the
#    "Load Test Contributor" role, for GitHub Actions to authenticate with
loadtest_id=$(az resource show \
  --resource-group loadtest-portfolio-rg \
  --name loadtest-portfolio \
  --resource-type "Microsoft.LoadTestService/loadtests" \
  --query id -o tsv)

az ad sp create-for-rbac \
  --name "github-actions-loadtest" \
  --role "Load Test Contributor" \
  --scopes "$loadtest_id" \
  --sdk-auth
```

The last command prints a JSON object — save the whole thing.

## GitHub setup

1. **Repository secret** — Settings → Secrets and variables → Actions → Secrets:
   - `AZURE_CREDENTIALS`: the full JSON output from `az ad sp create-for-rbac` above

2. **Repository variables** — Settings → Secrets and variables → Actions → Variables:
   - `AZURE_LOAD_TEST_RESOURCE`: `loadtest-portfolio` (or whatever you named it)
   - `AZURE_LOAD_TEST_RESOURCE_GROUP`: `loadtest-portfolio-rg`

3. Push to `main`, or trigger manually from **Actions → Azure Load Testing → Run workflow**.

## What's in `loadtest-config.yaml`

- **`testPlan` / `testType: JMX`** — points at the JMeter script; Azure Load Testing runs it directly, no conversion needed
- **`engineInstances`** — how many parallel JMeter engines Azure spins up; each runs the full thread group from the script, so this is your horizontal scaling knob
- **`failureCriteria`** — the test run is marked failed if average response time exceeds 1000ms, error rate exceeds 10%, or p95 response time exceeds 2000ms
- **`autoStop`** — automatically stops the run early if the error rate exceeds 90% within any 60-second window, to avoid burning engine-hours on a broken run

## Running it yourself (without CI)

You can also trigger a run directly from the Azure CLI:

```bash
az load test create \
  --load-test-resource loadtest-portfolio \
  --resource-group loadtest-portfolio-rg \
  --test-id reqres-api-load-test \
  --load-test-config-file loadtest-config.yaml

az load test-run create \
  --load-test-resource loadtest-portfolio \
  --resource-group loadtest-portfolio-rg \
  --test-id reqres-api-load-test \
  --test-run-id reqres-run-$(date +%s)
```

Or use the [Azure Load Testing extension for VS Code](https://go.microsoft.com/fwlink/?linkid=2317015)
to author and run tests directly from your editor.

Results — including per-request percentiles, error rates, and (for
Azure-hosted targets) server-side resource metrics — show up in the
Azure Load Testing dashboard in the portal.

## Possible extensions

- Add `appComponents` to `loadtest-config.yaml` to monitor server-side metrics if you point this at an Azure-hosted app instead of the public reqres.in API
- Add `regionalLoadTestConfig` to generate load from multiple Azure regions simultaneously, simulating realistic geographic traffic
- Parameterize threads/ramp-up/loops via a `user.properties` file referenced in `properties.userPropertyFile`, instead of relying on the JMX's built-in defaults
- Add a private endpoint test using `subnetId` if testing an internal, non-public application

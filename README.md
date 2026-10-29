# k6 Load Test Example

[![k6 Load Test](https://github.com/gillersja1/K6LoadTestExample/actions/workflows/k6-load-test.yml/badge.svg)](https://github.com/gillersja1/K6LoadTestExample/actions/workflows/k6-load-test.yml)

A load test written as code with [Grafana k6](https://k6.io/), run in GitHub
Actions with pass/fail thresholds. It's a companion to
[JMeterLoadTestExample](https://github.com/gillersja1/JMeterLoadTestExample):
same target API, different tool. JMeter builds the test plan in a GUI as XML;
k6 writes it in JavaScript.

## What's being tested

`tests/users-load-test.js` simulates users browsing a reqres.in-style users
API. Each virtual user loops through:

1. `GET /api/users?page=2`: checks status 200, page 2, 6 users
2. `GET /api/users/:id` for a random user: checks status 200, the right user, an email present
3. `GET /api/users/999`: checks for a **404**, which is marked as an expected status so it
   doesn't count as a failed request

Load ramps up to 20 virtual users over 10 s, holds for 30 s, then ramps down,
with 300 ms of think time between requests.

## Pass/fail thresholds

The thresholds are defined in the script, so the test itself decides whether
the run passed. k6 exits with a non-zero code when any threshold fails, and
that fails the CI job.

| Metric | Threshold |
|---|---|
| Failed requests | < 1% (and the run **aborts early** above 10%) |
| Response time | avg < 200 ms, p95 < 500 ms, p99 < 1000 ms |
| Response time per endpoint (list, single) | p95 < 500 ms |
| Checks passing | > 99% |

## The target API

`mock-api/server.js` is a small, dependency-free Node server that returns
the same responses as [reqres.in](https://reqres.in/) for these endpoints.
reqres.in's free tier allows only 20 requests per minute, so a real load test
needs its own target. The mock runs inside the CI job. Point the test
anywhere else with `BASE_URL`.

## Running locally

Requires [k6](https://grafana.com/docs/k6/latest/set-up/install-k6/) and Node.js.

```bash
node mock-api/server.js &                   # target API on :8080
k6 run tests/users-load-test.js             # 20 VUs, 30 s hold
k6 run -e VUS=50 -e HOLD=2m tests/users-load-test.js
k6 run -e BASE_URL=https://staging.example.com tests/users-load-test.js
```

| Variable | Default | Meaning |
|---|---|---|
| `BASE_URL` | `http://localhost:8080` | API under test |
| `VUS` | `20` | Peak virtual users |
| `RAMP_UP` | `10s` | Time to reach peak |
| `HOLD` | `30s` | Time at peak |
| `THINK_TIME` | `0.3` | Seconds between requests |

## CI/CD

`.github/workflows/k6-load-test.yml` runs on pushes to `main`, on pull
requests that touch the test, the mock API or the workflow, and on demand
(**Actions → k6 Load Test → Run workflow**, with `vus` and `hold` inputs).

Each run produces:

- **Job summary:** request count, error rate, latency, and a pass/fail table for every threshold
- **`k6-reports` artifact:** an HTML dashboard report (`k6-report.html`) and the raw summary (`k6-summary.json`)

## Project structure

```
├── tests/
│   └── users-load-test.js          # k6 test: scenario, checks, thresholds, summary
├── mock-api/
│   └── server.js                   # Local reqres-compatible target API
└── .github/workflows/k6-load-test.yml
```

// Load test for a reqres.in-style users API, written as code with k6.
//
// Each virtual user loops through three requests:
//   1. GET /api/users?page=2   list users
//   2. GET /api/users/:id      a random existing user
//   3. GET /api/users/999      an unknown user, which must return 404
//
// Run against the local mock API (node mock-api/server.js):
//   k6 run tests/users-load-test.js
// Tune the load with environment variables:
//   k6 run -e VUS=50 -e HOLD=1m tests/users-load-test.js

import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { textSummary } from 'https://jslib.k6.io/k6-summary/0.0.2/index.js';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8080';
const VUS = Number(__ENV.VUS || 20);
const THINK_TIME_S = Number(__ENV.THINK_TIME || 0.3);
const USER_COUNT = 12;

export const options = {
  scenarios: {
    browse_users: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: __ENV.RAMP_UP || '10s', target: VUS },
        { duration: __ENV.HOLD || '30s', target: VUS },
        { duration: '5s', target: 0 },
      ],
      gracefulRampDown: '5s',
    },
  },
  // Pass/fail criteria. k6 exits non-zero when any threshold fails, which fails the CI job.
  thresholds: {
    http_req_failed: [
      'rate<0.01',
      // Stop early instead of hammering a target that's clearly down.
      { threshold: 'rate<0.10', abortOnFail: true, delayAbortEval: '10s' },
    ],
    http_req_duration: ['avg<200', 'p(95)<500', 'p(99)<1000'],
    'http_req_duration{endpoint:list}': ['p(95)<500'],
    'http_req_duration{endpoint:single}': ['p(95)<500'],
    checks: ['rate>0.99'],
  },
};

export default function () {
  group('list users', () => {
    const res = http.get(`${BASE_URL}/api/users?page=2`, { tags: { endpoint: 'list' } });
    check(res, {
      'list: status is 200': (r) => r.status === 200,
      'list: returns page 2': (r) => r.json('page') === 2,
      'list: returns 6 users': (r) => r.json('data').length === 6,
    });
  });

  sleep(THINK_TIME_S);

  group('single user', () => {
    const id = Math.floor(Math.random() * USER_COUNT) + 1;
    const res = http.get(`${BASE_URL}/api/users/${id}`, { tags: { endpoint: 'single' } });
    check(res, {
      'single: status is 200': (r) => r.status === 200,
      'single: returns the requested user': (r) => r.json('data.id') === id,
      'single: has an email': (r) => /@/.test(r.json('data.email')),
    });
  });

  sleep(THINK_TIME_S);

  group('unknown user', () => {
    // A 404 is the correct answer here, so don't count it as a failed request.
    const res = http.get(`${BASE_URL}/api/users/999`, {
      tags: { endpoint: 'not_found' },
      responseCallback: http.expectedStatuses(404),
    });
    check(res, { 'unknown: status is 404': (r) => r.status === 404 });
  });

  sleep(THINK_TIME_S);
}

// Prints the usual console summary and also writes a JSON copy and a
// Markdown table that CI appends to the job summary.
export function handleSummary(data) {
  return {
    stdout: textSummary(data, { indent: ' ', enableColors: true }),
    'k6-summary.json': JSON.stringify(data, null, 2),
    'k6-summary.md': markdownSummary(data),
  };
}

function markdownSummary(data) {
  const rows = [];
  for (const [metric, details] of Object.entries(data.metrics)) {
    for (const [threshold, result] of Object.entries(details.thresholds || {})) {
      rows.push(`| \`${metric}\` | \`${threshold}\` | ${result.ok ? '✅ pass' : '❌ fail'} |`);
    }
  }
  const duration = data.metrics.http_req_duration.values;
  const fmt = (ms) => `${ms.toFixed(1)} ms`;
  return [
    '## k6 load test',
    '',
    `Requests: **${data.metrics.http_reqs.values.count}** · ` +
      `failed: **${(data.metrics.http_req_failed.values.rate * 100).toFixed(2)}%** · ` +
      `avg: **${fmt(duration.avg)}** · p95: **${fmt(duration['p(95)'])}**`,
    '',
    '| Metric | Threshold | Result |',
    '|---|---|---|',
    ...rows,
    '',
  ].join('\n');
}

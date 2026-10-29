// Minimal stand-in for the reqres.in endpoints the test plan uses, so the
// load test has a target it can actually load. reqres.in's free tier allows
// 20 requests/minute, which any real load test blows through in seconds.
//
// Endpoints (same response shapes as reqres.in):
//   GET /api/users?page=N   paginated user list, 6 per page
//   GET /api/users/:id      single user, 404 if unknown
//   GET /health             readiness check for CI
//
// Usage: node mock-api/server.js [port]   (default 8080, or $PORT)

const http = require('http');

const PORT = Number(process.argv[2] || process.env.PORT || 8080);
const PER_PAGE = 6;

const names = [
  ['George', 'Bluth'], ['Janet', 'Weaver'], ['Emma', 'Wong'], ['Eve', 'Holt'],
  ['Charles', 'Morris'], ['Tracey', 'Ramos'], ['Michael', 'Lawson'], ['Lindsay', 'Ferguson'],
  ['Tobias', 'Funke'], ['Byron', 'Fields'], ['George', 'Edwards'], ['Rachel', 'Howell'],
];

const users = names.map(([first, last], i) => ({
  id: i + 1,
  email: `${first}.${last}@reqres.in`.toLowerCase(),
  first_name: first,
  last_name: last,
  avatar: `https://reqres.in/img/faces/${i + 1}-image.jpg`,
}));

const support = {
  url: 'https://github.com/gillersja1/AzureLoadTestingExample',
  text: 'Local mock of the reqres.in users API for load testing.',
};

function send(res, status, body) {
  const json = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(json) });
  res.end(json);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method !== 'GET') return send(res, 405, { error: 'Method not allowed' });

  if (url.pathname === '/health') return send(res, 200, { status: 'ok' });

  if (url.pathname === '/api/users') {
    const page = Math.max(1, parseInt(url.searchParams.get('page'), 10) || 1);
    const start = (page - 1) * PER_PAGE;
    return send(res, 200, {
      page,
      per_page: PER_PAGE,
      total: users.length,
      total_pages: Math.ceil(users.length / PER_PAGE),
      data: users.slice(start, start + PER_PAGE),
      support,
    });
  }

  const match = url.pathname.match(/^\/api\/users\/(\d+)$/);
  if (match) {
    const user = users.find((u) => u.id === Number(match[1]));
    return user ? send(res, 200, { data: user, support }) : send(res, 404, {});
  }

  send(res, 404, {});
});

server.listen(PORT, () => console.log(`Mock reqres API listening on http://localhost:${PORT}`));

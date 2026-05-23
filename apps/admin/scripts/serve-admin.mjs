import { createReadStream, existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';

const root = join(process.cwd(), 'dist');
const port = Number.parseInt(process.env.ADMIN_PORT ?? '5173', 10);
const types = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.ico', 'image/x-icon'],
]);

createServer((request, response) => {
  const rawPath = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`).pathname;
  const requestedPath = normalize(rawPath === '/' ? '/index.html' : rawPath);
  const filePath = join(root, requestedPath);
  const finalPath = filePath.startsWith(root) && existsSync(filePath) ? filePath : join(root, 'index.html');

  response.setHeader('Content-Type', types.get(extname(finalPath)) ?? 'application/octet-stream');
  createReadStream(finalPath).pipe(response);
}).listen(port, '0.0.0.0', () => {
  console.log(`KhidmatApp admin available at http://localhost:${port}`);
});

import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { IncomingMessage, ServerResponse } from 'node:http'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const rootDir = path.dirname(fileURLToPath(import.meta.url))
const __dirname = rootDir
const ER_JSON_PATH = path.resolve(__dirname, 'public/data/er.json')

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (c) => {
      chunks.push(typeof c === 'string' ? Buffer.from(c) : Buffer.from(c))
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

function send(res: ServerResponse, code: number, body: string, type = 'text/plain') {
  res.statusCode = code
  res.setHeader('Content-Type', `${type}; charset=utf-8`)
  res.end(body)
}

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(rootDir, './src'),
    },
  },
  // 自动保存会写 er.json；不忽略则 Vite 监听到变更会整页刷新，侧栏每输一字就像「刷新」
  server: {
    watch: {
      ignored: [ER_JSON_PATH, '**/public/data/er.json'],
    },
    proxy: {
      '/api': {
        // 完整 ER API（app.main）默认 8001；8000 上可能是旧版 sync 服务
        target: 'http://127.0.0.1:8001',
        changeOrigin: true,
      },
    },
  },
  plugins: [
    react(),
    tailwindcss(),
    {
      name: 'save-er-json-dev-api',
      configureServer(server) {
        server.middlewares.use(async (req, res, next) => {
          const pathname = req.url?.split('?')[0] ?? ''
          if (req.method !== 'POST' || pathname !== '/api/save-er-json') {
            return next()
          }
          try {
            const raw = await readBody(req)
            const data = JSON.parse(raw) as unknown
            if (!Array.isArray(data)) {
              return send(res, 400, 'Body must be a JSON array of tables')
            }
            await fs.mkdir(path.dirname(ER_JSON_PATH), { recursive: true })
            await fs.writeFile(ER_JSON_PATH, JSON.stringify(data, null, 2), 'utf8')
            res.setHeader('Content-Type', 'application/json; charset=utf-8')
            res.statusCode = 200
            res.end(JSON.stringify({ ok: true, path: 'public/data/er.json' }))
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e)
            return send(res, 500, msg)
          }
        })
      },
    },
  ],
})

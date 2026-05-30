export const config = {
  port: Number(process.env.COLLAB_PORT || 1234),
  path: process.env.COLLAB_PATH || '/collab',
  apiBase: process.env.API_BASE || 'http://127.0.0.1:8001',
  internalToken: process.env.COLLAB_INTERNAL_TOKEN || 'dev-collab-internal-token',
  jwtSecret: process.env.JWT_SECRET || 'dev-antvx6-change-me',
  jwtIssuer: process.env.JWT_ISSUER || 'antvx6',
  database: {
    host: process.env.POSTGRES_HOST || 'localhost',
    port: Number(process.env.POSTGRES_PORT || 5432),
    database: process.env.POSTGRES_DB || 'antvx6',
    user: process.env.POSTGRES_USER || 'postgres',
    password: process.env.POSTGRES_PASSWORD || 'postgres',
  },
}

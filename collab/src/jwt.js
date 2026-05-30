import crypto from 'node:crypto'
import { config } from './config.js'

function b64urlDecode(value) {
  const padded = value + '='.repeat((4 - (value.length % 4)) % 4)
  return Buffer.from(padded.replace(/-/g, '+').replace(/_/g, '/'), 'base64')
}

function b64url(value) {
  return Buffer.from(value).toString('base64url')
}

export function verifyJwt(token) {
  if (!token || typeof token !== 'string') throw new Error('missing token')
  const [headerPart, payloadPart, signaturePart] = token.split('.')
  if (!headerPart || !payloadPart || !signaturePart) throw new Error('invalid token')
  const signingInput = `${headerPart}.${payloadPart}`
  const expected = crypto
    .createHmac('sha256', config.jwtSecret)
    .update(signingInput)
    .digest()
  const actual = b64urlDecode(signaturePart)
  if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) {
    throw new Error('invalid signature')
  }
  const header = JSON.parse(b64urlDecode(headerPart).toString('utf8'))
  const payload = JSON.parse(b64urlDecode(payloadPart).toString('utf8'))
  if (header.alg !== 'HS256') throw new Error('unsupported token algorithm')
  if (payload.iss !== config.jwtIssuer) throw new Error('invalid issuer')
  if (Number(payload.exp || 0) < Math.floor(Date.now() / 1000)) throw new Error('expired token')
  return payload
}

export function clientIdForUser(payload) {
  return b64url(`${payload.sub}:${payload.email || ''}`).slice(0, 48)
}

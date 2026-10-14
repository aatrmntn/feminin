// AWS Lambda entry point (API Gateway HTTP API, payload format 2.0).
// The JWT authorizer has already verified the Cognito access token; the user id comes from it.
import { createApp } from './app.js';
import { createDynamoDb } from './db-dynamo.js';
import { userFromClaims } from './claims.js';

const app = createApp({ db: createDynamoDb() });

const HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
};

export async function handler(event) {
  let body;
  try {
    body = parseBody(event);
  } catch {
    return respond(400, { error: 'Die Anfrage konnte nicht gelesen werden.' });
  }
  const res = await app.handle({
    method: event.requestContext?.http?.method || 'GET',
    path: event.rawPath || '/',
    query: event.queryStringParameters || {},
    body,
    user: userFromClaims(event.requestContext?.authorizer?.jwt?.claims),
  });
  return respond(res.status, res.body);
}

function parseBody(event) {
  if (!event.body) return undefined;
  const raw = event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : event.body;
  return JSON.parse(raw);
}

function respond(statusCode, body) {
  return { statusCode, headers: HEADERS, body: JSON.stringify(body) };
}

import assert from 'node:assert/strict';
import test from 'node:test';
import { googleCalendarConfigured } from './google-calendar';

const ENV_KEYS = [
  'GOOGLE_CALENDAR_ID',
  'GOOGLE_CALENDAR_SERVICE_ACCOUNT_EMAIL',
  'GOOGLE_SERVICE_ACCOUNT_EMAIL',
  'GOOGLE_CALENDAR_PRIVATE_KEY',
  'GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY',
];

function withEnv(values: Record<string, string | undefined>, fn: () => void) {
  const previous = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
  for (const key of ENV_KEYS) delete process.env[key];
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    fn();
  } finally {
    for (const key of ENV_KEYS) {
      const value = previous[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test('google calendar is disabled when service account env is incomplete', () => {
  withEnv({ GOOGLE_CALENDAR_ID: 'primary' }, () => {
    assert.equal(googleCalendarConfigured(), false);
  });
});

test('google calendar is enabled when calendar id, email and private key are configured', () => {
  withEnv({
    GOOGLE_CALENDAR_ID: 'calendar@example.com',
    GOOGLE_CALENDAR_SERVICE_ACCOUNT_EMAIL: 'svc@example.iam.gserviceaccount.com',
    GOOGLE_CALENDAR_PRIVATE_KEY: '-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----',
  }, () => {
    assert.equal(googleCalendarConfigured(), true);
  });
});

// Managed load test — k6
//
// SAFETY: Run ONLY against a staging/pre-prod environment you own and are
// authorised to test. Never target production or third-party infrastructure.
//
// Usage:
//   TARGET_URL="https://staging.example.internal" k6 run staging-load-test.js
//
// Load is staged (ramp up -> hold -> ramp down) and thresholds abort the run
// if the target starts failing, so a managed test cannot drift into a DoS.

import http from 'k6/http';
import { check, sleep } from 'k6';

const TARGET = __ENV.TARGET_URL;
if (!TARGET) {
  throw new Error('TARGET_URL env var is required (a staging URL you own).');
}

// Refuse to run against the known production site.
if (/mimi-site\.pages\.mmsmart\.ru/i.test(TARGET)) {
  throw new Error(
    'Refusing to run: TARGET_URL points at the production Pages site. ' +
      'Load-test a staging environment you control instead.'
  );
}

export const options = {
  stages: [
    { duration: '30s', target: 5 },   // warm-up
    { duration: '2m', target: 25 },   // ramp to peak
    { duration: '3m', target: 25 },   // sustained peak
    { duration: '30s', target: 0 },   // cool-down
  ],
  thresholds: {
    // Abort the whole run if the target is clearly overloaded.
    http_req_failed: [{ threshold: 'rate<0.05', abortOnFail: true }],
    http_req_duration: [
      { threshold: 'p(95)<1500', abortOnFail: true },
      { threshold: 'p(99)<3000', abortOnFail: true },
    ],
  },
};

export default function () {
  const res = http.get(`${TARGET}/`);
  check(res, {
    'status is 2xx/3xx': (r) => r.status >= 200 && r.status < 400,
  });
  sleep(2);
}

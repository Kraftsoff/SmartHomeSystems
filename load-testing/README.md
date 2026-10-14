# Load testing — SmartHomeSystems

A small, **managed** load-testing harness for stress-testing our own
**staging** environment in a controlled way (ramp up, hold, ramp down, with
auto-abort thresholds).

## ⚠️ Rules of engagement (read first)

1. **Staging only.** Only run this against a pre-prod/staging environment that
   we own and are authorised to test. The harness refuses to target the
   production site `mimi-site.pages.mmsmart.ru`.
2. **Get authorisation.** For hosted platforms (e.g. Cloudflare/GitLab Pages),
   load/stress testing often requires provider approval. Confirm before running
   and keep the window short.
3. **Start small.** Begin with low arrival rates and raise them deliberately.
   The goal is to find limits, not to knock the service over.
4. **Watch the target.** Have the staging dashboards/logs open. Stop if error
   rates or latency climb — the thresholds auto-abort, but don't rely on that
   alone.
5. **Off-peak.** Prefer a maintenance window so you don't disrupt other QA work.

This is for capacity/performance testing of our own systems — not for
attacking, flooding, or probing any system we don't control.

## Layout

```
load-testing/
├── run.sh                      # safe launcher (enforces the guards above)
├── artillery/
│   ├── staging-load-test.yml   # Artillery profile (phased load + ensure)
│   └── package.json            # pins artillery 2.x
└── k6/
    └── staging-load-test.js    # equivalent k6 scenario
```

## Quick start (Artillery — no extra install needed beyond npm)

```bash
cd load-testing
TARGET_URL="https://staging.mmsmart.ru" I_HAVE_AUTHORISATION=yes ./run.sh
```

`run.sh` installs Artillery locally on first run, executes the profile, and
writes `report-<timestamp>.json` plus an HTML report in `artillery/`.

## Quick start (k6)

```bash
cd load-testing
TARGET_URL="https://staging.mmsmart.ru" I_HAVE_AUTHORISATION=yes ENGINE=k6 ./run.sh
# or directly:
TARGET_URL="https://staging.mmsmart.ru" k6 run k6/staging-load-test.js
```

## Tuning the load

Override any of these env vars (defaults shown). Durations in seconds; rates are
Artillery "arrivals per second".

| Var           | Default | Meaning                          |
|---------------|---------|----------------------------------|
| `WARMUP_RATE` | 1       | starting arrival rate            |
| `RAMP_RATE`   | 10      | rate after warm-up               |
| `PEAK_RATE`   | 30      | sustained peak arrival rate      |
| `WARMUP_SEC`  | 30      | warm-up duration                 |
| `RAMP_SEC`    | 120     | ramp-to-peak duration            |
| `SUSTAIN_SEC` | 180     | time held at peak                |
| `COOLDOWN_SEC`| 30      | ramp-down duration               |

Example — a heavier soak test once the baseline looks healthy:

```bash
TARGET_URL="https://staging.mmsmart.ru" I_HAVE_AUTHORISATION=yes \
  PEAK_RATE=75 SUSTAIN_SEC=600 ./run.sh
```

## Auto-abort thresholds

Both engines stop the run if the target is clearly overloaded:

- p95 latency ≥ 1500 ms
- p99 latency ≥ 3000 ms
- (k6) request failure rate ≥ 5%

Adjust these in `staging-load-test.yml` / `staging-load-test.js` to match the
SLOs you're validating against.

## Extending the scenario

The default scenario just browses public pages. To exercise real user journeys
(login, API calls, forms), add steps to the Artillery `scenarios` flow or the
k6 `default` function. Keep think-times realistic so the load models actual
usage rather than a raw flood.

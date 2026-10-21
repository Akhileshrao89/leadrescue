# LeadRescue — Disaster Recovery & Operational Incident Runbook

> **Document Version**: 1.0.0  
> **Status**: Production Operational Runbook (Phase 12 Hardening)  
> **Authoritative Systems**: PostgreSQL (Supabase), Next.js App Router, Resend API, Stripe Webhooks

---

## 1. Incident Severity Matrix & Escalation

| Severity             | Definition                                                                                                                             | Target Response (MTTA) | Target Resolution (MTTR) | Notification Channels                                     |
| :------------------- | :------------------------------------------------------------------------------------------------------------------------------------- | :--------------------- | :----------------------- | :-------------------------------------------------------- |
| **SEV-1 (Critical)** | Core service down: Database unreachable, all users receive 503, webhook ingestion failing, or data corruption detected.                | **< 15 minutes**       | **< 1 hour**             | PagerDuty, Ops Slack `#incidents-critical`, On-Call Phone |
| **SEV-2 (Major)**    | Degraded functionality: Outbox worker backlog spiking (> 200 jobs), email delivery delayed, or payment webhooks queueing.              | **< 30 minutes**       | **< 4 hours**            | Ops Slack `#incidents-ops`, Email Alert                   |
| **SEV-3 (Minor)**    | Isolated non-breaking anomaly: Single customer rate limit false positive, localized UI layout bug, or dead-letter queue count $\le 5$. | **< 2 hours**          | **< 24 hours**           | Linear / GitHub Issue Tracker                             |

---

## 2. Health Check & Diagnostic Probing

LeadRescue provides a synthetic monitoring endpoint at `/api/health`.

### 2.1 Automated Health Probing

Configure external uptime probes (Datadog Synthetics, UptimeRobot, AWS Route53) to poll every 30 seconds:

- **Method**: `GET` or `HEAD`
- **URL**: `https://<domain>/api/health`
- **Success Criteria**: HTTP status `200 OK`
- **Failure Alert**: HTTP status `503 Service Unavailable` or latency $> 2000\text{ms}$ for 2 consecutive checks.

### 2.2 Expected Payload Schema

```json
{
  "status": "healthy",
  "timestamp": "2026-10-19T18:00:00.000Z",
  "uptimeSeconds": 14285.4,
  "version": "1.0.0",
  "checks": {
    "database": {
      "status": "up",
      "latencyMs": 14
    },
    "outbox": {
      "status": "healthy",
      "queuedCount": 3,
      "deadLetterCount": 0
    },
    "memory": {
      "heapUsedMb": 54.32,
      "heapTotalMb": 98.45,
      "rssMb": 142.1
    }
  }
}
```

---

## 3. Database Outage & Failover Recovery

### 3.1 Symptoms & Root Causes

- `/api/health` returns HTTP 503 with `"checks": { "database": { "status": "down" } }`.
- Application error boundary displays generic `"Something went wrong"` with high frequency.
- Common causes: Connection pool exhaustion (PgBouncer/Supavisor), scheduled Supabase maintenance, or runaway unbounded queries.

### 3.2 Triage & Recovery Steps

1. **Check Connection Pooler Status**:
   Inspect active and waiting connections via the Supabase Dashboard:

   ```sql
   SELECT count(*), state FROM pg_stat_activity GROUP BY state;
   ```

   If active connections exceed pool capacity (default 60), check for idle transactions holding locks:

   ```sql
   SELECT pid, now() - state_change AS duration, query
   FROM pg_stat_activity
   WHERE state = 'idle in transaction' AND state_change < now() - interval '30 seconds';
   ```

   Terminate runaway blocking backend PIDs:

   ```sql
   SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE pid = $runaway_pid;
   ```

2. **Supavisor Transaction Mode Verification**:
   Verify the Next.js runtime environment is configured to use port `6543` (Transaction Pooler) rather than `5432` (Direct Session):

   ```bash
   # Ensure connection string ends with port 6543
   postgres://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres
   ```

3. **Point-In-Time Recovery (PITR)**:
   If catastrophic data corruption occurred:
   - Navigate to **Supabase Dashboard > Database > Backups > Point in Time Recovery**.
   - Select the target timestamp prior to the incident (e.g. 5 minutes before bad script execution).
   - Restore to a temporary project, verify tables `workspaces`, `leads`, `activity_logs`, and initiate DNS / connection string swap.

---

## 4. Outbox Dead-Letter Queue (DLQ) Remediation

### 4.1 Symptoms & Root Causes

- Health check reports `"outbox": { "status": "critical_dlq_high", "deadLetterCount": > 10 }`.
- Agency users report missing automated follow-up reminder emails.
- Common causes: Invalid recipient email syntax, external Resend API authentication expiration, or transient upstream 5xx errors exceeding max retry attempts (default: 5).

### 4.2 Triage Queries

Connect to the database via administrative SQL console:

```sql
-- 1. Inspect recent dead-lettered jobs and their failure reasons
SELECT id, event_type, payload, attempts, last_error, updated_at
FROM outbox_events
WHERE status = 'DEAD_LETTER'
ORDER BY updated_at DESC
LIMIT 20;

-- 2. Aggregate errors by message to find patterns
SELECT last_error, count(*)
FROM outbox_events
WHERE status = 'DEAD_LETTER'
GROUP BY last_error
ORDER BY count(*) DESC;
```

### 4.3 Safe DLQ Replay Procedures

#### Scenario A: Transient Third-Party Outage Resolved (e.g., Resend service restored)

Once the external provider is operational, reset all dead-lettered jobs whose failure was caused by provider network timeouts:

```sql
UPDATE outbox_events
SET
  status = 'QUEUED',
  attempts = 0,
  available_at = now(),
  last_error = NULL,
  lease_token = NULL,
  lease_expires_at = NULL,
  updated_at = now()
WHERE status = 'DEAD_LETTER'
  AND (last_error ILIKE '%resend%' OR last_error ILIKE '%503%' OR last_error ILIKE '%timeout%');
```

#### Scenario B: Poison-Pill Job with Malformed Email

If a specific event payload contains uncorrectable invalid data:

```sql
-- Mark as permanently archived / cancelled to prevent endless worker cycles
UPDATE outbox_events
SET
  status = 'COMPLETED',
  last_error = 'MANUALLY_CANCELLED: ' || last_error,
  updated_at = now()
WHERE id = '$poison_pill_uuid';
```

---

## 5. Worker Stalled Lease Clearing & Concurrency Recovery

### 5.1 Architecture Safety Guarantee

LeadRescue uses PostgreSQL `FOR UPDATE SKIP LOCKED` combined with time-bounded lease tokens (`lease_expires_at = now() + 2 minutes`).

### 5.2 Auto-Recovery Behavior

- If an outbox worker container crashes or terminates abruptly mid-job execution:
  - Jobs claimed by the dead worker remain locked only until their `lease_expires_at` timestamp passes.
  - Subsequent worker executions run:
    ```sql
    SELECT * FROM outbox_events
    WHERE status = 'PROCESSING'
      AND lease_expires_at < now()
    ```
    and claim them safely without manual intervention.

### 5.3 Manual Emergency Lease Release

If an unexpected edge case leaves jobs trapped in `'PROCESSING'` status:

```sql
UPDATE outbox_events
SET
  status = 'QUEUED',
  lease_token = NULL,
  lease_expires_at = NULL,
  available_at = now(),
  updated_at = now()
WHERE status = 'PROCESSING'
  AND lease_expires_at < now() - interval '5 minutes';
```

---

## 6. Stripe Webhook Replay & Idempotency Runbook

### 6.1 Idempotency Guarantee

The webhook handler (`/api/webhooks/stripe`) inserts every received event into `stripe_events_processed(id, event_type, created_at)` inside the same transactional boundary or pre-check.

- Any event received multiple times will return `200 OK` with `{ received: true, deduplicated: true }`.

### 6.2 Replaying Failed Webhooks

If Stripe reports webhook delivery failures (e.g. during a deployment or brief downtime):

1. Navigate to **Stripe Dashboard > Developers > Webhooks**.
2. Select the LeadRescue endpoint `https://<domain>/api/webhooks/stripe`.
3. Go to the **Failed** tab.
4. Select all failed events and click **Resend**.
5. Verify in LeadRescue logs that incoming signatures pass constant-time comparison:
   ```bash
   grep "[STRIPE_WEBHOOK]" /var/log/app.log
   ```

---

## 7. Rate Limiting & Abuse Defense

### 7.1 Threshold Rules

- **Authentication Routes (`/auth/*`)**: 10 attempts per minute per IP.
- **Sensitive Operations (CSV Import, Lead Batch)**: 30 requests per minute per IP.
- **Health Check Route (`/api/health`)**: Excluded from rate limits for synthetic probe stability.

### 7.2 False-Positive Emergency Bypass

If an entire office network of an agency customer shares an egress NAT IP and triggers HTTP 429:

1. Identify the caller IP from telemetry logs:
   ```json
   { "event": "RATE_LIMIT_TRIGGERED", "ip": "203.0.113.45" }
   ```
2. Temporary mitigation: Add the agency IP to the Cloudflare / Vercel Edge allowlist or temporarily increase window ceiling in `src/lib/security/rate-limiter.ts`.

---

## 8. Incident Post-Mortem Template

Every SEV-1 and SEV-2 incident requires a post-mortem document completed within 48 hours:

1. **Summary**: Brief description of what occurred and customer impact.
2. **Timeline**: UTC timestamps of alert trigger, detection, triage, mitigation, and complete fix.
3. **Root Cause Analysis (5 Whys)**: The mechanical and systemic breakdown that allowed the incident.
4. **Action Items**: Preventative measures, new automated test cases, and monitoring alerts created.

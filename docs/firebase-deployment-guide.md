# LeadRescue — Firebase Deployment & Hosting Runbook

> **Document Version**: 1.0.0  
> **Status**: Production Operational Runbook  
> **Target Platform**: Firebase App Hosting (Next.js 16 App Router SSR) & Firebase Hosting

---

## 1. Overview

LeadRescue natively supports **Firebase App Hosting**, Google Cloud's next-generation platform purpose-built for full-stack Next.js applications featuring Server-Side Rendering (SSR), Server Actions, and Turbopack.

### Key Capabilities on Firebase

- **Zero-Cold-Start Serverless**: Autoscaling container instances configured in [`apphosting.yaml`](file:///Users/rao/.gemini/antigravity/scratch/leadrescue/apphosting.yaml).
- **Google Cloud Secret Manager**: Automated secure injection of Stripe, Supabase, and Resend secrets without exposing them to client code.
- **Global CDN Caching**: Global Edge caching with strict security headers from [`firebase.json`](file:///Users/rao/.gemini/antigravity/scratch/leadrescue/firebase.json).

---

## 2. Prerequisites

1. Install the latest Firebase CLI:
   ```bash
   npm install -g firebase-tools
   ```
2. Login to your Firebase / Google Cloud account:
   ```bash
   firebase login
   ```
3. Initialize or link your Firebase project:
   ```bash
   firebase use --add
   ```

---

## 3. Configuring Production Secrets in Firebase

Never commit production API keys to git. Store them in Google Cloud Secret Manager via the Firebase CLI:

```bash
# 1. Database Secrets
firebase apphosting:secrets:set SUPABASE_SERVICE_ROLE_KEY
firebase apphosting:secrets:set DATABASE_URL

# 2. Stripe Billing Secrets
firebase apphosting:secrets:set STRIPE_SECRET_KEY
firebase apphosting:secrets:set STRIPE_WEBHOOK_SECRET

# 3. Email Provider Secret
firebase apphosting:secrets:set RESEND_API_KEY
```

---

## 4. Deploying via Firebase App Hosting

### Option A: Connected GitHub Repository (Continuous Delivery)

1. Navigate to the **Firebase Console > App Hosting**.
2. Click **Get Started** and link your GitHub repository.
3. Select your deployment branch (`main`).
4. Firebase App Hosting will read [`apphosting.yaml`](file:///Users/rao/.gemini/antigravity/scratch/leadrescue/apphosting.yaml) and automatically trigger production builds whenever you push to GitHub.

### Option B: Local CLI Backend Creation

```bash
# Create an App Hosting backend in your primary region
firebase apphosting:backends:create --location us-central1
```

---

## 5. Domain Configuration & Verification

1. In the Firebase App Hosting dashboard, navigate to **Settings > Custom Domains**.
2. Add your agency domain (e.g., `app.leadrescue.example.com`).
3. Add the provided DNS TXT and A records at your registrar (Cloudflare / Namecheap / Route 53).
4. Verify deployment health via the diagnostic probe:
   ```bash
   curl -I https://app.leadrescue.example.com/api/health
   ```
   _Expected Response: HTTP 200 with security headers and diagnostic payload._

# Security Incident Response: Exposed API Keys

If a real credential was committed to GitHub, treat it as compromised even if the commit was deleted later. Removing a file from the latest branch does not invalidate the credential or erase it from Git history, forks, caches, or clones.

## Immediate containment (do this first)

1. **Revoke/rotate the exposed credential at its provider now.** Do not wait to rewrite Git history.
2. Review provider logs and usage since the earliest possible exposure; disable suspicious sessions, keys, webhooks, or integrations.
3. Replace the value in Vercel and any other deployment environment with the newly rotated value. Never paste the new value into chat, issues, commits, or screenshots.
4. If a Supabase `service_role` key or database password was exposed, rotate it and review database access/RLS policies. If rotation impacts deployed clients, coordinate the rollout carefully.
5. If a Stripe secret or webhook signing secret was exposed, rotate it in Stripe and update deployment settings. For Resend/OpenAI/Upstash credentials, revoke and create replacements with least privilege.

## Remove secrets from Git history

After rotation, use a clean clone and `git-filter-repo` to remove the file or exact secret-bearing paths from all reachable history. Coordinate with collaborators before force-pushing because everyone will need to re-clone or carefully reset. GitHub may retain cached views or pull-request references; follow GitHub's sensitive-data removal guidance if needed. **History rewriting is not a substitute for rotation.**

Example for an accidentally committed `.env.local` file (run only after making a secure backup and rotating the secrets):

```bash
git filter-repo --path .env.local --invert-paths
git push --force --all
git push --force --tags
```

For a secret embedded in source, use `git-filter-repo --replace-text` with a protected replacements file; do not put actual secrets into terminal logs or share the replacement file. Review all branches and tags.

## Repository hygiene

- Commit only `.env.example` with empty or clearly fake placeholders. Never commit `.env`, `.env.local`, `.env.production`, credential JSON, private keys, database dumps, or customer exports.
- Keep privileged keys server-side. Anything prefixed `NEXT_PUBLIC_` is intended to be public and must never contain a privileged credential. Supabase anon/publishable keys are designed for client use only when RLS is correctly configured.
- Use separate least-privilege credentials for local, preview/staging, and production.
- Enable GitHub secret scanning and push protection in repository settings where available. Add a pre-commit scanner such as Gitleaks.
- Review `git status --ignored`, `git ls-files`, and GitHub's security alerts before every production release.

## This uploaded ZIP audit limitation

A source ZIP does not include `.git` history and cannot establish whether a secret was ever pushed. No real provider credential was detected by the basic pattern scan of this ZIP, but that is not proof the GitHub repository/history is clean. Check GitHub's secret scanning alerts and scan the full repository history separately.

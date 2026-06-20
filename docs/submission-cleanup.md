# Submission Cleanup

Use this checklist before packaging or submitting the project. It removes generated local artifacts without deleting source files.

## Generated Files To Exclude

The repository is configured to ignore these local outputs:

- Dependency directories such as `node_modules/`.
- Build outputs such as `dist/`, `build/`, and TypeScript build info files.
- Test and coverage outputs such as `coverage/`, `test-results/`, and `playwright-report/`.
- Runtime logs, audit log files, PID files, temporary files, and editor swap files.
- Local environment files such as `.env` and `.env.local`; keep `.env.example`.
- Disaster-recovery output under `backups/`.
- Terraform provider caches, state files, crash logs, and lock info under `terraform/**`.

## Cleanup Commands

Stop local services and remove generated runtime state:

```bash
docker compose down -v
```

Remove generated files that may have been created while testing:

```bash
rm -rf backups build coverage test-results playwright-report
rm -rf services/exchange-api/dist services/portal/dist
rm -rf terraform/local/.terraform
rm -f hde-audit.log *.log *.pid terraform/local/crash.log terraform/local/crash.*.log
```

If dependencies should not be included in the submission package, remove them too:

```bash
rm -rf node_modules services/exchange-api/node_modules services/portal/node_modules
```

Keep source, manifests, docs, scripts, and `.env.example` in place. Do not include personal `.env` files, generated backups, local Terraform state, or Docker volume data.

## Final Review

Run these checks before submitting:

```bash
find . -maxdepth 3 \( -name '.env' -o -name '.env.*' \) -not -name '.env.example' -print
find . -maxdepth 3 \( -name '*.tfstate' -o -name '*.tfstate.*' -o -name '*.log' \) -print
find . -maxdepth 3 \( -path './backups/*' -o -path './build/*' -o -path './coverage/*' \) -print
```

The commands should produce no output for a clean submission.

#!/usr/bin/env bash
set -euo pipefail

failures=0

check_file() {
  local file="$1"
  if [[ ! -f "$file" ]]; then
    echo "missing required file: $file"
    failures=$((failures + 1))
  fi
}

check_file ".github/CODEOWNERS"
check_file "Jenkinsfile"
check_file "kubernetes/base/networkpolicy.yaml"
check_file "security/vault/policies.hcl"
check_file "docs/disaster-recovery.md"
check_file "docs/compliance-controls.md"

if rg -n -e 'AKIA[0-9A-Z]{16}' -e 'BEGIN (RSA|OPENSSH) PRIVATE KEY' . \
  -g '!node_modules' -g '!package-lock.json' -g '!backups' -g '!scripts/compliance-check.sh' >/tmp/hde-secret-scan.txt; then
  cat /tmp/hde-secret-scan.txt
  echo "potential secret material found"
  failures=$((failures + 1))
fi

if ! rg -n "writeAudit\\(" services/exchange-api/src/routes >/dev/null; then
  echo "audit logging calls not found in route handlers"
  failures=$((failures + 1))
fi

if ! bash scripts/validate-api-authorization.sh; then
  echo "API authorization behavior validation failed"
  failures=$((failures + 1))
fi

if [[ "$failures" -gt 0 ]]; then
  echo "compliance validation failed with $failures issue(s)"
  exit 1
fi

echo "compliance validation passed"

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

if command -v rg >/dev/null 2>&1; then
  secret_scan_command=(
    rg -n -e 'AKIA[0-9A-Z]{16}' -e 'BEGIN (RSA|OPENSSH) PRIVATE KEY' .
    -g '!node_modules' -g '!package-lock.json' -g '!backups' -g '!scripts/compliance-check.sh'
  )
  audit_scan_command=(rg -n 'writeAudit\(' services/exchange-api/src/routes)
else
  secret_scan_command=(
    grep -RInE --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=backups --exclude=package-lock.json --exclude=compliance-check.sh
    'AKIA[0-9A-Z]{16}|BEGIN (RSA|OPENSSH) PRIVATE KEY' .
  )
  audit_scan_command=(grep -RIn 'writeAudit(' services/exchange-api/src/routes)
fi

if "${secret_scan_command[@]}" >/tmp/hde-secret-scan.txt; then
  cat /tmp/hde-secret-scan.txt
  echo "potential secret material found"
  failures=$((failures + 1))
fi

if ! "${audit_scan_command[@]}" >/dev/null; then
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

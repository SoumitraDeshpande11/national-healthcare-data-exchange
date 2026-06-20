## Summary

## Risk and Compliance
- [ ] No secrets or patient data are committed.
- [ ] API changes preserve authentication, authorization, and audit logging.
- [ ] Data model changes include migration and rollback notes.
- [ ] Kubernetes/Terraform changes were reviewed for least privilege.

## Validation
- [ ] `npm run lint`
- [ ] `npm test`
- [ ] `bash scripts/compliance-check.sh`

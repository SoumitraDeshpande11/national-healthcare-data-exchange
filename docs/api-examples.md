# API Examples

These examples target the running Docker Compose stack at `http://localhost:8080`.

## Start And Verify

```bash
docker compose up -d --build
bash scripts/smoke-test.sh
```

The smoke test calls `/health/live`, `/health/ready`, exchanges the agency API key for a token, and confirms agency access to `/compliance/summary`.

## Get Tokens

Agency token:

```bash
export AGENCY_TOKEN="$(
  curl -sS -X POST http://localhost:8080/auth/token \
    -H 'content-type: application/json' \
    -d '{"apiKey":"agency-local-api-key"}' | jq -r '.accessToken'
)"
```

Hospital token:

```bash
export HOSPITAL_TOKEN="$(
  curl -sS -X POST http://localhost:8080/auth/token \
    -H 'content-type: application/json' \
    -d '{"apiKey":"hospital-local-api-key"}' | jq -r '.accessToken'
)"
```

Other valid API keys are `lab-local-api-key`, `pharmacy-local-api-key`, and `insurer-local-api-key`.

Lab token:

```bash
export LAB_TOKEN="$(
  curl -sS -X POST http://localhost:8080/auth/token \
    -H 'content-type: application/json' \
    -d '{"apiKey":"lab-local-api-key"}' | jq -r '.accessToken'
)"
```

## Register Or Update A Patient

Only `hospital` and `agency` tokens can write patients.

```bash
curl -sS -X POST http://localhost:8080/patients \
  -H "authorization: Bearer $HOSPITAL_TOKEN" \
  -H 'content-type: application/json' \
  -d '{
    "nationalHealthId": "NHID-1000001",
    "fullName": "Aarav Mehta",
    "dateOfBirth": "1997-04-12",
    "consentStatus": "active"
  }' | jq .
```

The API performs an upsert on `nationalHealthId`, grants the writing organization access to the patient, and writes a `patient.upsert` audit event.

## Grant Patient Access

Hospital or agency users with access to the patient can grant another participant access:

```bash
export LAB_ORG_ID="$(
  curl -sS http://localhost:8080/auth/organizations \
    -H "authorization: Bearer $HOSPITAL_TOKEN" |
    jq -r '.organizations[] | select(.type == "laboratory") | .id'
)"

curl -sS -X POST http://localhost:8080/patients/NHID-1000001/access-grants \
  -H "authorization: Bearer $HOSPITAL_TOKEN" \
  -H 'content-type: application/json' \
  -d "{\"organizationId\":\"$LAB_ORG_ID\"}" | jq .
```

## Read A Patient

```bash
curl -sS http://localhost:8080/patients/NHID-1000001 \
  -H "authorization: Bearer $HOSPITAL_TOKEN" | jq .
```

The API requires active patient consent plus an agency token or active patient access grant. Reads write a `patient.read` audit event.

## Publish A Clinical Record

```bash
curl -sS -X POST http://localhost:8080/records \
  -H "authorization: Bearer $HOSPITAL_TOKEN" \
  -H 'content-type: application/json' \
  -d '{
    "nationalHealthId": "NHID-1000001",
    "recordType": "encounter",
    "payload": {
      "diagnosis": "viral fever",
      "facility": "Metro General Hospital"
    }
  }' | jq .
```

Valid `recordType` values are `encounter`, `lab_result`, `prescription`, `claim`, and `immunization`. Role/type rules are enforced: hospitals create encounters/immunizations, labs create lab results, pharmacies create prescriptions, insurers create claims, and agency users can read compliance data. The patient must exist, have `consentStatus` set to `active`, and have an access grant for the writer unless the writer is the agency. On success, the API stores the record, inserts a `published` sync event, publishes a Redis event on `patient-record-sync`, and writes a `record.create` audit event.

Lab example after granting lab access:

```bash
curl -sS -X POST http://localhost:8080/records \
  -H "authorization: Bearer $LAB_TOKEN" \
  -H 'content-type: application/json' \
  -d '{
    "nationalHealthId": "NHID-1000001",
    "recordType": "lab_result",
    "payload": {
      "test": "CBC",
      "result": "normal",
      "lab": "Apex Diagnostic Lab"
    }
  }' | jq .
```

## Upload And Download A Patient Document

```bash
DOCUMENT_ID="$(
  curl -sS -X POST http://localhost:8080/documents \
    -H "authorization: Bearer $HOSPITAL_TOKEN" \
    -F nationalHealthId=NHID-1000001 \
    -F documentType=discharge_summary \
    -F file=@README.md | jq -r '.id'
)"

curl -sS http://localhost:8080/documents/patient/NHID-1000001 \
  -H "authorization: Bearer $HOSPITAL_TOKEN" | jq .

curl -sS http://localhost:8080/documents/$DOCUMENT_ID/download \
  -H "authorization: Bearer $HOSPITAL_TOKEN" -o downloaded-document.txt
```

## Search Patient Records

```bash
curl -sS http://localhost:8080/records/patient/NHID-1000001 \
  -H "authorization: Bearer $HOSPITAL_TOKEN" | jq .
```

This returns up to 200 records for an active-consent patient and writes a `record.search` audit event.

## View Compliance Summary

Agency-only:

```bash
curl -sS http://localhost:8080/compliance/summary \
  -H "authorization: Bearer $AGENCY_TOKEN" | jq .
```

Example response shape:

```json
{
  "patients": 1,
  "records": 1,
  "auditEvents": 5,
  "syncEvents": [
    {
      "status": "published",
      "count": 1
    }
  ]
}
```

## View Audit Events

Agency-only:

```bash
curl -sS http://localhost:8080/compliance/audit-events \
  -H "authorization: Bearer $AGENCY_TOKEN" | jq '.auditEvents[0:5]'
```

## Negative Checks

Confirm role enforcement by calling an agency route with a hospital token:

```bash
curl -i http://localhost:8080/compliance/summary \
  -H "authorization: Bearer $HOSPITAL_TOKEN"
```

Expected result: `403` with `{"error":"insufficient organization role"}`.

Confirm consent enforcement:

```bash
curl -sS -X POST http://localhost:8080/patients \
  -H "authorization: Bearer $HOSPITAL_TOKEN" \
  -H 'content-type: application/json' \
  -d '{"nationalHealthId":"NHID-REVOKED-1","fullName":"Revoked Demo","dateOfBirth":"1988-01-01","consentStatus":"revoked"}' | jq .

curl -i -X POST http://localhost:8080/records \
  -H "authorization: Bearer $HOSPITAL_TOKEN" \
  -H 'content-type: application/json' \
  -d '{"nationalHealthId":"NHID-REVOKED-1","recordType":"encounter","payload":{"diagnosis":"test"}}'
```

Expected result: `403` with `{"error":"patient consent is revoked"}`.

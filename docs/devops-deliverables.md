# DevOps Deliverables

This repository keeps CI and infrastructure local-first so reviewers can run the delivery workflow without AWS credentials.

## Jenkins

`Jenkinsfile` supports:

```bash
npm ci
npm run lint
npm test
bash scripts/compliance-check.sh
npm run build
kubectl kustomize kubernetes/base
docker build -t healthcare/exchange-api:ci-<build> -t healthcare/exchange-api:local -f services/exchange-api/Dockerfile .
```

Optional Jenkins parameters:

- `BUILD_CONTAINER`: builds the local API image.
- `RUN_TRIVY`: runs `npm audit` and Trivy against the built image.
- `DEPLOY_LOCAL_K8S`: applies `kubernetes/base` to the current kubeconfig context.
- `RUN_TERRAFORM`: runs `terraform fmt -check`, `terraform init -backend=false`, `terraform validate`, and `terraform plan`.

## Kubernetes

`kubernetes/base` supports:

```bash
kubectl kustomize kubernetes/base
kubectl apply -k kubernetes/base
kubectl -n healthcare-exchange rollout status deployment/exchange-api --timeout=180s
kubectl -n healthcare-exchange port-forward svc/exchange-api 8080:8080
```

The base manifests include local Postgres, Redis, MinIO, API deployment, RBAC, secrets, ConfigMap, HPA, NetworkPolicy, resource requests, and restricted pod-security labels.

## Terraform

`terraform/local` supports:

```bash
cd terraform/local
terraform fmt -check
terraform init -backend=false
terraform validate
terraform plan -input=false
```

It manages local Kubernetes governance resources: namespace labels, a governance ConfigMap, ResourceQuota, LimitRange, and optional Prometheus Helm chart installation.

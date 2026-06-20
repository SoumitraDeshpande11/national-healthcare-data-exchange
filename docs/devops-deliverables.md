# DevOps Deliverables

This repository keeps CI and infrastructure local-first so reviewers can run the delivery workflow without AWS credentials.

## Jenkins

Jenkins runs locally from Docker Compose:

```bash
docker compose up -d --build jenkins
```

Open `http://localhost:8081` and sign in with `soumitra` / `deshpande`. The image creates a pipeline job named `national-healthcare-data-exchange`, clones the GitHub `main` branch into Jenkins' own workspace, and runs with Node 20, Docker CLI, Docker Compose, `kubectl`, and Terraform available inside the Jenkins container. Jenkins also exposes Prometheus metrics at `/prometheus/`, and Prometheus scrapes that endpoint with the local Jenkins credentials.

The local Jenkins job and repo `Jenkinsfile` support:

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
- `RUN_LIVE_SMOKE`: starts the Compose application stack and runs smoke tests. It is disabled by default because it uses the same host ports as the regular local stack.
- `RUN_TRIVY`: runs `npm audit` and Trivy against the built image.
- `DEPLOY_LOCAL_K8S`: applies `kubernetes/base` to the current kubeconfig context.
- `RUN_TERRAFORM`: runs `terraform fmt -check`, `terraform init -backend=false`, `terraform validate`, and `terraform plan`.

Validate Jenkins itself:

```bash
npm run validate:jenkins
RUN_JENKINS_BUILD=true npm run validate:jenkins
```

The first command checks Jenkins readiness, job parameters, and installed CI tools. The second also triggers a safe validation build with image builds, live smoke, Trivy, Terraform, and Kubernetes deployment disabled.

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

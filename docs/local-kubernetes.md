# Local Kubernetes Deployment

The Kubernetes manifests under `kubernetes/base` deploy the API, PostgreSQL, Redis, MinIO, RBAC, Secrets, ConfigMap, NetworkPolicy, and HPA into the `healthcare-exchange` namespace. They are built for local review on Kind, Docker Desktop Kubernetes, or Minikube and do not require AWS credentials.

## Validate Manifests

```bash
mkdir -p build
kubectl kustomize kubernetes/base > build/kubernetes-rendered.yaml
```

## Build The API Image

```bash
docker build -t healthcare/exchange-api:local -f services/exchange-api/Dockerfile .
```

## Kind

```bash
kind create cluster --name hde
kind load docker-image healthcare/exchange-api:local --name hde
kubectl apply --dry-run=client --validate=false -f build/kubernetes-rendered.yaml
kubectl apply -k kubernetes/base
kubectl -n healthcare-exchange rollout status deployment/exchange-api --timeout=180s
kubectl -n healthcare-exchange port-forward svc/exchange-api 8080:8080
```

In another terminal:

```bash
bash scripts/smoke-test.sh
```

## Docker Desktop Kubernetes

Build the image into Docker Desktop, then apply the manifests:

```bash
docker build -t healthcare/exchange-api:local -f services/exchange-api/Dockerfile .
kubectl apply --dry-run=client --validate=false -f build/kubernetes-rendered.yaml
kubectl apply -k kubernetes/base
kubectl -n healthcare-exchange rollout status deployment/exchange-api --timeout=180s
kubectl -n healthcare-exchange port-forward svc/exchange-api 8080:8080
```

In another terminal:

```bash
bash scripts/smoke-test.sh
```

## What Gets Created

| Manifest | Purpose |
| --- | --- |
| `namespace.yaml` | Creates `healthcare-exchange` with regulated-data and restricted pod-security labels. |
| `rbac.yaml` | Service account, Role, and RoleBinding for least-privilege API ConfigMap reads. |
| `secrets.yaml` | Local demo database, JWT, and MinIO credentials. |
| `configmap.yaml` | API runtime config such as port, Redis URL, MinIO endpoint, and audit log path. |
| `postgres.yaml` | PostgreSQL StatefulSet and Service with local persistence, resource limits, and non-root security context. |
| `redis.yaml` | Redis Deployment and Service with resource limits and non-root security context. |
| `minio.yaml` | MinIO Deployment, Service, health probes, and local PersistentVolumeClaim. |
| `exchange-api.yaml` | API Service and two-replica Deployment with probes and Prometheus annotations. |
| `networkpolicy.yaml` | Default pod-to-pod policy with DNS egress. |
| `hpa.yaml` | CPU-based API autoscaling from 2 to 6 replicas. |

## Optional Governance With Terraform

Terraform in `terraform/local` can create local governance resources and optionally install `kube-prometheus-stack` through Helm.

```bash
cd terraform/local
terraform fmt -check
terraform init -backend=false
terraform validate
terraform plan -input=false
```

Set monitoring on explicitly if needed:

```bash
terraform apply -input=false -var='enable_monitoring=true'
```

## Cleanup

```bash
kubectl delete -k kubernetes/base
kind delete cluster --name hde
rm -rf build
```

The rendered manifest in `build/kubernetes-rendered.yaml` is generated output and should not be included in a submission.

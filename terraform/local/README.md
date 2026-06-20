# Local Terraform

This Terraform stack manages local Kubernetes governance objects for the National Healthcare Data Exchange demo. It uses the Kubernetes and Helm providers against the kubeconfig on the workstation or Jenkins agent and does not require AWS credentials.

## Commands

```bash
cd terraform/local
terraform fmt -check
terraform init -backend=false
terraform validate
terraform plan -input=false
```

Apply only against a disposable local cluster:

```bash
terraform apply -input=false
```

Use a specific local context when needed:

```bash
terraform plan -input=false -var='kube_context=kind-hde'
```

Monitoring is intentionally disabled by default because it pulls the Prometheus community Helm chart:

```bash
terraform apply -input=false -var='enable_monitoring=true'
```

provider "kubernetes" {
  config_path    = pathexpand(var.kubeconfig_path)
  config_context = var.kube_context == "" ? null : var.kube_context
}

provider "helm" {
  kubernetes {
    config_path    = pathexpand(var.kubeconfig_path)
    config_context = var.kube_context == "" ? null : var.kube_context
  }
}

resource "kubernetes_namespace" "exchange" {
  metadata {
    name = var.namespace
    labels = {
      "compliance.hde.local/data-classification" = "regulated"
      "pod-security.kubernetes.io/enforce"       = "restricted"
      "pod-security.kubernetes.io/audit"         = "restricted"
      "pod-security.kubernetes.io/warn"          = "restricted"
    }
  }
}

resource "kubernetes_config_map" "governance" {
  metadata {
    name      = "platform-governance"
    namespace = kubernetes_namespace.exchange.metadata[0].name
  }

  data = {
    owner                 = "national-health-agency"
    audit_logging         = "required"
    encryption_at_rest    = "required"
    pii_storage           = "local-demo-only"
    disaster_recovery_rpo = "15m-local-simulation"
    disaster_recovery_rto = "30m-local-simulation"
  }
}

resource "kubernetes_resource_quota_v1" "exchange" {
  metadata {
    name      = "exchange-local-quota"
    namespace = kubernetes_namespace.exchange.metadata[0].name
  }

  spec {
    hard = {
      pods                   = var.resource_quota.pods
      "requests.cpu"         = var.resource_quota.requests_cpu
      "requests.memory"      = var.resource_quota.requests_memory
      "limits.cpu"           = var.resource_quota.limits_cpu
      "limits.memory"        = var.resource_quota.limits_memory
      persistentvolumeclaims = var.resource_quota.persistent_volume_claims
    }
  }
}

resource "kubernetes_limit_range_v1" "exchange" {
  metadata {
    name      = "exchange-container-defaults"
    namespace = kubernetes_namespace.exchange.metadata[0].name
  }

  spec {
    limit {
      type = "Container"

      default = {
        cpu    = "500m"
        memory = "512Mi"
      }

      default_request = {
        cpu    = "100m"
        memory = "128Mi"
      }
    }
  }
}

resource "helm_release" "monitoring" {
  count            = var.enable_monitoring ? 1 : 0
  name             = "kube-prometheus-stack"
  repository       = "https://prometheus-community.github.io/helm-charts"
  chart            = "kube-prometheus-stack"
  namespace        = "monitoring"
  create_namespace = true
}

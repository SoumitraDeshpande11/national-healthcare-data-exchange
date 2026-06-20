output "namespace" {
  value = kubernetes_namespace.exchange.metadata[0].name
}

output "governance_config_map" {
  value = kubernetes_config_map.governance.metadata[0].name
}

output "resource_quota" {
  value = kubernetes_resource_quota_v1.exchange.metadata[0].name
}

variable "namespace" {
  type        = string
  description = "Local Kubernetes namespace for the healthcare exchange."
  default     = "healthcare-exchange"
}

variable "kubeconfig_path" {
  type        = string
  description = "Path to the kubeconfig used for the local Kubernetes cluster."
  default     = "~/.kube/config"
}

variable "kube_context" {
  type        = string
  description = "Optional kubeconfig context for Kind, Docker Desktop, Minikube, or another local cluster."
  default     = ""
}

variable "enable_monitoring" {
  type        = bool
  description = "Install kube-prometheus-stack through Helm when a local cluster is available."
  default     = false
}

variable "resource_quota" {
  type = object({
    pods                     = string
    requests_cpu             = string
    requests_memory          = string
    limits_cpu               = string
    limits_memory            = string
    persistent_volume_claims = string
  })
  description = "Namespace quota for local governance simulation."
  default = {
    pods                     = "20"
    requests_cpu             = "2"
    requests_memory          = "4Gi"
    limits_cpu               = "6"
    limits_memory            = "8Gi"
    persistent_volume_claims = "4"
  }
}

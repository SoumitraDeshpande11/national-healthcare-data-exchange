path "secret/data/hde/*" {
  capabilities = ["create", "read", "update", "delete", "list"]
}

path "secret/metadata/hde/*" {
  capabilities = ["list", "read"]
}

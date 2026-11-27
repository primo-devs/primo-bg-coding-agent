variable "account_id" {
  description = "Cloudflare account ID"
  type        = string
}

variable "worker_name" {
  description = "Name of the Worker script"
  type        = string
}

variable "worker_subdomain" {
  description = "Cloudflare account workers.dev subdomain (the part before .workers.dev), used to build worker_url"
  type        = string
}
<<<<<<< HEAD

variable "kv_namespaces" {
  description = "Map of KV namespace bindings keyed by binding name"
  type = map(object({
    namespace_id = string
  }))
  default = {}
}

variable "service_bindings" {
  description = "Map of service bindings keyed by binding name for worker-to-worker communication"
  type = map(object({
    service_name = string
  }))
  default = {}
}

variable "d1_databases" {
  description = "Map of D1 database bindings keyed by binding name"
  type = map(object({
    database_id = string
  }))
  default = {}
}

variable "r2_buckets" {
  description = "Map of R2 bucket bindings keyed by binding name"
  type = map(object({
    bucket_name = string
  }))
  default = {}
}

variable "queue_bindings" {
  description = "Map of Queue producer bindings keyed by binding name"
  type = map(object({
    queue_name = string
  }))
  default = {}
}

variable "plain_text_bindings" {
  description = "Map of plain text environment variable bindings keyed by binding name"
  type = map(object({
    value = string
  }))
  default = {}
}

variable "plain_text_binding_overrides" {
  description = <<-EOT
    Optional value overrides for named plain text bindings. Keys that match a
    name in plain_text_bindings replace its value; keys that match nothing are
    added as additional plain text bindings.
  EOT
  type        = map(string)
  default     = {}
}

variable "secrets" {
  description = "Map of secret bindings keyed by binding name"
  type = map(object({
    value = string
  }))
  default   = {}
  sensitive = true
}

variable "durable_objects" {
  description = "Map of Durable Object bindings keyed by binding name"
  type = map(object({
    class_name = string
  }))
  default = {}
}

variable "enable_durable_object_bindings" {
  description = "Enable DO bindings. Set false for initial deployment, true after first deployment succeeds."
  type        = bool
  default     = true
}

variable "enable_service_bindings" {
  description = "Enable service bindings. Set false if target workers don't exist yet."
  type        = bool
  default     = true
}

variable "migration_tag" {
  description = "Migration tag for Durable Objects (increment when adding new DO classes)"
  type        = string
  default     = "v1"
}

variable "migration_old_tag" {
  description = "Previous migration tag (for incremental DO migrations). Set when adding new DO classes to an existing worker."
  type        = string
  default     = null
}

variable "new_sqlite_classes" {
  description = "DO class names that are NEW in this migration step. Only these are declared as new_sqlite_classes in the migration (not all durable_objects). If empty, defaults to all durable_objects class names (for fresh deployments)."
  type        = list(string)
  default     = []
}

variable "deleted_classes" {
  description = "DO class names deleted in this migration step. Requires a new migration tag; surviving bindings remain enabled."
  type        = list(string)
  default     = []
}

variable "cron_triggers" {
  description = "List of cron expressions for the worker's scheduled() handler"
  type        = list(string)
  default     = []
}

variable "compatibility_date" {
  description = "Compatibility date for the worker"
  type        = string
  default     = "2024-01-01"
}

variable "compatibility_flags" {
  description = "Compatibility flags for the worker (e.g., ['nodejs_compat'])"
  type        = list(string)
  default     = []
}

variable "custom_domain" {
  description = "Custom domain hostname for the worker"
  type        = string
  default     = null
}

variable "route_pattern" {
  description = "Route pattern for zone-based routing (e.g., 'example.com/*')"
  type        = string
  default     = null
}
=======
>>>>>>> upstream/main

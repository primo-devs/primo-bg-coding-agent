<<<<<<< HEAD
# Cloudflare Worker Module (Native Terraform)
# Uses the recommended 3-resource pattern: cloudflare_worker + cloudflare_worker_version + cloudflare_workers_deployment

locals {
  # The provider takes every binding as one list; map iteration is key-ordered,
  # so the projection is stable across plans.
  bindings = concat(
    # KV namespace bindings
    [for binding_name, binding in var.kv_namespaces : {
      type         = "kv_namespace"
      name         = binding_name
      namespace_id = binding.namespace_id
    }],
    # Service bindings (only when enabled - disable if target workers don't exist yet)
    var.enable_service_bindings ? [for binding_name, binding in var.service_bindings : {
      type    = "service"
      name    = binding_name
      service = binding.service_name
    }] : [],
    # D1 database bindings
    [for binding_name, binding in var.d1_databases : {
      type = "d1"
      name = binding_name
      id   = binding.database_id
    }],
    # R2 bucket bindings
    [for binding_name, binding in var.r2_buckets : {
      type        = "r2_bucket"
      name        = binding_name
      bucket_name = binding.bucket_name
    }],
    # Queue producer bindings
    [for binding_name, binding in var.queue_bindings : {
      type       = "queue"
      name       = binding_name
      queue_name = binding.queue_name
    }],
    # Plain text bindings (environment variables)
    [for binding_name, binding in var.plain_text_bindings : {
      type = "plain_text"
      name = binding_name
      text = lookup(var.plain_text_binding_overrides, binding_name, binding.value)
    }],
    # Override entries with no matching binding above are added as new bindings,
    # so a caller can introduce a variable without editing the binding list.
    [for name, text in var.plain_text_binding_overrides : {
      type = "plain_text"
      name = name
      text = text
    } if !contains(keys(var.plain_text_bindings), name)],
    # Secret text bindings
    [for binding_name, binding in var.secrets : {
      type = "secret_text"
      name = binding_name
      text = binding.value
    }],
    # Durable Object bindings (disabled only for initial class creation)
    var.enable_durable_object_bindings ? [for binding_name, binding in var.durable_objects : {
      type       = "durable_object_namespace"
      name       = binding_name
      class_name = binding.class_name
    }] : []
  )
}

# =============================================================================
# 1. Create the Worker
# =============================================================================
=======
# Cloudflare Worker Module
#
# Terraform owns the Worker script itself (its name, workers.dev subdomain and
# observability settings) but no code. Versions, deployments, bindings, crons,
# queue consumers, Durable Object migrations and custom domains are uploaded
# by the Cloudflare deploy (scripts/cloudflare-deploy, run by the
# deploy-<environment> workflows), as Cloudflare recommends for Workers with
# Durable Objects:
# https://developers.cloudflare.com/workers/platform/infrastructure-as-code/#considerations-with-durable-objects
>>>>>>> upstream/main

resource "cloudflare_worker" "this" {
  account_id = var.account_id
  name       = var.worker_name

  # Enable workers.dev subdomain for direct access
  subdomain = {
    enabled = true
  }

  observability = {
    enabled            = true
    head_sampling_rate = 1
    logs = {
      enabled            = true
      head_sampling_rate = 1
      invocation_logs    = true
    }
  }

  lifecycle {
    # Every `wrangler deploy` re-applies workers_dev, preview_urls and
    # observability from the generated Wrangler config (which sets the same
    # values as above). Terraform sets them on create and then leaves them to
    # the deploy, so the two never fight over a nested computed attribute
    # such as subdomain.previews_enabled.
    ignore_changes = [subdomain, observability]
  }
}

# =============================================================================
# Resources handed to the Cloudflare deploy
# =============================================================================
# Earlier releases created these here. `destroy = false` forgets them from
# state without touching Cloudflare, so the running version, its deployment,
# cron schedules and custom domain stay live until the next `wrangler deploy`
# replaces them in place.

removed {
  from = cloudflare_worker_version.this

  lifecycle {
    destroy = false
  }
}

removed {
  from = cloudflare_workers_deployment.this

  lifecycle {
    destroy = false
  }
}

removed {
  from = cloudflare_workers_cron_trigger.this

  lifecycle {
    destroy = false
  }
}

removed {
  from = cloudflare_workers_custom_domain.this

  lifecycle {
    destroy = false
  }
}

removed {
  from = cloudflare_workers_route.this

  lifecycle {
    destroy = false
  }
}

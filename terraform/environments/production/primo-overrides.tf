# Primo-specific deployment overrides live here so upstream worker definitions
# can stay unchanged on the lines most likely to evolve upstream.

variable "slack_default_model" {
  description = "Default model for Slack-created coding sessions."
  type        = string
  default     = "openai/gpt-5.5"
}

variable "slack_classification_model" {
  description = "Model used by the Slack bot repository classifier."
  type        = string
  default     = "claude-haiku-4-5"
}

variable "slack_code_change_pr_instruction_enabled" {
  description = <<-EOT
    Ask Slack-created sessions to open a pull request when the request involved
    a code change. Off in upstream's defaults, so upstream's own tests exercise
    the unmodified prompt; enabled here for Primo.
  EOT
  type        = bool
  default     = true
}

locals {
  primo_slack_plain_text_binding_overrides = {
    DEFAULT_MODEL        = var.slack_default_model
    CLASSIFICATION_MODEL = var.slack_classification_model
    # No upstream binding by this name — added by the override mechanism.
    SLACK_CODE_CHANGE_PR_INSTRUCTION_ENABLED = var.slack_code_change_pr_instruction_enabled ? "true" : "false"
  }
}

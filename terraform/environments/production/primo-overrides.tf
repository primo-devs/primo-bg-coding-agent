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

locals {
  primo_slack_plain_text_binding_overrides = {
    DEFAULT_MODEL        = var.slack_default_model
    CLASSIFICATION_MODEL = var.slack_classification_model
  }
}

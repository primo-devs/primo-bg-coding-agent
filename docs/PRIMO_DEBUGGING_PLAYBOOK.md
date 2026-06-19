# Primo Debugging Playbook

A short guide for deciding where to investigate an issue before changing code.

## Diagnostic order

1. Reproduce the issue and record the error, session URL, and approximate time.
2. Review [Primo Settings](https://open-inspect-web-primo.primo-bf6.workers.dev/settings).
3. Review the configuration of the relevant integration: Slack, Linear, or GitHub.
4. If the issue occurs in a Worker or between services, review Cloudflare and its logs.
5. Change code only after confirming that settings, integrations, and infrastructure are correct.

Do not use a code change to compensate for a missing secret, an incorrect webhook, a disabled
repository, or a misconfigured setting.

## Where each configuration lives

### Primo Settings

[Primo Settings](https://open-inspect-web-primo.primo-bf6.workers.dev/settings) is the first place
to configure behavior without deploying code. It includes:

- global or repository secrets injected into new sandboxes;
- enabled models;
- sandbox configuration;
- Slack, Linear, and GitHub settings and overrides;
- MCP servers and pre-built images.

Secrets added here are for coding agent sessions. They do not configure Cloudflare Workers.

### GitHub Secrets, Terraform, and Cloudflare

Infrastructure secrets live in GitHub Actions. The Terraform workflow uses them during deployment to
configure the Cloudflare Workers.

This includes credentials for Slack, Linear, the GitHub App, Anthropic, Cloudflare, Modal, and
internal service communication.

Changing a GitHub secret does not update an existing Worker: Terraform must be deployed again. `gh`
can be used to manage secrets and workflows.

### External integrations

Configuration may also need to be reviewed in the external provider:

- Slack: events, interactivity, permissions, and bot channel membership;
- Linear: OAuth, webhooks, permissions, and agent configuration;
- GitHub: App installation, authorized repositories, webhooks, events, and permissions.

## When to review Cloudflare

Review Cloudflare when:

- Slack, Linear, or GitHub sends an event but Open-Inspect does not act;
- a Worker returns an error;
- an infrastructure binding or secret is missing or appears incorrect;
- a request must be traced between a bot and the control plane;
- a deployment completed but behavior did not change.

Wrangler can be used to inspect deployments, versions, bindings, live logs, and KV. To trace an
execution, look for `error_message`, `trace_id`, `session_id`, `message_id`, and `outcome`.

Cloudflare showing a secret name does not prove that its value is valid. Final verification must
reproduce the flow and inspect its logs.

## What to review by symptom

| Symptom                                                        | Review first                                          |
| -------------------------------------------------------------- | ----------------------------------------------------- |
| The agent is missing a credential                              | Settings > Secrets and the global/repository scope    |
| A model is not available                                       | Settings > Models                                     |
| An integration uses the wrong repository, model, or behavior   | Settings > Integrations                               |
| No event arrives                                               | Configuration in Slack, Linear, or GitHub             |
| The event arrives but fails before creating a session          | Worker, bindings, and GitHub secrets/Terraform        |
| The session exists but the sandbox fails                       | Control plane, Modal, Settings > Sandbox, and Secrets |
| Everything is configured correctly but behavior is still wrong | Code in the responsible package                       |

## When to change code

Change code only after confirming that:

- settings are correct;
- required secrets and bindings contain usable values;
- the webhook reached the appropriate Worker;
- the external integration has the correct permissions and configuration;
- logs show an implementation defect or an unhandled case.

The fix should include a reproduction or test, the smallest necessary change, and validation of the
complete flow after deployment.

## Example: Slack repository classifier

The classifier reported that it could not determine the repository. Cloudflare showed that the Slack
Worker received an empty `ANTHROPIC_API_KEY` because the secret was missing from GitHub Actions.

The solution was to add the GitHub secret and redeploy with Terraform. Changing code or Settings >
Secrets would not have helped because the failure occurred in the Worker before creating a sandbox.

## Closure criteria

An incident is resolved when the original flow is repeated, logs show no new errors, and the
expected session or action completes successfully.

## References

- [Debugging Playbook](./DEBUGGING_PLAYBOOK.md): events and correlation fields.
- [Secrets Management](./SECRETS.md): global and repository secrets.
- [Getting Started](./GETTING_STARTED.md): deployments and integrations.

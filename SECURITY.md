# Security Policy

## Scope

Rux is a client-side TypeScript HTTP library. It builds URLs, sends requests through `fetch`, serializes validated JSON bodies, and validates response payloads. It does not provide authentication, authorization, secret storage, TLS configuration, server-side access control, or API policy enforcement.

Security issues may affect request construction, validation boundaries, error handling, dependency or package contents, or accidental disclosure of sensitive data.

## Reporting a vulnerability

Do not open a public issue for an unpatched vulnerability. Use GitHub's private vulnerability reporting for this repository when available. If unavailable, contact the repository maintainer through a private channel listed in the repository profile.

Include:

- A short description and impact.
- Affected version, runtime, and environment.
- Minimal reproduction or proof of concept.
- Required configuration and dependencies.
- Suggested mitigation, if known.
- Whether the report is safe to disclose after a fix.

Remove secrets, tokens, credentials, personal data, and production endpoints from reports. Do not test systems without authorization.

## Response process

Maintainers will acknowledge reports when possible, reproduce the issue, assess severity and affected versions, coordinate a fix, and publish disclosure details after users have a reasonable mitigation path. Timelines depend on severity and maintainer availability.

## User security responsibilities

- Use HTTPS and validate server certificates through the runtime.
- Pass only intended credentials in request headers.
- Treat `RuxError.cause`, response data, validation issues, and raw HTTP error text as potentially sensitive.
- Do not log full requests or responses without redaction.
- Keep schemas and dependencies current.
- Do not treat client-side validation as server-side authorization.
- Configure caller abort and timeouts for untrusted or slow endpoints.

Rux merges headers from client, endpoint, and invocation layers. Invocation values override earlier values, including authorization headers. Review all layers before sending credentials.

Rux URL-encodes typed path parameters, but callers remain responsible for validating endpoint paths, query values, base URLs, and values placed in headers.

## Source-code limits

Implementation and tests describe current behavior. They cannot prove a complete threat model, safe deployment configuration, compatibility commitment, or maintainer intent. Treat undocumented security behavior as unknown; confirm it with maintainers before relying on it.

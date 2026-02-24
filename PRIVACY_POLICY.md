# Privacy Policy

Effective date: February 13, 2026

AJaaS ("Awesome Job as a Service", "we", "us", "our") provides an API and web interface for generating and scheduling positive messages.

This policy explains what information we process, why we process it, and what choices you have.

## 1. Information We Process

Depending on how AJaaS is configured and used, we may process:

- API request data: route parameters, query parameters (for example `name`, `from`, `tz`), request metadata, and response status.
- Authentication data: encrypted bearer tokens and token metadata (for example `sub`, `name`, `role`, `exp`, `jti`) used for access control.
- Scheduling data: recipient name, cron expression, timezone, endpoint selection, delivery method, and next-run metadata.
- Delivery data:
- Email delivery: recipient email, SMTP delivery status/error information.
- Webhook delivery: destination URL, request result metadata, and webhook signature metadata.
- Operational data: logs and diagnostics used for uptime, debugging, abuse prevention, and security monitoring.
- Optional analytics data: if Google Analytics is enabled (`VITE_GA_MEASUREMENT_ID`), browser/device interaction data may be collected by Google Analytics.

## 2. How We Use Information

We use information to:

- Provide and operate the API and scheduling features.
- Authenticate users and enforce role-based permissions.
- Deliver scheduled messages by email or webhook.
- Detect abuse, protect service integrity, and improve reliability.
- Measure usage trends (if analytics is enabled).

## 3. Security

AJaaS includes security controls in its architecture, including:

- AES-256-GCM token encryption.
- Optional encryption at rest for sensitive schedule fields (`recipientEmail`, `webhookUrl`, `webhookSecret`) when `DATA_ENCRYPTION_KEY` is configured.
- Role-based access controls (`schedule` and `read`).
- Token revocation support via `jti` blocklisting.

No system is perfectly secure. You are responsible for safeguarding your own credentials, tokens, and infrastructure.

## 4. Data Retention

Data is retained for as long as needed to operate the service and meet operational/security needs.

- Scheduled message records persist until deleted.
- Logs and diagnostics are retained according to deployment/operator practices.
- Revocation and auth metadata may be retained to enforce security controls.

Self-hosted operators are responsible for setting their own retention periods.

## 5. Data Sharing

We do not sell personal information.

Information may be shared only as needed to run AJaaS features, including:

- Infrastructure/service providers used to host or operate the service.
- Email providers (SMTP) and webhook destinations you configure.
- Analytics providers, if enabled by configuration.
- Legal/compliance disclosures when required by applicable law.

## 6. Your Choices and Rights

You can:

- Avoid providing optional fields where possible.
- Request deletion of scheduling data you control (or delete it directly in self-hosted environments).
- Disable optional features such as analytics and scheduling.

Depending on your location, you may have legal privacy rights (for example access, deletion, correction, and objection rights). To exercise rights for this deployment, contact the operator listed in Section 10.

## 7. International Processing

AJaaS may be hosted in different regions. By using the service, you understand data may be processed in locations where privacy laws may differ from your jurisdiction.

## 8. Children's Privacy

AJaaS is not directed to children under 13, and we do not knowingly collect personal information from children under 13.

## 9. Changes to This Policy

We may update this Privacy Policy from time to time. The "Effective date" above indicates the latest version.

## 10. Contact

For privacy questions about this AJaaS deployment, contact the service operator.

If no direct contact is provided, open an issue at:
https://github.com/ctf2009/ajaas/issues


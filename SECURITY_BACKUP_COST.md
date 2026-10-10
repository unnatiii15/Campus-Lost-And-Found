# Security, backup, monitoring, CI/CD and cost

## Security
- Enable MFA on root; never create root access keys.
- Use least-privilege IAM.
- Keep S3 Block Public Access enabled.
- Add Cognito + API Gateway JWT authorization before public deployment.
- Enforce record ownership in Lambda; never trust browser-supplied user IDs.
- Use short-lived presigned S3 URLs; validate MIME type and size.
- Use HTTPS and exact CORS origins.
- Never commit keys, tokens, real student data or private photos.

## Monitoring
Lambda logs go to CloudWatch Logs. Scaffold sets 14-day retention. Before final demo, add alarms for Lambda errors/throttles and review API 4xx/5xx metrics. Never log passwords or tokens.

## Backup/recovery
Scaffold enables DynamoDB point-in-time recovery and S3 versioning. Document restore steps and test with non-sensitive demo data. These features may incur charges.

## CI/CD
Included GitHub Actions workflow checks Python syntax and parses the SAM template. Automated deployment should use GitHub Actions with AWS IAM OIDC federation; do not store long-lived AWS access keys in GitHub. Keep deployment manual/protected until account and budget are confirmed.

## Cost
Costs depend on region, service usage, storage, logs, backups and account terms. Before deployment create an AWS Budget/billing alert, use one region and low request volume, choose DynamoDB on-demand for a small demo, set log retention, and delete unused resources after evaluation. Check AWS Pricing Calculator and your account's Free Tier/credits. Do not promise zero cost.

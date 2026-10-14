# Security, Backup, Monitoring, CI/CD and Cost

## Overview

Campus Lost-and-Found uses AWS serverless services for backend processing and cloud storage. This document describes the security practices, monitoring options, backup considerations, deployment workflow and cost controls relevant to the application.

Recommendations are distinguished from deployed configurations where their implementation has not yet been verified.

## 1. Security

### AWS Account Security

- Enable multi-factor authentication (MFA) on the AWS root account.
- Do not create or use root-account access keys for routine operations.
- Apply least-privilege IAM permissions to AWS resources.
- Avoid committing AWS credentials, API secrets, access tokens or other sensitive configuration to GitHub.

### Application and API Security

The application communicates with its backend through Amazon API Gateway and AWS Lambda.

Recommended security controls include:

- Configure CORS to allow only the required frontend origins.
- Validate incoming requests and reject invalid data.
- Use HTTPS for application and API communication.
- Introduce authentication through Amazon Cognito or an equivalent identity provider if user accounts are required.
- Configure an API Gateway authorizer and enforce appropriate record ownership and role checks in the backend.
- Never trust user identities or permissions supplied solely by the browser.

**Authentication status:** Cognito and JWT-based API authorization should be considered future improvements unless their deployment has been independently verified.

### Photograph Security

Amazon S3 stores photographs associated with item reports.

Recommended controls include:

- Keep the S3 bucket private and enable S3 Block Public Access where appropriate.
- Restrict bucket access through IAM permissions.
- Validate uploaded file types and sizes.
- Use short-lived pre-signed URLs where temporary access to private photographs is required.
- Avoid uploading private student photographs or sensitive personal information to public repositories.

The actual bucket permissions and photograph-access configuration should be reviewed in the AWS Console.

## 2. Monitoring and Logging

AWS CloudWatch provides monitoring and logging capabilities for the Lambda backend.

Recommended monitoring activities include:

- Review Lambda invocations, errors, duration and throttling.
- Inspect CloudWatch Logs when diagnosing failed requests.
- Review API Gateway request, error and latency metrics.
- Configure alarms for significant increases in Lambda errors or throttling.
- Establish appropriate log retention.
- Avoid logging credentials, access tokens or unnecessary personal information.

**Verification required:** Confirm the deployed Lambda log group, retention period and alarm configuration in CloudWatch. Configuration mentioned in a deployment template does not, by itself, prove that the same configuration is active in the deployed environment.

## 3. Backup and Recovery

The application stores item metadata in DynamoDB and photographs in S3.

Potential recovery measures include:

### DynamoDB

- Enable point-in-time recovery where appropriate.
- Consider on-demand backups for important milestones.
- Document the restoration procedure.
- Test restoration with non-sensitive demonstration data.

### Amazon S3

- Evaluate S3 Versioning to recover from accidental overwrites or deletions.
- Define retention and deletion policies for uploaded photographs.
- Review storage lifecycle policies if the volume of photographs increases.

Backup features should be verified in the live AWS configuration before being described as enabled. Backups, retained object versions and stored data may incur charges.

## 4. CI/CD and Version Control

GitHub is used to maintain the project's source code and version history.

The repository contains a GitHub Actions workflow at `.github/workflows/validate.yml`.

The workflow's actual validation steps and recent execution results should be checked in the GitHub Actions tab.

Recommended improvements include:

- Validate source code and infrastructure templates on pushes and pull requests.
- Review changes before merging.
- Protect important branches where appropriate.
- Use GitHub Actions with AWS IAM OpenID Connect (OIDC) federation if automated AWS deployment is introduced.
- Avoid storing long-lived AWS access keys in GitHub repository secrets.

AWS deployment should remain controlled until the deployment workflow, IAM permissions and budget have been reviewed.

## 5. Cost Management

The application uses GitHub Pages and AWS services including API Gateway, Lambda, DynamoDB and S3.

Actual costs depend on service usage, AWS Region, storage volume, logging, backup settings, account eligibility and applicable pricing.

Recommended cost controls:

1. Create an AWS Budget and configure billing alerts.
2. Monitor API Gateway requests and Lambda invocations.
3. Review DynamoDB capacity and select an appropriate billing mode for the workload.
4. Monitor S3 storage and data transfer.
5. Set reasonable CloudWatch log-retention periods.
6. Review backup and versioning costs.
7. Remove unused resources after project evaluation, after confirming that they are no longer required.

The application is configured for the Sydney AWS Region (`ap-southeast-2`).

Consult the AWS Pricing Calculator and the billing information in the AWS account for current estimates. Free Tier eligibility and credits depend on the account and applicable terms.

**Cost disclaimer:** No claim of zero operating cost is made. Actual charges must be checked against the deployed resources and account billing information.

## 6. Operational Checklist

Before public release or final evaluation, review the following:

- [ ] AWS root-account MFA is enabled.
- [ ] IAM permissions follow least-privilege principles.
- [ ] No credentials or secrets are committed to GitHub.
- [ ] S3 bucket permissions and public-access settings are reviewed.
- [ ] API CORS and request validation are reviewed.
- [ ] Authentication and authorization requirements are assessed.
- [ ] CloudWatch logs, retention and alarms are reviewed.
- [ ] DynamoDB backup and recovery settings are verified.
- [ ] S3 versioning and photo-retention requirements are assessed.
- [ ] GitHub Actions validation results are reviewed.
- [ ] AWS Budget and billing alerts are configured.
- [ ] Unused resources are identified before cleanup.

## Conclusion

Security, monitoring, backup, deployment and cost management are important parts of operating a cloud-based application.

This document provides a checklist for the Campus Lost-and-Found Portal and identifies controls that should be verified or implemented as the project evolves. Deployed settings should be confirmed in the relevant AWS or GitHub consoles before they are reported as active.

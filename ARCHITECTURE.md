# Architecture

Browser frontend → API Gateway HTTP API → Python Lambda → DynamoDB and S3.

- **Frontend:** static HTML/CSS/JS; eventual cloud hosting can use S3 + optional CloudFront.
- **API Gateway:** HTTP routes to Lambda.
- **Lambda:** validates requests and implements item operations.
- **DynamoDB:** item metadata/status; `item_id` is the key.
- **S3:** private image objects; DynamoDB should store an object key, not image bytes.
- **Cognito (required before public release):** application authentication; add API Gateway JWT authorizer and enforce record ownership in backend.
- **IAM:** least-privilege role for only required table/bucket actions.
- **CloudWatch:** Lambda logs/metrics; create alarms for errors/throttles.
- **GitHub Actions:** validates code/template on pushes and PRs. Deployment automation can be added via OIDC after account setup.

Lifecycle: LOST → FOUND → RETURNED is a status transition, not automatic deletion. Returned items disappear from active search; deletion should follow an explicit retention/privacy policy.

Limitations to address before public deployment:
1. Add Cognito + API Gateway JWT authorizer and ownership/role checks.
2. Add upload size validation and private pre-signed GET URLs.
3. Add pagination and DynamoDB indexes for efficient searches; current scan is prototype-scale only.
4. Set exact CORS origin, HTTPS hosting, rate limits and billing alarms.

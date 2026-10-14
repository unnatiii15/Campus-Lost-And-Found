# Architecture

## Overview

Campus Lost-and-Found is a cloud-based web application that allows users to report lost and found items, browse reports, upload photographs, and update an item's status.

The deployed application uses a static frontend hosted on GitHub Pages, an Amazon API Gateway HTTP API, AWS Lambda for backend processing, Amazon DynamoDB for item metadata, and Amazon S3 for photograph storage.

## System Architecture

```text
                    User's Browser
                          |
                          v
                  GitHub Pages Frontend
                   HTML / CSS / JavaScript
                          |
                          v
                 Amazon API Gateway
                      HTTP API
                          |
                          v
                     AWS Lambda
                    Python Backend
                     /          \
                    v            v
             Amazon DynamoDB   Amazon S3
             Item Metadata    Item Photos
```

## Components

### 1. Frontend

**Technology:** HTML, CSS and JavaScript  
**Hosting:** GitHub Pages

The frontend provides the user interface for submitting lost and found reports, viewing existing items, searching and filtering reports, uploading photographs, reviewing potential matches, and updating item status.

The root-level `index.html`, `styles.css`, and `app.js` files form the deployed frontend.

The frontend communicates with the backend through the configured API Gateway endpoint.

### 2. Amazon API Gateway

**Type:** HTTP API

API Gateway exposes HTTP endpoints through which the frontend communicates with the backend.

Requests are routed to the configured Lambda integration. The application uses GET, POST and PUT operations for retrieving, creating and updating item records, respectively. OPTIONS handling may be required for browser CORS preflight requests.

The API's configured routes, authorization and CORS policies should be verified against the deployed configuration.

### 3. AWS Lambda

**Runtime:** Python 3.12  
**Function:** `campus-lost-found-api`

Lambda executes the Python backend logic and handles application requests.

Its responsibilities include:

- Processing incoming HTTP requests.
- Validating request data.
- Creating and retrieving item records.
- Updating an item's status to RETURNED.
- Interacting with DynamoDB.
- Handling photograph-related operations involving S3.

The Lambda function uses its configured execution role to access the AWS resources required by the application.

### 4. Amazon DynamoDB

**Table:** `CampusLostFoundItems`

DynamoDB provides persistent storage for item reports.

The `item_id` field is used as the table's primary key. Item records contain report information such as item details and status, together with photograph metadata where applicable.

Unlike browser `localStorage`, DynamoDB allows application data to persist independently of an individual user's browser.

### 5. Amazon S3

Amazon S3 stores photographs associated with item reports.

Photographs are stored as S3 objects, while the corresponding DynamoDB records should store the relevant object key rather than the image bytes themselves.

The bucket is intended to remain private, with photograph access managed through the backend's configured permissions and URL-generation mechanism.

### 6. GitHub and GitHub Actions

GitHub hosts the source code and supports version control.

The `.github/workflows/validate.yml` workflow is included in the repository for code and template validation. Its actual checks and execution status should be verified in the GitHub Actions tab.

Automated AWS deployment can be added separately if required.

## Item Lifecycle

The application uses item status to represent the recovery process:

```text
LOST / FOUND → RETURNED
```

An item marked RETURNED is considered recovered. Its record remains stored unless a separate deletion or retention process is implemented.

Returned items can be excluded from active lost-and-found searches while remaining available in persistent storage.

## Security and Access Control

The application should follow these security principles:

- Keep AWS credentials and secret configuration out of frontend code and the public repository.
- Use an IAM execution role with only the permissions required by Lambda.
- Keep the S3 bucket private and grant access only as required.
- Validate and constrain user-submitted data.
- Configure CORS for the intended frontend origin.
- Use authentication and authorization before exposing sensitive operations publicly.
- Apply suitable request limits and monitoring.

**Authentication status:** Amazon Cognito and an API Gateway JWT authorizer are potential future enhancements unless they have been separately configured and verified.

**Record ownership:** Backend authorization should prevent users from modifying records they are not permitted to manage.

## Monitoring and Reliability

AWS CloudWatch can be used to inspect Lambda logs, invocations, errors and throttling.

Recommended operational improvements include:

- Alarms for backend errors and throttling.
- Billing alerts and cost monitoring.
- Appropriate DynamoDB backup and recovery configuration.
- Defined data-retention and deletion policies.
- Request pagination and more efficient database access patterns as usage grows.

These controls should be treated as recommendations until their deployment has been confirmed.

## Current Limitations and Future Improvements

1. **Authentication:** Add Cognito authentication and API Gateway authorization if user accounts and protected operations are required.
2. **Authorization:** Enforce appropriate record ownership and role checks in the backend.
3. **Photo handling:** Validate upload sizes and file types; verify that private photographs are served through appropriately restricted access.
4. **Scalability:** Introduce pagination and suitable DynamoDB indexes for efficient searching as the dataset grows.
5. **API security:** Verify CORS configuration, HTTPS access, request validation and rate limits.
6. **Operations:** Configure CloudWatch alarms, billing alerts and suitable backup and recovery policies.
7. **Deployment:** Consider a controlled automated deployment workflow after validating the existing GitHub Actions setup.

## Summary

Campus Lost-and-Found demonstrates the integration of a browser-based frontend with AWS serverless services. GitHub Pages hosts the interface, API Gateway exposes backend endpoints, Lambda processes requests, DynamoDB persists item metadata, and S3 stores photographs.

The architecture separates the frontend from backend processing and cloud storage, providing a foundation that can be extended with stronger access controls, monitoring and scalability improvements.

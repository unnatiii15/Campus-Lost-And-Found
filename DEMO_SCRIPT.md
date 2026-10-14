# Campus Lost-and-Found Portal — 3-Minute Demo

## Objective

Demonstrate the deployed Campus Lost-and-Found Portal and explain how its frontend integrates with AWS services for persistent data storage and photograph handling.

**Live Application:** https://unnatiii15.github.io/Campus-Lost-And-Found/

## 1. Introduction (0:00–0:25)

Open the live application.

Explain:

"Campus Lost-and-Found is a cloud-based web application designed to help students report lost belongings, discover found items, and track item recovery. The frontend is hosted on GitHub Pages, and the backend uses AWS serverless services."

## 2. Create a Lost-Item Report (0:25–0:55)

Create a sample LOST report using these details:

- **Item:** Black wallet
- **Category:** Accessories
- **Description:** Black zip wallet with a silver key ring
- **Location:** Library
- **Photograph:** Upload a suitable sample image

Explain that the application sends the report to its backend API for processing and storage.

## 3. Demonstrate Cloud Persistence and Search (0:55–1:25)

After submitting the report:

1. Confirm that the new report appears on the website.
2. Refresh the page and check whether the report remains available.
3. Search for `wallet`.
4. Demonstrate the available status filters.

Explain that the application retrieves report information through the backend rather than relying solely on browser-local storage.

## 4. Demonstrate a Found Report and Matching (1:25–1:55)

Create a similar FOUND report for the wallet, using a matching description and an appropriate sample photograph.

Demonstrate the application's potential matching functionality, if a match is displayed.

Explain that descriptions and photographs can help users identify potentially corresponding lost and found items.

## 5. Demonstrate the Returned Status (1:55–2:20)

Use the returned-status functionality on a suitable test report.

Refresh the website and verify that the updated status persists.

Explain:

"When an item is recovered, its status can be updated to RETURNED. This represents a recovery status change rather than automatic deletion of the stored record."

## 6. Explain the Cloud Architecture (2:20–2:50)

Describe the system flow:

```text
GitHub Pages
     |
     v
Amazon API Gateway
     |
     v
AWS Lambda (Python)
     |
     +------> Amazon DynamoDB
     |         Item metadata
     |
     +------> Amazon S3
               Photograph storage
```

Explain the responsibilities of each component:

- **GitHub Pages:** Hosts the frontend.
- **Amazon API Gateway:** Exposes the HTTP API.
- **AWS Lambda:** Processes application requests.
- **Amazon DynamoDB:** Stores item report information.
- **Amazon S3:** Stores uploaded photographs.

## 7. Conclusion (2:50–3:00)

Conclude:

"This project demonstrates how a practical campus problem can be addressed using web technologies and serverless cloud computing. The application combines a browser-based interface with persistent cloud storage and a backend that can be extended with stronger authentication, authorization, monitoring, and scalability controls."

## Before the Demonstration

- Confirm that the live website loads.
- Use sample reports rather than real personal information.
- Verify that report creation and photo uploads work.
- Confirm that search and filtering work.
- Test the returned-status update and refresh the page.
- Keep the architecture diagram ready to explain the AWS integration.

**Important:** Demonstrate only features that work during the rehearsal. If any operation fails, explain its current status honestly rather than presenting it as verified.

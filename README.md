# Campus Lost-and-Found Portal — PBL starter

## Run the working browser demo
Unzip, then open `frontend/index.html` in Chrome/Edge. Add LOST/FOUND reports, attach a small image, search, and mark an item RETURNED. Data stays in this browser's localStorage; this is not cloud storage.

## AWS plan
The `template.yaml` + `backend/handler.py` are a serverless AWS SAM scaffold: API Gateway → Python Lambda → DynamoDB/private S3. It enables DynamoDB point-in-time recovery, S3 versioning, public-access blocking, encryption and finite log retention.

**Do not publicly expose the API scaffold yet.** Add Cognito authentication, API Gateway JWT authorizer and backend record-ownership checks before public deployment. The frontend currently demonstrates the workflow locally; cloud deployment is not complete.

## GitHub
Create a repository `campus-lost-and-found-pbl`, then run:
```bash
git init
git add .
git commit -m "Initial campus lost and found prototype"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/campus-lost-and-found-pbl.git
git push -u origin main
```
Never commit AWS credentials, tokens, private images or real personal data.

## Demo
1. Add a LOST item with a sample image.
2. Add a FOUND item.
3. Search by name/location.
4. Mark an item RETURNED; it leaves active search but the record/photo are not automatically deleted.
5. Explain that localStorage will be replaced by DynamoDB/S3 in the AWS deployment.

## Before AWS deployment
Create an AWS account, enable root MFA, create billing alerts/budget, use one region, install AWS CLI + SAM CLI, and deploy only after authentication and authorization are configured. AWS charges depend on region, usage, account terms and services; do not promise zero cost.

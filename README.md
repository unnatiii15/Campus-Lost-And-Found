# 🎓 Campus Lost-and-Found Portal

A cloud-based Lost-and-Found web application designed to help students report, search for, and recover lost belongings on campus. The application uses AWS services to store reports and manage uploaded photographs.

## 🌐 Live Application

**[Open Campus Lost-and-Found Portal](https://unnatiii15.github.io/Campus-Lost-And-Found/)**

## 🎥 Project Demonstration

Watch the complete demonstration of the application, including report creation, image uploads, searching, matching, and updating an item's status.

**Demo Video:** [Watch the Campus Lost-and-Found Demo](PASTE_YOUR_DEMO_VIDEO_LINK_HERE)

> Replace the link above with the direct GitHub URL of your uploaded 43 MB video.

## 📌 Project Overview

Campus Lost-and-Found Portal provides a centralized platform for students to report lost belongings and list items they have found on campus. It helps users discover potentially matching reports and track the recovery of items.

The project combines a web-based frontend with AWS cloud services to provide persistent storage and backend functionality.

## ✨ Key Features

- **Lost and Found Reporting:** Submit reports for items that have been lost or found.
- **Image Uploads:** Attach photographs to reports to help identify belongings.
- **Cloud-Based Storage:** Store item reports in Amazon DynamoDB.
- **AWS Backend:** Process application requests using AWS Lambda and API Gateway.
- **Search and Filtering:** Browse reports and filter them by item status.
- **Potential Match Discovery:** Identify potentially matching lost and found reports using available item details and photographs.
- **Returned Status:** Mark an item as returned after it has been recovered.
- **Responsive Interface:** Access the application through a web browser.

## 🏗️ System Architecture

The application follows a serverless cloud architecture.

```text
                    Student / User
                          |
                          v
                 GitHub Pages Frontend
                  HTML, CSS and JavaScript
                          |
                          v
                    Amazon API Gateway
                          |
                          v
                     AWS Lambda
                    Python Backend
                     /          \
                    v            v
          Amazon DynamoDB     Amazon S3
          Item Reports       Photo Storage
```

### How It Works

1. Users access the website hosted through GitHub Pages.
2. The frontend sends requests to the backend through Amazon API Gateway.
3. AWS Lambda processes requests for creating, retrieving, and updating reports.
4. Amazon DynamoDB stores item report information.
5. Amazon S3 stores uploaded photographs.
6. The frontend displays the retrieved reports and available matching information.

## 🛠️ Technology Stack

| Component | Technology |
|---|---|
| Frontend | HTML, CSS, JavaScript |
| Frontend Hosting | GitHub Pages |
| API Management | Amazon API Gateway |
| Backend | AWS Lambda |
| Backend Language | Python |
| Database | Amazon DynamoDB |
| Image Storage | Amazon S3 |
| Cloud Region | Asia Pacific (Sydney), `ap-southeast-2` |
| Version Control | Git and GitHub |

## 📂 Repository Structure

```text
Campus-Lost-And-Found/
│
├── index.html
├── styles.css
├── app.js
├── README.md
│
├── frontend/
│   └── Local prototype files
│
├── backend/
│   └── handler.py
│
├── handler.py
├── template.yaml
├── docs/
└── .github/
```

**Note:** The root-level `index.html`, `styles.css`, and `app.js` files are used by the deployed GitHub Pages website. The `frontend/` directory contains separate prototype files.

## 🚀 Using the Application

1. Open the [live application](https://unnatiii15.github.io/Campus-Lost-And-Found/).
2. Submit a report for an item that has been lost or found.
3. Enter the relevant item details and upload a photograph if available.
4. Browse the reports displayed on the website.
5. Use the search and filtering features to find relevant items.
6. Review potential matches between lost and found reports.
7. When an item has been recovered, use the returned-status functionality where available.

## ☁️ AWS Implementation

The deployed application uses AWS services to support cloud-based functionality.

### Amazon API Gateway
Provides the HTTP API endpoint through which the frontend communicates with the backend.

### AWS Lambda
Runs the Python backend code to handle application requests and interact with AWS services.

### Amazon DynamoDB
Stores item records, including relevant descriptions and report status.

### Amazon S3
Stores photographs uploaded with item reports. Photo access is handled through the application's backend configuration.

## 🔐 Security Considerations

- AWS credentials should not be embedded in frontend JavaScript or committed to the repository.
- Uploaded photographs should be accessed according to the configured S3 permissions.
- Sensitive configuration values should be managed securely.
- API permissions and input validation should be reviewed before production use.
- Public repository files should not contain credentials, access keys, or other secrets.

## 🧪 Testing Checklist

The following checks can be used to validate the deployed application:

- [ ] Website loads successfully.
- [ ] Lost-item reports can be submitted.
- [ ] Found-item reports can be submitted.
- [ ] Reports are retrieved from the cloud backend.
- [ ] Uploaded photographs display correctly.
- [ ] Search and status filters work as expected.
- [ ] Potential matches are displayed where applicable.
- [ ] Returned-status updates work through the live website.
- [ ] The demonstration video is accessible.

## 🎯 Project Objectives

- Digitize the campus Lost-and-Found process.
- Make it easier to report and discover misplaced belongings.
- Use cloud services for persistent data storage and backend processing.
- Improve item identification through photographs and potential matching.
- Demonstrate the practical application of serverless cloud computing.

## 🔮 Future Enhancements

- Student authentication and role-based access.
- Email or in-app notifications for potential matches.
- Improved image similarity and text-based matching.
- Item recovery verification.
- Administrative dashboard and report analytics.
- Enhanced monitoring, validation, and access controls.

## 👩‍💻 Project Information

**Project:** Campus Lost-and-Found Portal  
**Category:** Cloud Computing / Web Application  
**Repository:** [Campus-Lost-And-Found on GitHub](https://github.com/unnatiii15/Campus-Lost-And-Found)  
**Live Website:** [Campus Lost-and-Found Portal](https://unnatiii15.github.io/Campus-Lost-And-Found/)

---

*Developed as a project to demonstrate the integration of web technologies and AWS cloud services for a practical campus use case.*

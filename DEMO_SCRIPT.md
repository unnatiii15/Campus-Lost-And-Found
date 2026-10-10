# 3-minute demo

1. Open `frontend/index.html`.
2. Explain `LOCAL DEMO`: browser localStorage only, not cloud storage.
3. Add LOST item: Black wallet; Accessories; black zip wallet with silver key ring; Library; today's date; small harmless sample photo.
4. Add a similar FOUND report.
5. Search `wallet`.
6. Open a report and mark returned; it disappears from active results but remains in the local record list/count.
7. Explain intended AWS flow: API Gateway → Lambda → DynamoDB; photo → private S3.
8. Clearly distinguish local demo from deployed cloud version.

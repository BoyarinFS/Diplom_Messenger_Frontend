# API URL Fix

## Changes Made

- Updated API_BASE_URL in src/shared/api/api.ts from 'http://localhost:80/back-yoptagramm-service/api/v1' to 'http://localhost:8080/api/v1'
- Updated API_BASE_URL in lib/api.ts from 'http://localhost:80/back-yoptagramm-service/api/v1' to 'http://localhost:8080/api/v1'
- Fixed TypeScript errors in lib/api.ts:
  - Changed headers type from HeadersInit to Record<string, string>
  - Fixed sendReply method to use data.repliedMessageId instead of data.replyMessageId

## Issue Resolved

The "Request failed" error in chat-list.tsx was due to incorrect API_BASE_URL pointing to port 80 instead of 8080 where the backend runs.

## Next Steps

- Test the chat loading functionality to ensure it works.
- If issues persist, check if backend is running on localhost:8080.

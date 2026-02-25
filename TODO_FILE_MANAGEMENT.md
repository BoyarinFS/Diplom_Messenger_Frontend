# File Management Implementation TODO

## ✅ Phase 1: Types and API
- [x] Add file-related types to `src/shared/types/types.ts`
- [x] Extend API Client with file methods in `src/shared/api/api.ts`

## ✅ Phase 2: File Entity
- [x] Create `src/entities/file/index.ts`
- [x] Create `src/entities/file/types.ts`
- [x] Create `src/entities/file/utils.ts`

## ✅ Phase 3: File Upload Service
- [x] Create `src/shared/lib/file-upload.ts` for MinIO direct upload

## ✅ Phase 4: File Feature
- [x] Create `src/features/file/index.ts`
- [x] Create `src/features/file/hooks/useFileUpload.ts`
- [x] Create `src/features/file/hooks/useFileAttachments.ts`
- [x] Create `src/features/file/components/file-upload.tsx`
- [x] Create `src/features/file/components/file-preview.tsx`
- [x] Create `src/features/file/components/file-list.tsx`

## ✅ Phase 5: Chat Integration
- [x] Update `Message` type with `attachments` field
- [x] Update API methods to support `fileIds` parameter
- [x] Integrate file upload into `chat-window.tsx`
- [x] Add file picker button (Paperclip icon)
- [x] Display attached files in message input
- [x] Display file attachments in messages
- [x] Support multiple file uploads
- [x] Remove attached files before sending

## 🚀 Ready to Use

### Features:
1. **File Upload Button** - Click paperclip icon to select files
2. **Multiple Files** - Select multiple files at once
3. **Preview** - See attached files before sending
4. **Remove** - Click X to remove file before sending
5. **Display** - Files shown in messages with preview
6. **Click to Open** - Click file to open in new tab

### Supported File Types:
- Images: `image/*`
- Videos: `video/*`
- Audio: `audio/*`
- Documents: `.pdf`, `.doc`, `.docx`, `.txt`

### Max File Size: 100MB

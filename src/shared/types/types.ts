export type AccountStatus =
  | 'PENDING_VERIFICATION'
  | 'ACTIVE'
  | 'BLOCKED'
  | 'SUSPENDED';

export interface AuthRequest {
  login: string;
  password: string;
}


export interface RegistrationRequest {
  username: string;
  password: string;
  email: string;
  firstname: string;
  lastname: string;
}

export interface AuthResponse {
  token: string;
  email: string;
  account: {
    uuid: string;
    username: string;
    firstname: string;
    lastname: string;
    about?: string;
    birthday?: string;
  };
  status: AccountStatus;
}



export interface Account {
  uuid: string;
  username: string;
  email: string;
  firstname: string;
  lastname: string;
  bio?: string;
  profilePicture?: string;
  createdAt: string;
  status: AccountStatus;
}


export interface ChatShortcut {
  uuid: string;
  name: string;
  description?: string;
  isPublic: boolean;
  isDm: boolean;
  lastMessage?: string;
  time: string;
  unreadCount?: number;
}

export interface ChatFull {
  uuid: string;
  name: string;
  description?: string;
  adminId: string;
  isPublic: boolean;
  isDm: boolean;
  createdAt: string;
  members: ChatMember[];
  roles?: ChatCustomRole[];
}

export interface ChatMember {
  uuid: string;
  username: string;
  firstname: string;
  lastname: string;
  profilePicture?: string;
  roleId: string;
  roleName: string;
}

export interface ChatCustomRole {
  uuid: string;
  name: string;
  chatId: string;
  isDefault: boolean;
  permissions: ChatPermission[];
}

export interface ChatPermission {
  uuid: string;
  name: string;
  description: string;
}

export interface Message {
  uuid: string;
  text: string;
  createdAt: string;
  updatedAt?: string;
  author: Account;
  chatId: string;
  messageType: 'regular' | 'reply' | 'thread_root' | 'thread_message';
  parentMessageId?: string;
  threadRootMessageId?: string;
  threadMessagesCount?: number;
}

export interface CreateMessageRequest {
  content: string;
}

export interface CreateReplyRequest {
  content: string;
  repliedMessageId: string;
}

export interface CreateThreadRequest {
  content: string;
  threadRootMessageId: string;
}

export interface CreateChatRequest {
  name: string;
  description?: string;
  adminId: string;
  membersIds: string[];
  public: boolean;
}

export interface UpdateChatRequest {
  name?: string;
  description?: string;
  isPublic?: boolean;
  adminId?: string;
}

export interface CreateDmRequest {
  authorUsername: string;
  receiverUsername: string;
}

export interface CreateDmResponse {
  chat: ChatFull;
  receiverKeys: ReceiverKeys;
}

export interface GetDmKeysResponse {
  chat: ChatFull;
  receiverKeys: ReceiverKeys;
}

export interface UpdateAccountRequest {

  firstname?: string;
  lastname?: string;
  bio?: string;
}

export interface VerifyEmailRequest {
  code: string;
}

export interface ResendVerificationRequest {
  email: string;
}

// Encryption Types

export interface ReceiverKeys {
  identityPublicKey: string;
  signedPreKeyPublic: string;
  signedPreKeySignature: string;
  oneTimePreKey?: string;
}

// File Management Types


export type AttachmentType = 'MESSAGE' | 'PROFILE' | 'CHAT';

export interface FileMetadata {
  uuid: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  width?: number;
  height?: number;
  duration?: number;
  url: string;
  thumbnailUrl?: string;
  blurHash?: string;
  uploaderId: string;
  uploaderUsername: string;
  createdAt: string;
}

export interface UploadUrlRequest {
  fileName: string;
  contentType: string;
  fileSize: number;
  chatId?: string | null;
}

export interface UploadUrlResponse {
  url: string;
  objectKey: string;
  publicUrl: string;
}

export interface ConfirmUploadRequest {
  objectKey: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  width?: number;
  height?: number;
  duration?: number;
  thumbnailKey?: string;
  blurHash?: string;
  attachableType?: AttachmentType;
  attachableId?: string;
}

export interface FileAttachment {
  fileId: string;
  type: AttachmentType;
  entityId: string;
}

export interface DownloadUrlResponse {
  url: string;
}

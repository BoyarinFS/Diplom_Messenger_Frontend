export interface AuthRequest {
  login: string
  password: string
}

export interface RegistrationRequest {
  username: string
  password: string
  email: string
  firstName: string
  lastName: string
}

export interface AuthResponse {
  token: string
  account: Account
}

export interface Account {
  uuid: string
  username: string
  email: string
  firstName: string
  lastName: string
  bio?: string
  profilePicture?: string
  createdAt: string
}

export interface ChatShortcut {
  uuid: string
  name: string
  description?: string
  isPublic: boolean
  isDm: boolean
  lastMessage?: string
  time: string
  unreadCount?: number
}

export interface ChatFull {
  uuid: string
  name: string
  description?: string
  adminId: string
  isPublic: boolean
  isDm: boolean
  createdAt: string
  members: ChatMember[]
  roles?: ChatCustomRole[]
}

export interface ChatMember {
  uuid: string
  username: string
  firstName: string
  lastName: string
  profilePicture?: string
  roleId: string
  roleName: string
}

export interface ChatCustomRole {
  uuid: string
  name: string
  chatId: string
  isDefault: boolean
  permissions: ChatPermission[]
}

export interface ChatPermission {
  uuid: string
  name: string
  description: string
}

export interface Message {
  uuid: string
  text: string
  createdAt: string
  updatedAt?: string
  author: Account
  chatId: string
  messageType: "regular" | "reply" | "thread_root" | "thread_message"
  parentMessageId?: string
  threadRootMessageId?: string
  threadMessagesCount?: number
}

export interface CreateMessageRequest {
  content: string
}

export interface CreateReplyRequest {
  content: string
  repliedMessageId: string
}

export interface CreateThreadRequest {
  content: string
  threadRootMessageId: string
}

export interface CreateChatRequest {
  name: string
  description?: string
  isPublic: boolean
  memberIds: string[]
}

export interface UpdateChatRequest {
  name?: string
  description?: string
  isPublic?: boolean
  adminId?: string
}

export interface CreateDmRequest {
  authorUsername: string
  recipientId: string
}

export interface UpdateAccountRequest {
  firstName?: string
  lastName?: string
  bio?: string
}

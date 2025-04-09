# Secure Messaging API

A production-ready, fast, and secure messaging API similar to WhatsApp with advanced features including group chats, communities, channels, and status updates.

## Features

### Core Features
- User registration with unique IDs
- Secure message sending (text, image, video, document, link)
- Fast chat history retrieval
- Message delivery status tracking
- Typing indicators

### Group Chat
- Create and manage groups
- Group messaging with E2E encryption
- Admin controls and member management
- Message reactions and replies

### Communities and Channels
- Create communities with multiple channels
- Public and private channels
- Channel moderation
- Pinned messages

### Status Updates
- WhatsApp-style status updates with text, images, and videos
- Control visibility (all, contacts, specific users)
- View status viewers
- Auto-expiry after 24 hours (configurable)

### Media Support
- Secure file uploads with validation
- Media serving with thumbnails
- Security scanning for malicious content

### Security
- End-to-end encryption (AES-256 + RSA)
- Message hashing for tamper detection
- Rate limiting and spam protection

### Advanced Features
- Message timestamps (sent, delivered, seen)
- Message replies, reactions, and deletion
- Redis caching for performance
- File scanning & sanitization

### Analytics & Control
- Message statistics
- User blocking and muting
- Activity tracking

## Tech Stack

- Node.js & Express
- MongoDB for persistent storage
- Redis for caching and real-time features
- Socket.io for real-time communication
- Crypto for end-to-end encryption

## API Endpoints

### User Management
- `POST /api/users/register` - Register a new user
- `POST /api/users/block` - Block a user
- `POST /api/users/unblock` - Unblock a user
- `POST /api/users/mute` - Mute a user

### Direct Messaging
- `POST /api/messages/send` - Send a message
- `GET /api/messages/:userId/:recipientId` - Get chat history
- `POST /api/messages/typing` - Send typing indicator
- `POST /api/messages/reply` - Reply to a message
- `POST /api/messages/react` - React to a message
- `POST /api/messages/delete` - Delete a message
- `POST /api/messages/schedule` - Schedule a message

### Group Management
- `POST /api/groups/create` - Create a new group
- `GET /api/groups/:groupId` - Get group details
- `POST /api/groups/members/add` - Add members to a group
- `POST /api/groups/members/remove` - Remove a member from a group
- `POST /api/groups/settings` - Update group settings
- `POST /api/groups/members/role` - Change a member's role
- `GET /api/groups/user/:userId` - Get user's groups
- `POST /api/groups/delete` - Delete a group

### Group Messaging
- `POST /api/group-messages/send` - Send a message to a group
- `GET /api/group-messages/:groupId` - Get group messages
- `POST /api/group-messages/react` - React to a group message
- `POST /api/group-messages/delete` - Delete a group message
- `POST /api/group-messages/status` - Update message status

### Communities
- `POST /api/communities/create` - Create a new community
- `GET /api/communities/:communityId` - Get community details
- `POST /api/communities/join` - Join a community
- `POST /api/communities/leave` - Leave a community
- `POST /api/communities/channel/create` - Create a channel
- `GET /api/communities/:communityId/channels` - Get community channels
- `GET /api/communities/user/:userId` - Get user's communities

### Channel Messaging
- `POST /api/channel-messages/send` - Send a message to a channel
- `GET /api/channel-messages/:channelId` - Get channel messages
- `POST /api/channel-messages/pin` - Pin a channel message
- `GET /api/channel-messages/:channelId/pinned` - Get pinned messages

### Status Updates
- `POST /api/statuses/create` - Create a status update
- `GET /api/statuses/user/:userId` - Get user's statuses
- `GET /api/statuses/:statusId` - Get status details
- `POST /api/statuses/delete` - Delete a status
- `GET /api/statuses/:statusId/viewers` - Get status viewers

### Media
- `POST /api/media/upload` - Upload media file
- `GET /api/media/:fileId` - Get media file

### Status
- `POST /api/status` - Update message status
- `GET /api/status/:messageId` - Get message status

### Analytics
- `GET /api/analytics/user/:userId` - Get user statistics
- `GET /api/analytics/active-chats/:userId` - Get active chats
- `GET /api/analytics/message-count/:userId` - Get message count

## Setup and Installation

1. Clone the repository
2. Copy `.env.example` to `.env` and configure environment variables
3. Install dependencies: `npm install`
4. Start MongoDB and Redis
5. Run the server: `npm start`

## Security Considerations

- All messages are end-to-end encrypted
- Files are scanned for malware
- Rate limiting prevents abuse
- Message integrity is verified with hashing

## Performance Optimizations

- Redis caching for fast message retrieval
- Efficient database indexing
- Scheduled cleanup jobs for expired content
- Optimized file storage and delivery

## License

MIT

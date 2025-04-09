import mongoose from "mongoose"

const messageSchema = new mongoose.Schema({
  messageId: {
    type: String,
    required: true,
    unique: true,
  },
  senderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  recipientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  content: {
    type: String,
    required: true,
  },
  contentHash: {
    type: String,
    required: true,
  },
  type: {
    type: String,
    enum: ["text", "image", "video", "audio", "document", "link"],
    default: "text",
  },
  mediaId: {
    type: String,
    default: null,
  },
  replyToId: {
    type: String,
    default: null,
  },
  reactions: {
    type: Map,
    of: String,
    default: {},
  },
  status: {
    type: String,
    enum: ["sent", "delivered", "seen", "failed"],
    default: "sent",
  },
  sentAt: {
    type: Date,
    required: true,
  },
  deliveredAt: {
    type: Date,
    default: null,
  },
  seenAt: {
    type: Date,
    default: null,
  },
  deletedForSender: {
    type: Boolean,
    default: false,
  },
  deletedForRecipient: {
    type: Boolean,
    default: false,
  },
  deletedForEveryone: {
    type: Boolean,
    default: false,
  },
  deletedAt: {
    type: Date,
    default: null,
  },
  expiresAt: {
    type: Date,
    default: null,
  },
})

// Index for faster queries
messageSchema.index({ senderId: 1, recipientId: 1, sentAt: -1 })
messageSchema.index({ messageId: 1 })

export const Message = mongoose.model("Message", messageSchema)

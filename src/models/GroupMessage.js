import mongoose from "mongoose"

const groupMessageSchema = new mongoose.Schema({
  messageId: {
    type: String,
    required: true,
    unique: true,
  },
  groupId: {
    type: String,
    required: true,
  },
  senderId: {
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
  sentAt: {
    type: Date,
    required: true,
  },
  deliveredTo: [
    {
      userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
      at: {
        type: Date,
        default: null,
      },
    },
  ],
  seenBy: [
    {
      userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
      at: {
        type: Date,
        default: null,
      },
    },
  ],
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

// Indexes for faster queries
groupMessageSchema.index({ groupId: 1, sentAt: -1 })
groupMessageSchema.index({ messageId: 1 })

export const GroupMessage = mongoose.model("GroupMessage", groupMessageSchema)

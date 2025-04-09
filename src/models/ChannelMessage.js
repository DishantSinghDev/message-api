import mongoose from "mongoose"

const channelMessageSchema = new mongoose.Schema({
  messageId: {
    type: String,
    required: true,
    unique: true,
  },
  channelId: {
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
  isPinned: {
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
})

// Indexes for faster queries
channelMessageSchema.index({ channelId: 1, sentAt: -1 })
channelMessageSchema.index({ messageId: 1 })

export const ChannelMessage = mongoose.model("ChannelMessage", channelMessageSchema)

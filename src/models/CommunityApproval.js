import mongoose from "mongoose"

const communityApprovalSchema = new mongoose.Schema({
  communityId: {
    type: String,
    required: true,
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  status: {
    type: String,
    enum: ["pending", "approved", "rejected"],
    default: "pending",
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
  reason: {
    type: String,
    default: null,
  },
})

// Indexes for faster queries
communityApprovalSchema.index({ channelId: 1, sentAt: -1 })
communityApprovalSchema.index({ messageId: 1 })

export const CommunityApproval = mongoose.model("CommunityApproval", communityApprovalSchema)

import mongoose from "mongoose"

const statusSchema = new mongoose.Schema({
  statusId: {
    type: String,
    required: true,
    unique: true,
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  type: {
    type: String,
    enum: ["text", "image", "video"],
    required: true,
  },
  content: {
    type: String,
    default: null, // Text content or caption
  },
  mediaId: {
    type: String,
    default: null, // For image or video
  },
  backgroundColor: {
    type: String,
    default: null, // For text status
  },
  fontStyle: {
    type: String,
    default: "default",
  },
  visibleTo: {
    type: String,
    enum: ["all", "contacts", "specific"],
    default: "all",
  },
  specificUsers: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  ],
  excludedUsers: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  ],
  viewedBy: [
    {
      userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
      at: {
        type: Date,
        default: Date.now,
      },
    },
  ],
  createdAt: {
    type: Date,
    default: Date.now,
  },
  expiresAt: {
    type: Date,
    default: () => {
      // Default expiry is 24 hours after creation
      const date = new Date()
      date.setHours(date.getHours() + 24)
      return date
    },
  },
})

// Indexes for faster queries
statusSchema.index({ userId: 1, createdAt: -1 })
statusSchema.index({ statusId: 1 })
statusSchema.index({ expiresAt: 1 }) // For cleanup jobs

export const Status = mongoose.model("Status", statusSchema)

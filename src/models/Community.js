import mongoose from "mongoose"

const communitySchema = new mongoose.Schema({
  communityId: {
    type: String,
    required: true,
    unique: true,
  },
  name: {
    type: String,
    required: true,
    trim: true,
  },
  description: {
    type: String,
    default: "",
  },
  avatar: {
    type: String,
    default: null,
  },
  coverImage: {
    type: String,
    default: null,
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  admins: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  ],
  members: [
    {
      userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
      role: {
        type: String,
        enum: ["admin", "moderator", "member"],
        default: "member",
      },
      joinedAt: {
        type: Date,
        default: Date.now,
      },
    },
  ],
  channels: [
    {
      type: String,
      ref: "Channel",
    },
  ],
  aesKey: {
    type: String,
    required: false,
  },
  e2eeMode: {
    type: String,
    enum: ["true", "trusted"],
    default: "trusted",
  },
  
  isPrivate: {
    type: Boolean,
    default: false,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
})

// Indexes for faster queries
communitySchema.index({ communityId: 1 })
communitySchema.index({ "members.userId": 1 })

export const Community = mongoose.model("Community", communitySchema)

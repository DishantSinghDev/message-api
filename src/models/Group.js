import mongoose from "mongoose"

const groupSchema = new mongoose.Schema({
  groupId: {
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
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  members: [
    {
      userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
      role: {
        type: String,
        enum: ["admin", "member"],
        default: "member",
      },
      addedAt: {
        type: Date,
        default: Date.now,
      },
    },
  ],
  settings: {
    onlyAdminsCanSend: {
      type: Boolean,
      default: false,
    },
    onlyAdminsCanAddMembers: {
      type: Boolean,
      default: false,
    },
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
groupSchema.index({ groupId: 1 })
groupSchema.index({ "members.userId": 1 })

export const Group = mongoose.model("Group", groupSchema)

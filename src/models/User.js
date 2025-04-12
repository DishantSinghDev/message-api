import mongoose from "mongoose"

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true,
  },
  deviceId: {
    type: String,
    required: true,
  },
  publicKey: {
    type: String,
    required: true,
    unique: true,
  },
  blockedUsers: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  ],
  mutedUsers: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  ],
  lastSeen: {
    type: Date,
    default: Date.now,
  },
  status: {
    type: String,
    enum: ["online", "offline", "away"],
    default: "offline",
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
})

export const User = mongoose.model("User", userSchema)

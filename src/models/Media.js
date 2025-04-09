import mongoose from "mongoose"

const mediaSchema = new mongoose.Schema({
  fileId: {
    type: String,
    required: true,
    unique: true,
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  originalName: {
    type: String,
    required: true,
  },
  mimeType: {
    type: String,
    required: true,
  },
  size: {
    type: Number,
    required: true,
  },
  filePath: {
    type: String,
    required: true,
  },
  thumbnailPath: {
    type: String,
    default: null,
  },
  fileType: {
    type: String,
    enum: ["image", "video", "audio", "document"],
    required: true,
  },
  uploadedAt: {
    type: Date,
    default: Date.now,
  },
  expiresAt: {
    type: Date,
    default: null,
  },
})

export const Media = mongoose.model("Media", mediaSchema)

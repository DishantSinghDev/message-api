import { Media } from "../models/Media.js"
import { sanitizeFile, generateThumbnail } from "../utils/fileUtils.js"
import { generateFileId } from "../utils/encryption.js"
import fs from "fs"
import path from "path"
import { promisify } from "util"

const unlinkAsync = promisify(fs.unlink)

export const uploadMedia = async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "No file uploaded",
      })
    }

    const { userId } = req.body
    const file = req.file

    // Generate unique file ID
    const fileId = generateFileId()

    // Sanitize file (virus scan, etc.)
    const sanitizationResult = await sanitizeFile(file.path)
    if (!sanitizationResult.safe) {
      // Delete unsafe file
      await unlinkAsync(file.path)

      return res.status(400).json({
        success: false,
        message: "File failed security check",
        details: sanitizationResult.reason,
      })
    }

    // Determine file type
    let fileType = "document"
    if (file.mimetype.startsWith("image/")) {
      fileType = "image"
    } else if (file.mimetype.startsWith("video/")) {
      fileType = "video"
    } else if (file.mimetype.startsWith("audio/")) {
      fileType = "audio"
    }

    // Generate thumbnail for images and videos
    let thumbnailPath = null
    if (fileType === "image" || fileType === "video") {
      thumbnailPath = await generateThumbnail(file.path, fileType)
    }

    // Create media record
    const media = new Media({
      fileId,
      userId,
      originalName: file.originalname,
      mimeType: file.mimetype,
      size: file.size,
      filePath: file.path,
      thumbnailPath,
      fileType,
      uploadedAt: new Date(),
      expiresAt: null, // Set expiration if needed
    })

    await media.save()

    return res.status(201).json({
      success: true,
      data: {
        fileId: media.fileId,
        fileType: media.fileType,
        size: media.size,
        mimeType: media.mimeType,
        uploadedAt: media.uploadedAt,
      },
    })
  } catch (error) {
    next(error)
  }
}

export const getMedia = async (req, res, next) => {
  try {
    const { fileId } = req.params
    const { thumbnail } = req.query

    // Find media record
    const media = await Media.findOne({ fileId })

    if (!media) {
      return res.status(404).json({
        success: false,
        message: "File not found",
      })
    }

    // Check if thumbnail is requested and available
    if (thumbnail === "true" && media.thumbnailPath) {
      return res.sendFile(path.resolve(media.thumbnailPath))
    }

    // Send the file
    return res.sendFile(path.resolve(media.filePath))
  } catch (error) {
    next(error)
  }
}

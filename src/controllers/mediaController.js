import { Media } from "../models/Media.js"
import { sanitizeFile, generateThumbnail } from "../utils/fileUtils.js"
import { generateFileId } from "../utils/encryption.js"
import fs from "fs"
import path from "path"
import { promisify } from "util"

const unlinkAsync = promisify(fs.unlink)


export const uploadMedia = async (req, res, next) => {
  try {
    const { userId, encryptedMetadata } = req.body;

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "No encrypted file uploaded",
      });
    }

    const file = req.file;

    // Optional: Run virus scan even on encrypted file (based on your preference)
    const sanitizationResult = await sanitizeFile(file.path);
    if (!sanitizationResult.safe) {
      await unlinkAsync(file.path);
      return res.status(400).json({
        success: false,
        message: "File failed security check",
        details: sanitizationResult.reason,
      });
    }

    // Parse encrypted metadata from client (should include type, size, originalName, etc.)
    const {
      fileType,
      originalName,
      size,
      mimeType,
      thumbnailFileId,
    } = JSON.parse(encryptedMetadata); // This must be encrypted and decrypted client-side

    const fileId = generateFileId();

    // Thumbnail handling
    let thumbnailPath = null;
    if (thumbnailFileId && req.body.hasThumbnail === "true") {
      const thumbFile = req.files?.thumbnail?.[0];
      if (thumbFile) {
        thumbnailPath = thumbFile.path;
      }
    }

    const media = new Media({
      fileId,
      userId,
      originalName,
      mimeType,
      size,
      filePath: file.path,
      thumbnailPath,
      fileType,
      uploadedAt: new Date(),
      expiresAt: null,
    });

    await media.save();

    return res.status(201).json({
      success: true,
      data: {
        fileId: media.fileId,
        fileType: media.fileType,
        mimeType: media.mimeType,
        uploadedAt: media.uploadedAt,
      },
    });
  } catch (error) {
    next(error);
  }
};


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

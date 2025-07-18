
import { Media } from "../models/Media.js"
import { generateFileId } from "../utils/encryption.js"
import fs from "fs"
import path from "path"


export const uploadMedia = async (req, res, next) => {
  try {
    // get data from form/data
    const { userId, encryptedMetadata } = req.body;

    // Check if userId is provided
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "User ID is required",
      });
    }

    if (!req.files) {
      return res.status(400).json({
        success: false,
        message: "No encrypted file uploaded",
      });
    }

    const file = req.files.file[0];

    // check the encryptedMetadata
    if (!encryptedMetadata) {
      return res.status(400).json({
        success: false,
        message: "Encrypted metadata is required",
      });
    }

    // Parse encrypted metadata from client (should include type, size, originalName, etc.)

    // Parse metadata safely
    let parsedMetadata;
    try {
      parsedMetadata = JSON.parse(encryptedMetadata);
      console.log("Parsed Metadata:", parsedMetadata);
      console.log(typeof parsedMetadata);
    } catch (err) {
      return res.status(400).json({
        success: false,
        message: "Invalid JSON in encryptedMetadata",
      });
    }

    // Destructure safely
    const {
      fileType,
      originalName,
      size,
      mimeType,
      iv,
      thumbnailIv,
      encryptedKey,
    } = parsedMetadata;

    // Check all required fields
    const requiredFields = {
      fileType,
      originalName,
      size,
      mimeType,
      iv,
      encryptedKey,
    };

    const missingFields = Object.entries(requiredFields)
      .filter(([_, v]) => !v)
      .map(([k]) => k);

    if (missingFields.length) {
      return res.status(400).json({
        success: false,
        message: `Missing metadata fields: ${missingFields.join(", ")}`,
      });
    }

    const fileId = generateFileId();

    // Thumbnail handling
    let thumbnailPath = null;
    if (req.body.hasThumbnail) {
      const thumbFile = req.files?.thumbnail?.[0];
      if (thumbFile) {
        thumbnailPath = thumbFile.path;
      }
    } else {
      thumbnailPath = null;
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
      fileIv: iv,
      thumbIv: thumbnailIv,
      encryptedAESKey: encryptedKey,
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
    const { fileId } = req.params;
    const { thumbnail } = req.query;

    // Find the media record in DB
    const media = await Media.findOne({ fileId });

    if (!media) {
      return res.status(404).json({
        success: false,
        message: "Encrypted file not found",
      });
    }

    // Choose the path to send
    const filePath = thumbnail === "true" ? media.thumbnailPath : media.filePath;

    console.log("File Path:", filePath);

    if (!filePath || !fs.existsSync(filePath)) {
      return res.status(404).json({
        success: false,
        message: "Requested file not available",
      });
    }

    // Send media details along with the file
    return res.status(200).json({
      success: true,
      data: {
        fileId: media.fileId,
        fileType: media.fileType,
        mimeType: media.mimeType,
        size: media.size,
        originalName: media.originalName,
        thumbnailPath: media.thumbnailPath,
        filePath: media.filePath,
        fileIv: media.fileIv,
        thumbIv: media.thumbIv,
        encryptedAESKey: media.encryptedAESKey,
        userId: media.userId,
        uploadedAt: media.uploadedAt,
        expiresAt: media.expiresAt,
      },
      file: path.resolve(filePath),
    });
  } catch (error) {
    next(error);
  }
};
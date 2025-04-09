import fs from "fs"
import path from "path"
import { promisify } from "util"
import sharp from "sharp"
import ffmpeg from "fluent-ffmpeg"
import { v4 as uuidv4 } from "uuid"
import { fileTypeFromFile } from "file-type"; // Use named import
import { initClamAV } from "./clamav.js"

const readFileAsync = promisify(fs.readFile)

// Ensure thumbnails directory exists
const thumbnailDir = path.join(process.cwd(), "uploads", "thumbnails")
if (!fs.existsSync(thumbnailDir)) {
  fs.mkdirSync(thumbnailDir, { recursive: true })
}


export const sanitizeFile = async (filePath) => {
  try {
    // Ensure the file exists
    if (!fs.existsSync(filePath)) {
      return {
        safe: false,
        reason: "File not found",
      };
    }
    // Read file content
    const fileContent = await readFileAsync(filePath);

    // Check file size (limit to 100MB)
    if (fileContent.length > 100 * 1024 * 1024) {
      return {
        safe: false,
        reason: "File too large",
      };
    }

    // Validate file type
    const type = await fileTypeFromFile(filePath); // Updated function call
    const supportedMimeTypes = [
      "image/jpeg", "image/png", "image/gif", // Images
      "video/mp4", "video/3gpp", "video/mpeg", // Videos
      "audio/mpeg", "audio/aac", "audio/ogg", "audio/amr", // Audio
      "application/pdf", "application/msword", // Documents
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // DOCX
      "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // Excel
      "application/zip", "application/x-rar-compressed", // Archives
    ];

    if (!type || !supportedMimeTypes.includes(type.mime)) {
      return {
        safe: false,
        reason: "Unsupported file type",
      };
    }

    const ClamScan = await initClamAV();

    // Scan file for viruses
    const isInfected = await ClamScan.isInfected(filePath);

    

    if (isInfected) {
      return {
        safe: false,
        reason: "File contains a virus",
      };
    }

    // File passed all checks
    return {
      safe: true,
    };
  } catch (error) {
    console.error("File sanitization error:", error);
    return {
      safe: false,
      reason: "File processing error",
    };
  }
};

// Generate thumbnail for images and videos
export const generateThumbnail = async (filePath, fileType) => {
  const thumbnailPath = path.join(thumbnailDir, `${uuidv4()}.jpg`)

  try {
    if (fileType === "image") {
      // Generate image thumbnail
      await sharp(filePath)
        .resize(300, 300, {
          fit: "inside",
          withoutEnlargement: true,
        })
        .jpeg({ quality: 80 })
        .toFile(thumbnailPath)

      return thumbnailPath
    } else if (fileType === "video") {
      // Generate video thumbnail
      return new Promise((resolve, reject) => {
        ffmpeg(filePath)
          .screenshots({
            count: 1,
            folder: thumbnailDir,
            filename: path.basename(thumbnailPath),
            size: "300x?",
          })
          .on("end", () => resolve(thumbnailPath))
          .on("error", (err) => reject(err))
      })
    }

    return null
  } catch (error) {
    console.error("Thumbnail generation error:", error)
    return null
  }
}

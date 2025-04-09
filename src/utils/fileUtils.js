import fs from "fs"
import path from "path"
import { promisify } from "util"
import sharp from "sharp"
import ffmpeg from "fluent-ffmpeg"
import { v4 as uuidv4 } from "uuid"

const readFileAsync = promisify(fs.readFile)
const writeFileAsync = promisify(fs.writeFile)
const unlinkAsync = promisify(fs.unlink)

// Ensure thumbnails directory exists
const thumbnailDir = path.join(process.cwd(), "uploads", "thumbnails")
if (!fs.existsSync(thumbnailDir)) {
  fs.mkdirSync(thumbnailDir, { recursive: true })
}

// Sanitize file (mock implementation - in production use a real virus scanner)
export const sanitizeFile = async (filePath) => {
  try {
    // Read file content
    const fileContent = await readFileAsync(filePath)

    // Check file size
    if (fileContent.length > 100 * 1024 * 1024) {
      // 100MB
      return {
        safe: false,
        reason: "File too large",
      }
    }

    // In a real implementation, you would:
    // 1. Use a virus scanning service/library
    // 2. Check for malicious content
    // 3. Validate file integrity

    // Mock implementation - always return safe for demo
    return {
      safe: true,
    }
  } catch (error) {
    console.error("File sanitization error:", error)
    return {
      safe: false,
      reason: "File processing error",
    }
  }
}

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

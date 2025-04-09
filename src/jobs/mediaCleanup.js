import { Media } from "../models/Media.js"
import fs from "fs"
import { promisify } from "util"

const unlinkAsync = promisify(fs.unlink)

// Clean up expired media files
export const cleanupExpiredMedia = async () => {
  try {
    const now = new Date()

    // Find expired media
    const expiredMedia = await Media.find({
      expiresAt: { $lte: now },
    })

    for (const media of expiredMedia) {
      // Delete file from disk
      try {
        if (media.filePath && fs.existsSync(media.filePath)) {
          await unlinkAsync(media.filePath)
        }

        if (media.thumbnailPath && fs.existsSync(media.thumbnailPath)) {
          await unlinkAsync(media.thumbnailPath)
        }

        // Delete from database
        await Media.findByIdAndDelete(media._id)
      } catch (error) {
        console.error(`Error deleting media ${media.fileId}:`, error)
      }
    }

    console.log(`Cleaned up ${expiredMedia.length} expired media files`)
  } catch (error) {
    console.error("Error cleaning up expired media:", error)
  }
}

// Set up interval to clean up expired media
export const startMediaCleanupJob = () => {
  // Run every day
  setInterval(cleanupExpiredMedia, 86400000)
}

import { Status } from "../models/Status.js"
import { redisClient } from "../server.js"

// Clean up expired statuses
export const cleanupExpiredStatuses = async () => {
  try {
    const now = new Date()

    // Find expired statuses
    const expiredStatuses = await Status.find({
      expiresAt: { $lte: now },
    })

    if (expiredStatuses.length > 0) {
      // Get status IDs and user IDs
      const statusIds = expiredStatuses.map((status) => status.statusId)
      const userStatusMap = {}

      for (const status of expiredStatuses) {
        const userId = status.userId.toString()
        if (!userStatusMap[userId]) {
          userStatusMap[userId] = []
        }
        userStatusMap[userId].push(status.statusId)
      }

      // Delete from MongoDB
      await Status.deleteMany({
        statusId: { $in: statusIds },
      })

      // Delete from Redis
      const pipeline = redisClient.pipeline()

      for (const statusId of statusIds) {
        pipeline.del(`status:${statusId}`)
      }

      for (const userId in userStatusMap) {
        for (const statusId of userStatusMap[userId]) {
          pipeline.zrem(`user:${userId}:statuses`, statusId)
        }
      }

      await pipeline.exec()

      console.log(`Cleaned up ${statusIds.length} expired statuses`)
    }
  } catch (error) {
    console.error("Error cleaning up expired statuses:", error)
  }
}

// Set up interval to clean up expired statuses
export const startStatusCleanupJob = () => {
  // Run every hour
  setInterval(cleanupExpiredStatuses, 3600000)
}

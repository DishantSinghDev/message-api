import { Message } from "../models/Message.js"
import { redisClient } from "../server.js"

// Clean up expired messages
export const cleanupExpiredMessages = async () => {
  try {
    const now = new Date()

    // Find expired messages
    const expiredMessages = await Message.find({
      expiresAt: { $lte: now },
    })

    if (expiredMessages.length > 0) {
      // Get message IDs
      const messageIds = expiredMessages.map((msg) => msg.messageId)

      // Delete from MongoDB
      await Message.deleteMany({
        messageId: { $in: messageIds },
      })

      // Delete from Redis
      const pipeline = redisClient.pipeline()

      for (const messageId of messageIds) {
        pipeline.del(`message:${messageId}`)

        // Also remove from chat lists
        const message = expiredMessages.find((msg) => msg.messageId === messageId)
        if (message) {
          pipeline.zrem(`chat:${message.senderId}:${message.recipientId}`, messageId)
          pipeline.zrem(`chat:${message.recipientId}:${message.senderId}`, messageId)
        }
      }

      await pipeline.exec()

      console.log(`Cleaned up ${messageIds.length} expired messages`)
    }
  } catch (error) {
    console.error("Error cleaning up expired messages:", error)
  }
}

// Set up interval to clean up expired messages
export const startMessageCleanupJob = () => {
  // Run every hour
  setInterval(cleanupExpiredMessages, 3600000)
}

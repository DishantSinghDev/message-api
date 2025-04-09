import { redisClient } from "../server.js"
import { sendMessage } from "../controllers/messageController.js"

// Process scheduled messages
export const processScheduledMessages = async () => {
  try {
    const now = Date.now()

    // Get all scheduled messages that are due
    const dueMessages = await redisClient.zrangebyscore("scheduled_messages", 0, now)

    for (const messageId of dueMessages) {
      // Get message data
      const messageData = await redisClient.get(`scheduled:${messageId}`)

      if (messageData) {
        const message = JSON.parse(messageData)

        // Create request object for sendMessage
        const req = {
          body: {
            senderId: message.senderId,
            recipientId: message.recipientId,
            content: message.content,
            type: message.type,
            mediaId: message.mediaId,
          },
        }

        // Create response object
        const res = {
          status: () => ({
            json: () => {},
          }),
        }

        // Send the message
        await sendMessage(req, res, (err) => {
          if (err) {
            console.error("Error sending scheduled message:", err)
          }
        })

        // Remove from Redis
        await redisClient.del(`scheduled:${messageId}`)
        await redisClient.zrem("scheduled_messages", messageId)
      }
    }
  } catch (error) {
    console.error("Error processing scheduled messages:", error)
  }
}

// Set up interval to check for scheduled messages
export const startScheduledMessageProcessor = () => {
  // Check every minute
  setInterval(processScheduledMessages, 60000)
}

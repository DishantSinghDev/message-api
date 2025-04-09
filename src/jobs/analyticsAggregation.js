import { Message } from "../models/Message.js"
import { User } from "../models/User.js"
import { redisClient } from "../server.js"

// Aggregate analytics data
export const aggregateAnalytics = async () => {
  try {
    // Get all users
    const users = await User.find().select("_id")

    for (const user of users) {
      const userId = user._id.toString()

      // Calculate message counts
      const [sentCount, receivedCount] = await Promise.all([
        Message.countDocuments({ senderId: userId }),
        Message.countDocuments({ recipientId: userId }),
      ])

      // Get active chats
      const activeChats = await Message.aggregate([
        {
          $match: {
            $or: [{ senderId: userId }, { recipientId: userId }],
          },
        },
        {
          $group: {
            _id: {
              $cond: [{ $eq: ["$senderId", userId] }, "$recipientId", "$senderId"],
            },
            lastMessageAt: { $max: "$sentAt" },
          },
        },
        { $sort: { lastMessageAt: -1 } },
      ])

      // Store analytics in Redis
      const stats = {
        messagesSent: sentCount,
        messagesReceived: receivedCount,
        totalMessages: sentCount + receivedCount,
        activeChatsCount: activeChats.length,
        lastActiveAt: activeChats.length > 0 ? activeChats[0].lastMessageAt : null,
        updatedAt: new Date(),
      }

      await redisClient.setex(
        `analytics:user:${userId}`,
        86400, // 24 hours
        JSON.stringify(stats),
      )
    }

    console.log("Analytics aggregation completed")
  } catch (error) {
    console.error("Error aggregating analytics:", error)
  }
}

// Set up interval to aggregate analytics
export const startAnalyticsAggregationJob = () => {
  // Run every 6 hours
  setInterval(aggregateAnalytics, 21600000)
}

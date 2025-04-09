import { Message } from "../models/Message.js"
import { redisClient } from "../server.js"

export const getUserStats = async (req, res, next) => {
  try {
    const { userId } = req.params

    // Get stats from Redis if available
    const cachedStats = await redisClient.get(`analytics:user:${userId}`)
    if (cachedStats) {
      return res.status(200).json({
        success: true,
        data: JSON.parse(cachedStats),
      })
    }

    // Calculate stats from MongoDB
    const [sentCount, receivedCount, activeChats] = await Promise.all([
      Message.countDocuments({ senderId: userId }),
      Message.countDocuments({ recipientId: userId }),
      Message.aggregate([
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
      ]),
    ])

    const stats = {
      messagesSent: sentCount,
      messagesReceived: receivedCount,
      totalMessages: sentCount + receivedCount,
      activeChatsCount: activeChats.length,
      lastActiveAt: activeChats.length > 0 ? activeChats[0].lastMessageAt : null,
    }

    // Cache in Redis for 1 hour
    await redisClient.setex(
      `analytics:user:${userId}`,
      3600, // 1 hour
      JSON.stringify(stats),
    )

    return res.status(200).json({
      success: true,
      data: stats,
    })
  } catch (error) {
    next(error)
  }
}

export const getActiveChats = async (req, res, next) => {
  try {
    const { userId } = req.params
    const { limit = 10 } = req.query

    // Get active chats from Redis
    const chatKeys = await redisClient.keys(`chat:${userId}:*`)

    if (chatKeys.length > 0) {
      const activeChats = []

      for (const key of chatKeys) {
        const recipientId = key.split(":")[2]

        // Get last message timestamp
        const lastMessageId = await redisClient.zrevrange(key, 0, 0)

        if (lastMessageId.length > 0) {
          const messageData = await redisClient.get(`message:${lastMessageId[0]}`)

          if (messageData) {
            const parsedData = JSON.parse(messageData)

            activeChats.push({
              userId: recipientId,
              lastMessageAt: parsedData.sentAt,
              lastMessageId: lastMessageId[0],
            })
          }
        }
      }

      // Sort by last message time and limit
      activeChats.sort((a, b) => new Date(b.lastMessageAt) - new Date(a.lastMessageAt))
      const limitedChats = activeChats.slice(0, Number.parseInt(limit))

      return res.status(200).json({
        success: true,
        data: limitedChats,
      })
    }

    // Fallback to MongoDB if Redis doesn't have data
    const activeChats = await Message.aggregate([
      {
        $match: {
          $or: [{ senderId: userId }, { recipientId: userId }],
        },
      },
      {
        $sort: { sentAt: -1 },
      },
      {
        $group: {
          _id: {
            $cond: [{ $eq: ["$senderId", userId] }, "$recipientId", "$senderId"],
          },
          lastMessageAt: { $first: "$sentAt" },
          lastMessageId: { $first: "$messageId" },
        },
      },
      { $sort: { lastMessageAt: -1 } },
      { $limit: Number.parseInt(limit) },
    ])

    const formattedChats = activeChats.map((chat) => ({
      userId: chat._id,
      lastMessageAt: chat.lastMessageAt,
      lastMessageId: chat.lastMessageId,
    }))

    return res.status(200).json({
      success: true,
      data: formattedChats,
    })
  } catch (error) {
    next(error)
  }
}

export const getMessageCount = async (req, res, next) => {
  try {
    const { userId } = req.params
    const { period = "all" } = req.query

    let startDate
    const now = new Date()

    // Determine time period
    switch (period) {
      case "day":
        startDate = new Date(now.setHours(0, 0, 0, 0))
        break
      case "week":
        startDate = new Date(now.setDate(now.getDate() - now.getDay()))
        startDate.setHours(0, 0, 0, 0)
        break
      case "month":
        startDate = new Date(now.setDate(1))
        startDate.setHours(0, 0, 0, 0)
        break
      case "year":
        startDate = new Date(now.setMonth(0, 1))
        startDate.setHours(0, 0, 0, 0)
        break
      default:
        startDate = null
    }

    // Build query
    const query = {
      $or: [{ senderId: userId }, { recipientId: userId }],
    }

    if (startDate) {
      query.sentAt = { $gte: startDate }
    }

    // Get count from MongoDB
    const count = await Message.countDocuments(query)

    return res.status(200).json({
      success: true,
      data: {
        count,
        period,
      },
    })
  } catch (error) {
    next(error)
  }
}

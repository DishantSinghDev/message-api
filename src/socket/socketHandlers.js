import { User } from "../models/User.js"

export const setupSocketHandlers = (io, redisClient) => {
  // Socket.io middleware for authentication
  io.use(async (socket, next) => {
    const userId = socket.handshake.auth.userId

    if (!userId) {
      return next(new Error("Authentication error"))
    }

    // Store user ID in socket object for later use
    socket.userId = userId
    next()
  })

  io.on("connection", async (socket) => {
    const userId = socket.userId

    // Join user's room for direct messages
    socket.join(userId)

    // Update user status to online
    await User.findByIdAndUpdate(userId, { status: "online", lastSeen: new Date() })
    await redisClient.hset(`user:${userId}`, "status", "online")

    // Broadcast to user's contacts that they're online
    socket.broadcast.emit("user_status_change", {
      userId,
      status: "online",
    })

    // Handle typing indicators
    socket.on("typing", async (data) => {
      const { recipientId, isTyping } = data

      socket.to(recipientId).emit("typing_indicator", {
        senderId: userId,
        isTyping,
        timestamp: new Date(),
      })

      // Store typing status in Redis with short TTL
      if (isTyping) {
        await redisClient.setex(`typing:${userId}:${recipientId}`, 5, "1")
      } else {
        await redisClient.del(`typing:${userId}:${recipientId}`)
      }
    })

    // Handle disconnection
    socket.on("disconnect", async () => {
      // Update user status to offline
      await User.findByIdAndUpdate(userId, {
        status: "offline",
        lastSeen: new Date(),
      })

      await redisClient.hset(`user:${userId}`, "status", "offline", "lastSeen", new Date().toISOString())

      // Broadcast to user's contacts that they're offline
      socket.broadcast.emit("user_status_change", {
        userId,
        status: "offline",
        lastSeen: new Date(),
      })
    })
  })
}

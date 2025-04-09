import { redisClient } from "../server.js"

// Rate limiter middleware using Redis
export const rateLimiter = (identifier, maxRequests, timeWindowSeconds) => {
  return async (req, res, next) => {
    try {
      // Get client IP or user ID if authenticated
      const clientId = req.body.userId || req.ip
      const key = `ratelimit:${identifier}:${clientId}`

      // Get current count
      const currentCount = await redisClient.get(key)

      if (currentCount && Number.parseInt(currentCount) >= maxRequests) {
        return res.status(429).json({
          success: false,
          message: "Too many requests, please try again later",
        })
      }

      // Increment count
      await redisClient.incr(key)

      // Set expiry if it's a new key
      if (!currentCount) {
        await redisClient.expire(key, timeWindowSeconds)
      }

      next()
    } catch (error) {
      // If Redis fails, allow the request to proceed
      console.error("Rate limiter error:", error)
      next()
    }
  }
}

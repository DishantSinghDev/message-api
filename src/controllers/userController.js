import { User } from "../models/User.js"
import { redisClient } from "../server.js"


export const registerUser = async (req, res, next) => {
  try {
    const { username, deviceId, publicKey } = req.body

    // Basic check: Ensure publicKey is present
    if (!publicKey || typeof publicKey !== "string") {
      return res.status(400).json({
        success: false,
        message: "Public key is required and must be a string",
      })
    }

    // Check if user already exists
    const existingUser = await User.findOne({ username })
    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: "Username already exists",
      })
    }

    // Save new user
    const user = new User({
      username,
      deviceId,
      publicKey,
      createdAt: new Date(),
    })

    await user.save()

    // Cache user data in Redis
    await redisClient.hset(
      `userId:${user._id}`,
      "username", username,
      "publicKey", publicKey,
      "status", "online"
    )

    return res.status(201).json({
      success: true,
      data: {
        userId: user._id,
        username: user.username,
        publicKey: user.publicKey,
      },
    })
  } catch (error) {
    next(error)
  }
}

export const blockUser = async (req, res, next) => {
  try {
    const { userId, blockedUserId } = req.body

    // Check if the user is already blocked
    const isBlocked = await redisClient.sismember(`user:${userId}:blocked`, blockedUserId)
    if (isBlocked) {
      return res.status(400).json({
        success: false,
        message: "User is already blocked",
      })
    }

    await User.findByIdAndUpdate(userId, {
      $addToSet: { blockedUsers: blockedUserId },
    })

    // Update Redis cache
    await redisClient.sadd(`user:${userId}:blocked`, blockedUserId)

    return res.status(200).json({
      success: true,
      message: "User blocked successfully",
    })
  } catch (error) {
    next(error)
  }
}

export const unblockUser = async (req, res, next) => {
  try {
    const { userId, blockedUserId } = req.body

    // Check if the user is not blocked
    const isBlocked = await redisClient.sismember(`user:${userId}:blocked`, blockedUserId)
    if (!isBlocked) {
      return res.status(400).json({
        success: false,
        message: "User is not blocked or already unblocked",
      })
    }

    await User.findByIdAndUpdate(userId, {
      $pull: { blockedUsers: blockedUserId },
    })

    // Update Redis cache
    await redisClient.srem(`user:${userId}:blocked`, blockedUserId)

    return res.status(200).json({
      success: true,
      message: "User unblocked successfully",
    })
  } catch (error) {
    next(error)
  }
}

export const muteUser = async (req, res, next) => {
  try {
    const { userId, mutedUserId, duration } = req.body

    // Check if the user is already muted
    const isMuted = await redisClient.exists(`user:${userId}:muted:${mutedUserId}`)
    if (isMuted) {
      return res.status(400).json({
        success: false,
        message: "User is already muted",
      })
    }

    // Duration in seconds, default 24 hours if not specified
    const muteDuration = duration || 86400

    await User.findByIdAndUpdate(userId, {
      $addToSet: { mutedUsers: mutedUserId },
    })

    // Set in Redis with expiration
    await redisClient.setex(`user:${userId}:muted:${mutedUserId}`, muteDuration, "1")

    return res.status(200).json({
      success: true,
      message: "User muted successfully",
      expiresIn: muteDuration,
    })
  } catch (error) {
    next(error)
  }
}


// function to get users details with his username
export const getUserDetails = async (req, res, next) => {
  try {
    const { username } = req.params

    // Check if user exists in Redis cache
    const cachedUser = await redisClient.hgetall(`user:${username}`)
    console.log("Cached User:", cachedUser)
    if (Object.keys(cachedUser).length > 0) {
      return res.status(200).json({
        success: true,
        data: cachedUser,
      })
    }

    // If not in cache, fetch from MongoDB
    const user = await User.findOne({ username })
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      })
    }

    // Cache the user data in Redis
    await redisClient.hmset(
      `user:${username}`,
      "userId", user._id,
      "username", user.username,
      "publicKey", user.publicKey,
      "status", user.status
    )

    return res.status(200).json({
      success: true,
      data: {userId: user._id, username: user.username, publicKey: user.publicKey, status: user.status},
    })
  } catch (error) {
    next(error)
  }
}
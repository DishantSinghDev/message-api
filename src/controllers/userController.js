import { User } from "../models/User.js"
import { generateKeyPair } from "../utils/encryption.js"
import { redisClient } from "../server.js"

export const registerUser = async (req, res, next) => {
  try {
    const { username, deviceId } = req.body

    // Check if user already exists
    const existingUser = await User.findOne({ username })
    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: "Username already exists",
      })
    }

    // Generate encryption keys for E2EE
    const { publicKey, privateKey } = await generateKeyPair()

    // Create new user
    const user = new User({
      username,
      deviceId,
      publicKey,
      privateKey: privateKey, // In a real app, this would be stored client-side only
      createdAt: new Date(),
    })

    await user.save()

    // Cache user data in Redis for faster access
    await redisClient.hset(`user:${user._id}`, "username", username, "publicKey", publicKey, "status", "online")

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

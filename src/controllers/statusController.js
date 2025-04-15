import { Message } from "../models/Message.js"
import { redisClient } from "../server.js"
import { io } from "../server.js"
import { Status } from "../models/Status.js"
import { User } from "../models/User.js"
import { v4 as uuidv4 } from "uuid"

export const updateMessageStatus = async (req, res, next) => {
  try {
    const { messageId, status, userId } = req.body

    // Validate status
    const validStatuses = ["delivered", "seen", "failed"]
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid status",
      })
    }

    // Find message
    const message = await Message.findOne({ messageId })
    if (!message) {
      return res.status(404).json({
        success: false,
        message: "Message not found",
      })
    }

    // Verify recipient is updating status
    if (message.recipientId.toString() !== userId) {
      return res.status(403).json({
        success: false,
        message: "Only recipient can update message status",
      })
    }

    // Update status with timestamp
    const updateData = { status }

    if (status === "delivered" && !message.deliveredAt) {
      updateData.deliveredAt = new Date()
    } else if (status === "seen" && !message.seenAt) {
      updateData.seenAt = new Date()
    }

    await Message.updateOne({ messageId }, { $set: updateData })

    // Update in Redis
    const messageData = await redisClient.get(`message:${messageId}`)
    if (messageData) {
      const parsedData = JSON.parse(messageData)
      parsedData.status = status

      if (status === "delivered" && !parsedData.deliveredAt) {
        parsedData.deliveredAt = new Date().toISOString()
      } else if (status === "seen" && !parsedData.seenAt) {
        parsedData.seenAt = new Date().toISOString()
      }

      await redisClient.setex(
        `message:${messageId}`,
        2592000, // 30 days
        JSON.stringify(parsedData),
      )
    }

    // Notify sender about status update
    io.to(message.senderId.toString()).emit("message_status_update", {
      messageId,
      status,
      timestamp: new Date(),
    })

    return res.status(200).json({
      success: true,
      data: {
        messageId,
        status,
        updatedAt: new Date(),
      },
    })
  } catch (error) {
    next(error)
  }
}

export const getMessageStatus = async (req, res, next) => {
  try {
    const { messageId } = req.params

    // Try to get from Redis first
    const messageData = await redisClient.get(`message:${messageId}`)

    if (messageData) {
      const parsedData = JSON.parse(messageData)
      return res.status(200).json({
        success: true,
        data: {
          messageId,
          status: parsedData.status,
          sentAt: parsedData.sentAt,
          deliveredAt: parsedData.deliveredAt,
          seenAt: parsedData.seenAt,
        },
      })
    }

    // If not in Redis, get from MongoDB
    const message = await Message.findOne({ messageId }).select("status sentAt deliveredAt seenAt")

    if (!message) {
      return res.status(404).json({
        success: false,
        message: "Message not found",
      })
    }

    return res.status(200).json({
      success: true,
      data: {
        messageId,
        status: message.status,
        sentAt: message.sentAt,
        deliveredAt: message.deliveredAt,
        seenAt: message.seenAt,
      },
    })
  } catch (error) {
    next(error)
  }
}

// Create a new status
export const createStatus = async (req, res, next) => {
  try {
    const {
      type,
      content, // Encrypted message
      mediaId,
      backgroundColor,
      fontStyle,
      visibleTo,
      specificUsers,
      expiresIn,
      contacts,
      encryptedKeys, // Encrypted keys mapped to userIds
    } = req.body
    const userId = req.body.userId

    // Validate user exists
    const user = await User.findById(userId)
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      })
    }

    // Validate required fields based on type
    if (type === "text" && !content ) {
      return res.status(400).json({
        success: false,
        message: "Encrypted content is required for text status",
      })
    }

    if ((type === "image" || type === "video") && !mediaId) {
      return res.status(400).json({
        success: false,
        message: "Media ID is required for image or video status",
      })
    }

    // Validate encryptedKeys for specific visibility
    if (visibleTo === "specific" && (!specificUsers || specificUsers.length === 0)) {
      return res.status(400).json({
        success: false,
        message: "Specific users must be provided for 'specific' visibility",
      })
    }

    if (visibleTo === "specific" && (!encryptedKeys || Object.keys(encryptedKeys).length === 0)) {
      return res.status(400).json({
        success: false,
        message: "Encrypted keys must be provided for specific users",
      })
    }

    // Ensure encryptedKeys match specificUsers
    if (visibleTo === "specific") {
      for (const userId of specificUsers) {
        if (!encryptedKeys[userId]) {
          return res.status(400).json({
            success: false,
            message: `Encrypted key missing for userId: ${userId}`,
          })
        }
      }
    }

    // Generate unique status ID
    const statusId = `status_${uuidv4().replace(/-/g, "")}`

    // Calculate expiry time (default 24 hours if not specified)
    const expiryHours = expiresIn || 24
    const expiresAt = new Date()
    expiresAt.setHours(expiresAt.getHours() + expiryHours)

    // Create status object
    const status = new Status({
      statusId,
      userId,
      type,
      content: content || null, // Encrypted content
      mediaId: mediaId || null,
      backgroundColor: backgroundColor || null,
      fontStyle: fontStyle || "default",
      visibleTo: visibleTo || "all",
      specificUsers: visibleTo === "specific" ? specificUsers || [] : [],
      encryptedKeys: visibleTo === "specific" ? encryptedKeys : {}, // Store encrypted keys
      createdAt: new Date(),
      expiresAt,
    })

    await status.save()

    // Store in Redis for faster retrieval
    const statusData = {
      statusId: status.statusId,
      userId: status.userId.toString(),
      type: status.type,
      content: status.content, // Encrypted content
      mediaId: status.mediaId,
      backgroundColor: status.backgroundColor,
      fontStyle: status.fontStyle,
      visibleTo: status.visibleTo,
      specificUsers: status.specificUsers,
      excludedUsers: status.excludedUsers,
      encryptedKeys: status.encryptedKeys, // Encrypted keys
      createdAt: status.createdAt.toISOString(),
      expiresAt: status.expiresAt.toISOString(),
    }

    // Store in Redis with TTL (until expiry)
    const ttl = Math.floor((expiresAt.getTime() - Date.now()) / 1000)
    await redisClient.setex(`status:${statusId}`, ttl, JSON.stringify(statusData))

    // Add to user's status list
    await redisClient.zadd(`user:${userId}:statuses`, Date.now(), statusId)

    // Notify contacts about new status
    let notifyUserIds = []

    if (visibleTo === "all") {
      // Notify all contacts (in a real app, you'd get the user's contacts)
      const allUsers = await User.find({ _id: { $ne: userId } }).select("_id")
      notifyUserIds = allUsers.map((u) => u._id.toString())
    } else if (visibleTo === "contacts") {
      // In a real app, you'd get the user's contacts
      const allUsers = await User.find({ _id: { $ne: userId } }).select("_id")
      notifyUserIds = allUsers.map((u) => u._id.toString())
    } else if (visibleTo === "specific" && specificUsers && specificUsers.length > 0) {
      notifyUserIds = specificUsers
    }

    // Emit real-time event via Socket.io
    for (const notifyUserId of notifyUserIds) {
      io.to(notifyUserId).emit("new_status", {
        statusId,
        userId,
        type,
        createdAt: status.createdAt,
      })
    }

    return res.status(201).json({
      success: true,
      data: {
        statusId: status.statusId,
        type: status.type,
        createdAt: status.createdAt,
        expiresAt: status.expiresAt,
      },
    })
  } catch (error) {
    next(error)
  }
}

// Get user's statuses
export const getUserStatuses = async (req, res, next) => {
  try {
    const { userId } = req.params
    const viewerId = req.query.viewerId

    // Validate users exist
    const [user, viewer] = await Promise.all([User.findById(userId), User.findById(viewerId)])

    if (!user || !viewer) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      })
    }

    // Get status IDs from Redis
    const statusIds = await redisClient.zrevrange(`user:${userId}:statuses`, 0, -1)

    if (statusIds.length > 0) {
      const statusesData = []

      for (const statusId of statusIds) {
        const statusData = await redisClient.get(`status:${statusId}`)
        if (statusData) {
          const parsedStatus = JSON.parse(statusData)

          // Check visibility permissions
          if (
            parsedStatus.visibleTo === "all" ||
            (parsedStatus.visibleTo === "contacts" && true) || // In a real app, check if viewer is a contact
            (parsedStatus.visibleTo === "specific" &&
              parsedStatus.specificUsers &&
              parsedStatus.specificUsers.includes(viewerId))
          ) {
            // Check if not in excluded users
            if (!parsedStatus.excludedUsers || !parsedStatus.excludedUsers.includes(viewerId)) {
              // Include encryptedKey for the viewer if specific visibility
              if (parsedStatus.visibleTo === "specific") {
                parsedStatus.encryptedKey = parsedStatus.encryptedKeys[viewerId] || null
              }
              statusesData.push(parsedStatus)
            }
          }
        }
      }

      if (statusesData.length > 0) {
        // Mark statuses as viewed
        const updatePromises = statusesData.map(async (status) => {
          await Status.updateOne(
            { statusId: status.statusId, "viewedBy.userId": { $ne: viewerId } },
            {
              $addToSet: {
                viewedBy: {
                  userId: viewerId,
                  at: new Date(),
                },
              },
            },
          )
        })

        await Promise.all(updatePromises)

        return res.status(200).json({
          success: true,
          data: statusesData.map((status) => ({
            statusId: status.statusId,
            userId: status.userId,
            type: status.type,
            content: status.content, // Encrypted content
            encryptedKey: status.encryptedKey || null, // Encrypted key for the viewer
            createdAt: status.createdAt,
            expiresAt: status.expiresAt,
          })),
        })
      }
    }

    // If not in Redis or no visible statuses, get from MongoDB
    const now = new Date()
    const statuses = await Status.find({
      userId,
      expiresAt: { $gt: now },
    }).sort({ createdAt: -1 })

    // Filter based on visibility
    const visibleStatuses = statuses.filter((status) => {
      if (status.visibleTo === "all") return true
      if (status.visibleTo === "contacts" && true) return true // In a real app, check if viewer is a contact
      if (status.visibleTo === "specific" && status.specificUsers && status.specificUsers.includes(viewerId))
        return true
      return false
    })

    // Filter out excluded users
    const accessibleStatuses = visibleStatuses.filter(
      (status) => !status.excludedUsers || !status.excludedUsers.includes(viewerId),
    )

    // Mark statuses as viewed
    const updatePromises = accessibleStatuses.map(async (status) => {
      const alreadyViewed = status.viewedBy.some((v) => v.userId.toString() === viewerId)
      if (!alreadyViewed) {
        status.viewedBy.push({
          userId: viewerId,
          at: new Date(),
        })
        await status.save()
      }
    })

    await Promise.all(updatePromises)

    // Cache in Redis for future requests
    const pipeline = redisClient.pipeline()
    for (const status of accessibleStatuses) {
      const ttl = Math.floor((status.expiresAt.getTime() - Date.now()) / 1000)
      if (ttl > 0) {
        pipeline.zadd(`user:${userId}:statuses`, new Date(status.createdAt).getTime(), status.statusId)

        const statusData = {
          statusId: status.statusId,
          userId: status.userId.toString(),
          type: status.type,
          content: status.content,
          mediaId: status.mediaId,
          backgroundColor: status.backgroundColor,
          fontStyle: status.fontStyle,
          visibleTo: status.visibleTo,
          encryptedKeys: status.encryptedKeys, // Include encrypted keys
          createdAt: status.createdAt.toISOString(),
          expiresAt: status.expiresAt.toISOString(),
        }

        pipeline.setex(`status:${status.statusId}`, ttl, JSON.stringify(statusData))
      }
    }
    await pipeline.exec()

    return res.status(200).json({
      success: true,
      data: accessibleStatuses.map((s) => ({
        statusId: s.statusId,
        userId: s.userId.toString(),
        type: s.type,
        content: s.content, // Encrypted content
        encryptedKey: s.encryptedKeys ? s.encryptedKeys[viewerId] || null : null, // Encrypted key for the viewer
        createdAt: s.createdAt,
        expiresAt: s.expiresAt,
      })),
    })
  } catch (error) {
    next(error)
  }
}

// Get status details
export const getStatusDetails = async (req, res, next) => {
  try {
    const { statusId } = req.params
    const { viewerId } = req.query

    // Try to get from Redis first
    const cachedStatus = await redisClient.get(`status:${statusId}`)

    if (cachedStatus) {
      const parsedStatus = JSON.parse(cachedStatus)

      // Check visibility permissions
      if (
        parsedStatus.visibleTo === "all" ||
        parsedStatus.userId === viewerId ||
        (parsedStatus.visibleTo === "contacts" && true) || // In a real app, check if viewer is a contact
        (parsedStatus.visibleTo === "specific" &&
          parsedStatus.specificUsers &&
          parsedStatus.specificUsers.includes(viewerId))
      ) {
        // Check if not in excluded users
        if (!parsedStatus.excludedUsers || !parsedStatus.excludedUsers.includes(viewerId)) {
          // Mark as viewed
          await Status.updateOne(
            { statusId, "viewedBy.userId": { $ne: viewerId } },
            {
              $addToSet: {
                viewedBy: {
                  userId: viewerId,
                  at: new Date(),
                },
              },
            },
          )

          return res.status(200).json({
            success: true,
            data: parsedStatus,
          })
        }
      }

      return res.status(403).json({
        success: false,
        message: "You do not have permission to view this status",
      })
    }

    // If not in Redis, get from MongoDB
    const status = await Status.findOne({ statusId })

    if (!status) {
      return res.status(404).json({
        success: false,
        message: "Status not found",
      })
    }

    // Check if expired
    if (status.expiresAt < new Date()) {
      return res.status(404).json({
        success: false,
        message: "Status has expired",
      })
    }

    // Check visibility permissions
    if (
      status.visibleTo === "all" ||
      status.userId.toString() === viewerId ||
      (status.visibleTo === "contacts" && true) || // In a real app, check if viewer is a contact
      (status.visibleTo === "specific" && status.specificUsers && status.specificUsers.includes(viewerId))
    ) {
      // Check if not in excluded users
      if (!status.excludedUsers || !status.excludedUsers.includes(viewerId)) {
        // Mark as viewed
        const alreadyViewed = status.viewedBy.some((v) => v.userId.toString() === viewerId)
        if (!alreadyViewed) {
          status.viewedBy.push({
            userId: viewerId,
            at: new Date(),
          })
          await status.save()
        }

        // Cache in Redis for future requests
        const ttl = Math.floor((status.expiresAt.getTime() - Date.now()) / 1000)
        if (ttl > 0) {
          const statusData = {
            statusId: status.statusId,
            userId: status.userId.toString(),
            type: status.type,
            content: status.content,
            mediaId: status.mediaId,
            backgroundColor: status.backgroundColor,
            fontStyle: status.fontStyle,
            visibleTo: status.visibleTo,
            createdAt: status.createdAt.toISOString(),
            expiresAt: status.expiresAt.toISOString(),
            viewCount: status.viewedBy.length,
          }

          await redisClient.setex(`status:${statusId}`, ttl, JSON.stringify(statusData))
        }

        return res.status(200).json({
          success: true,
          data: {
            statusId: status.statusId,
            userId: status.userId.toString(),
            type: status.type,
            content: status.content,
            mediaId: status.mediaId,
            backgroundColor: status.backgroundColor,
            fontStyle: status.fontStyle,
            createdAt: status.createdAt,
            expiresAt: status.expiresAt,
            viewCount: status.viewedBy.length,
          },
        })
      }
    }

    return res.status(403).json({
      success: false,
      message: "You do not have permission to view this status",
    })
  } catch (error) {
    next(error)
  }
}

// Delete a status
export const deleteStatus = async (req, res, next) => {
  try {
    const { statusId } = req.body
    const userId = req.body.userId

    // Find the status
    const status = await Status.findOne({ statusId })

    if (!status) {
      return res.status(404).json({
        success: false,
        message: "Status not found",
      })
    }

    // Check if user is the creator
    if (status.userId.toString() !== userId) {
      return res.status(403).json({
        success: false,
        message: "Only the creator can delete this status",
      })
    }

    // Delete status
    await Status.deleteOne({ statusId })

    // Clean up Redis
    await redisClient.del(`status:${statusId}`)
    await redisClient.zrem(`user:${userId}:statuses`, statusId)

    return res.status(200).json({
      success: true,
      message: "Status deleted successfully",
      data: {
        statusId,
      },
    })
  } catch (error) {
    next(error)
  }
}

// Get status viewers
export const getStatusViewers = async (req, res, next) => {
  try {
    const { statusId } = req.params
    const userId = req.query.userId

    // Find the status
    const status = await Status.findOne({ statusId }).populate("viewedBy.userId", "username")

    if (!status) {
      return res.status(404).json({
        success: false,
        message: "Status not found",
      })
    }

    // Check if user is the creator
    if (status.userId.toString() !== userId) {
      return res.status(403).json({
        success: false,
        message: "Only the creator can view status viewers",
      })
    }

    return res.status(200).json({
      success: true,
      data: {
        statusId,
        viewCount: status.viewedBy.length,
        viewers: status.viewedBy.map((v) => ({
          userId: v.userId._id,
          username: v.userId.username,
          viewedAt: v.at,
        })),
      },
    })
  } catch (error) {
    next(error)
  }
}

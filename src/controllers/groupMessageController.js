import { GroupMessage } from "../models/GroupMessage.js"
import { Group } from "../models/Group.js"
import { redisClient } from "../server.js"
import { io } from "../server.js"
import { encryptGroupMessage, generateMessageHash, generateMessageId } from "../utils/encryption.js"

// Send message to a group
export const sendGroupMessage = async (req, res, next) => {
  try {
    const { senderId, groupId, content, type = "text", mediaId = null, replyToId = null } = req.body

    // Check if group exists
    const group = await Group.findOne({ groupId })
    if (!group) {
      return res.status(404).json({
        success: false,
        message: "Group not found",
      })
    }

    // Check if sender is a member of the group
    const isMember = group.members.some((m) => m.userId.toString() === senderId)
    if (!isMember) {
      return res.status(403).json({
        success: false,
        message: "You are not a member of this group",
      })
    }

    // Check if only admins can send messages
    const isAdmin = group.members.some((m) => m.userId.toString() === senderId && m.role === "admin")
    if (group.settings.onlyAdminsCanSend && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: "Only admins can send messages in this group",
      })
    }

    // Check if replying to a valid message
    if (replyToId) {
      const originalMessage = await GroupMessage.findOne({ messageId: replyToId })
      if (!originalMessage) {
        return res.status(404).json({
          success: false,
          message: "Original message not found",
        })
      }
    }

    // Generate unique message ID
    const messageId = generateMessageId()

    // Encrypt message content for group
    const encryptedContent = await encryptGroupMessage(content, group.members)

    // Generate message hash for integrity verification
    const messageHash = generateMessageHash(encryptedContent)

    // Create message object
    const message = new GroupMessage({
      messageId,
      groupId,
      senderId,
      content: encryptedContent,
      contentHash: messageHash,
      type,
      mediaId,
      replyToId,
      sentAt: new Date(),
    })

    await message.save()

    // Store in Redis for faster retrieval
    const messageData = {
      messageId: message.messageId,
      groupId: message.groupId,
      senderId: message.senderId.toString(),
      content: message.content,
      contentHash: message.contentHash,
      type: message.type,
      mediaId: message.mediaId,
      replyToId: message.replyToId,
      sentAt: message.sentAt.toISOString(),
    }

    // Store in Redis with TTL (30 days)
    await redisClient.setex(
      `groupmessage:${messageId}`,
      2592000, // 30 days in seconds
      JSON.stringify(messageData),
    )

    // Add to group chat history
    await redisClient.zadd(`groupchat:${groupId}`, Date.now(), messageId)

    // Get member IDs for notifications
    const memberIds = group.members.filter((m) => m.userId.toString() !== senderId).map((m) => m.userId.toString())

    // Emit real-time event via Socket.io to all group members
    for (const memberId of memberIds) {
      io.to(memberId).emit("new_group_message", {
        messageId,
        groupId,
        senderId,
        type,
        mediaId,
        replyToId,
        sentAt: message.sentAt,
      })
    }

    return res.status(201).json({
      success: true,
      data: {
        messageId: message.messageId,
        groupId: message.groupId,
        sentAt: message.sentAt,
      },
    })
  } catch (error) {
    next(error)
  }
}

// Get group messages
export const getGroupMessages = async (req, res, next) => {
  try {
    const { groupId } = req.params
    const { userId } = req.query
    const { limit = 50, before } = req.query

    // Check if group exists
    const group = await Group.findOne({ groupId })
    if (!group) {
      return res.status(404).json({
        success: false,
        message: "Group not found",
      })
    }

    // Check if user is a member of the group
    const isMember = group.members.some((m) => m.userId.toString() === userId)
    if (!isMember) {
      return res.status(403).json({
        success: false,
        message: "You are not a member of this group",
      })
    }

    // Get message IDs from Redis sorted set
    let messageIds
    if (before) {
      messageIds = await redisClient.zrevrangebyscore(
        `groupchat:${groupId}`,
        before,
        "-inf",
        "LIMIT",
        0,
        Number.parseInt(limit),
      )
    } else {
      messageIds = await redisClient.zrevrange(`groupchat:${groupId}`, 0, Number.parseInt(limit) - 1)
    }

    // Get message data from Redis
    const messagePromises = messageIds.map(async (messageId) => {
      const messageData = await redisClient.get(`groupmessage:${messageId}`)
      return messageData ? JSON.parse(messageData) : null
    })

    const messages = (await Promise.all(messagePromises)).filter(Boolean)

    // If some messages are not in Redis, fetch from MongoDB
    if (messages.length < messageIds.length) {
      const missingIds = messageIds.filter((id) => !messages.some((msg) => msg.messageId === id))

      if (missingIds.length > 0) {
        const dbMessages = await GroupMessage.find({
          messageId: { $in: missingIds },
        }).lean()

        // Add to Redis for future requests
        for (const msg of dbMessages) {
          const messageData = {
            messageId: msg.messageId,
            groupId: msg.groupId,
            senderId: msg.senderId.toString(),
            content: msg.content,
            contentHash: msg.contentHash,
            type: msg.type,
            mediaId: msg.mediaId,
            replyToId: msg.replyToId,
            sentAt: msg.sentAt.toISOString(),
          }

          await redisClient.setex(
            `groupmessage:${msg.messageId}`,
            2592000, // 30 days
            JSON.stringify(messageData),
          )

          messages.push(messageData)
        }
      }
    }

    // Sort messages by sentAt timestamp
    messages.sort((a, b) => new Date(b.sentAt) - new Date(a.sentAt))

    // Update seen status for this user
    const updatePromises = messages.map(async (msg) => {
      // Check if message is already marked as seen by this user
      const seenByUser = await GroupMessage.findOne({
        messageId: msg.messageId,
        "seenBy.userId": userId,
      })

      if (!seenByUser && msg.senderId !== userId) {
        await GroupMessage.updateOne(
          { messageId: msg.messageId },
          {
            $addToSet: {
              seenBy: {
                userId,
                at: new Date(),
              },
            },
          },
        )
      }
    })

    await Promise.all(updatePromises)

    return res.status(200).json({
      success: true,
      data: messages,
    })
  } catch (error) {
    next(error)
  }
}

// Add reaction to group message
export const addGroupMessageReaction = async (req, res, next) => {
  try {
    const { userId, messageId, reaction } = req.body

    // Update message in MongoDB
    const message = await GroupMessage.findOneAndUpdate(
      { messageId },
      { $set: { [`reactions.${userId}`]: reaction } },
      { new: true },
    )

    if (!message) {
      return res.status(404).json({
        success: false,
        message: "Message not found",
      })
    }

    // Check if user is a member of the group
    const group = await Group.findOne({ groupId: message.groupId })
    if (!group) {
      return res.status(404).json({
        success: false,
        message: "Group not found",
      })
    }

    const isMember = group.members.some((m) => m.userId.toString() === userId)
    if (!isMember) {
      return res.status(403).json({
        success: false,
        message: "You are not a member of this group",
      })
    }

    // Update in Redis
    const messageData = await redisClient.get(`groupmessage:${messageId}`)
    if (messageData) {
      const parsedData = JSON.parse(messageData)
      if (!parsedData.reactions) {
        parsedData.reactions = {}
      }
      parsedData.reactions[userId] = reaction

      await redisClient.setex(
        `groupmessage:${messageId}`,
        2592000, // 30 days
        JSON.stringify(parsedData),
      )
    }

    // Emit reaction event to all group members
    const memberIds = group.members.map((m) => m.userId.toString())
    for (const memberId of memberIds) {
      io.to(memberId).emit("group_message_reaction", {
        messageId,
        groupId: message.groupId,
        userId,
        reaction,
      })
    }

    return res.status(200).json({
      success: true,
      data: {
        messageId,
        groupId: message.groupId,
        reaction,
      },
    })
  } catch (error) {
    next(error)
  }
}

// Delete group message
export const deleteGroupMessage = async (req, res, next) => {
  try {
    const { userId, messageId, deleteForEveryone = false } = req.body

    // Find the message
    const message = await GroupMessage.findOne({ messageId })

    if (!message) {
      return res.status(404).json({
        success: false,
        message: "Message not found",
      })
    }

    // Check if user is a member of the group
    const group = await Group.findOne({ groupId: message.groupId })
    if (!group) {
      return res.status(404).json({
        success: false,
        message: "Group not found",
      })
    }

    const isMember = group.members.some((m) => m.userId.toString() === userId)
    if (!isMember) {
      return res.status(403).json({
        success: false,
        message: "You are not a member of this group",
      })
    }

    // Check if user is the sender or an admin (only they can delete for everyone)
    const isAdmin = group.members.some((m) => m.userId.toString() === userId && m.role === "admin")
    const isSender = message.senderId.toString() === userId

    if (deleteForEveryone && !isSender && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: "Only the sender or an admin can delete for everyone",
      })
    }

    if (deleteForEveryone) {
      // Mark as deleted for everyone
      await GroupMessage.updateOne({ messageId }, { $set: { deletedForEveryone: true, deletedAt: new Date() } })

      // Update in Redis
      const messageData = await redisClient.get(`groupmessage:${messageId}`)
      if (messageData) {
        const parsedData = JSON.parse(messageData)
        parsedData.deletedForEveryone = true
        parsedData.deletedAt = new Date().toISOString()

        await redisClient.setex(
          `groupmessage:${messageId}`,
          2592000, // 30 days
          JSON.stringify(parsedData),
        )
      }

      // Notify all group members
      const memberIds = group.members.map((m) => m.userId.toString())
      for (const memberId of memberIds) {
        io.to(memberId).emit("group_message_deleted", {
          messageId,
          groupId: message.groupId,
          deleteForEveryone: true,
        })
      }
    } else {
      // Delete only for this user (client-side filtering)
      await redisClient.set(`groupmessage:${messageId}:deleted:${userId}`, "1")
    }

    return res.status(200).json({
      success: true,
      message: "Message deleted successfully",
      data: {
        messageId,
        groupId: message.groupId,
        deleteForEveryone,
      },
    })
  } catch (error) {
    next(error)
  }
}

// Update group message delivery status
export const updateGroupMessageStatus = async (req, res, next) => {
  try {
    const { userId, messageId, status } = req.body

    // Validate status
    if (status !== "delivered" && status !== "seen") {
      return res.status(400).json({
        success: false,
        message: "Invalid status",
      })
    }

    // Find message
    const message = await GroupMessage.findOne({ messageId })
    if (!message) {
      return res.status(404).json({
        success: false,
        message: "Message not found",
      })
    }

    // Check if user is a member of the group
    const group = await Group.findOne({ groupId: message.groupId })
    if (!group) {
      return res.status(404).json({
        success: false,
        message: "Group not found",
      })
    }

    const isMember = group.members.some((m) => m.userId.toString() === userId)
    if (!isMember) {
      return res.status(403).json({
        success: false,
        message: "You are not a member of this group",
      })
    }

    // Update status with timestamp
    if (status === "delivered") {
      await GroupMessage.updateOne(
        { messageId, "deliveredTo.userId": { $ne: userId } },
        {
          $addToSet: {
            deliveredTo: {
              userId,
              at: new Date(),
            },
          },
        },
      )
    } else if (status === "seen") {
      await GroupMessage.updateOne(
        { messageId, "seenBy.userId": { $ne: userId } },
        {
          $addToSet: {
            seenBy: {
              userId,
              at: new Date(),
            },
          },
        },
      )
    }

    // Notify sender about status update
    io.to(message.senderId.toString()).emit("group_message_status_update", {
      messageId,
      groupId: message.groupId,
      userId,
      status,
      timestamp: new Date(),
    })

    return res.status(200).json({
      success: true,
      data: {
        messageId,
        groupId: message.groupId,
        status,
        updatedAt: new Date(),
      },
    })
  } catch (error) {
    next(error)
  }
}

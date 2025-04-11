import { ChannelMessage } from "../models/ChannelMessage.js"
import { Channel } from "../models/Channel.js"
import { Community } from "../models/Community.js"
import { redisClient } from "../server.js"
import { io } from "../server.js"
import { encryptMessage, generateMessageHash, generateMessageId } from "../utils/encryption.js"

// Send message to a channel
export const sendChannelMessage = async (req, res, next) => {
  try {
    const { senderId, channelId, content, type = "text", mediaId = null, replyToId = null } = req.body

    // Check if channel exists
    const channel = await Channel.findOne({ channelId })
    if (!channel) {
      return res.status(404).json({
        success: false,
        message: "Channel not found",
      })
    }

    // Check if community exists
    const community = await Community.findOne({ communityId: channel.communityId })
    if (!community) {
      return res.status(404).json({
        success: false,
        message: "Community not found",
      })
    }

    // Check if sender is a member of the community
    const isMember = community.members.some((m) => m.userId.toString() === senderId)
    if (!isMember) {
      return res.status(403).json({
        success: false,
        message: "You are not a member of this community",
      })
    }

    // Check if channel is private and user has access
    if (channel.isPrivate) {
      const hasAccess = channel.allowedMembers.includes(senderId) || channel.moderators.includes(senderId)
      if (!hasAccess) {
        return res.status(403).json({
          success: false,
          message: "You do not have access to this channel",
        })
      }
    }

    // Check if replying to a valid message
    if (replyToId) {
      const originalMessage = await ChannelMessage.findOne({ messageId: replyToId })
      if (!originalMessage) {
        return res.status(404).json({
          success: false,
          message: "Original message not found",
        })
      }
    }

    // Generate unique message ID
    const messageId = generateMessageId()

    const publicKey = community.publicKey

    // Encrypt message content
    const encryptedContent = await encryptMessage(content, publicKey) // Use community's public key

    // Generate message hash for integrity verification
    const messageHash = generateMessageHash(encryptedContent)

    // Create message object
    const message = new ChannelMessage({
      messageId,
      channelId,
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
      channelId: message.channelId,
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
      `channelmessage:${messageId}`,
      2592000, // 30 days in seconds
      JSON.stringify(messageData),
    )

    // Add to channel chat history
    await redisClient.zadd(`channelchat:${channelId}`, Date.now(), messageId)

    // Get community members for notifications
    let memberIds = []
    if (channel.isPrivate) {
      // Only notify allowed members and moderators
      memberIds = [...channel.allowedMembers, ...channel.moderators].filter((id) => id.toString() !== senderId)
    } else {
      // Notify all community members
      memberIds = community.members.filter((m) => m.userId.toString() !== senderId).map((m) => m.userId.toString())
    }

    // Emit real-time event via Socket.io to all relevant members
    for (const memberId of memberIds) {
      io.to(memberId).emit("new_channel_message", {
        messageId,
        channelId,
        communityId: channel.communityId,
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
        channelId: message.channelId,
        sentAt: message.sentAt,
      },
    })
  } catch (error) {
    next(error)
  }
}

// Get channel messages
export const getChannelMessages = async (req, res, next) => {
  try {
    const { channelId } = req.params
    const { userId } = req.query
    const { limit = 50, before } = req.query

    // Check if channel exists
    const channel = await Channel.findOne({ channelId })
    if (!channel) {
      return res.status(404).json({
        success: false,
        message: "Channel not found",
      })
    }

    // Check if community exists
    const community = await Community.findOne({ communityId: channel.communityId })
    if (!community) {
      return res.status(404).json({
        success: false,
        message: "Community not found",
      })
    }

    // Check if user is a member of the community
    const isMember = community.members.some((m) => m.userId.toString() === userId)
    if (!isMember) {
      return res.status(403).json({
        success: false,
        message: "You are not a member of this community",
      })
    }

    // Check if channel is private and user has access
    if (channel.isPrivate) {
      const hasAccess = channel.allowedMembers.includes(userId) || channel.moderators.includes(userId)
      if (!hasAccess) {
        return res.status(403).json({
          success: false,
          message: "You do not have access to this channel",
        })
      }
    }

    // Get message IDs from Redis sorted set
    let messageIds
    if (before) {
      messageIds = await redisClient.zrevrangebyscore(
        `channelchat:${channelId}`,
        before,
        "-inf",
        "LIMIT",
        0,
        Number.parseInt(limit),
      )
    } else {
      messageIds = await redisClient.zrevrange(`channelchat:${channelId}`, 0, Number.parseInt(limit) - 1)
    }

    // Get message data from Redis
    const messagePromises = messageIds.map(async (messageId) => {
      const messageData = await redisClient.get(`channelmessage:${messageId}`)
      return messageData ? JSON.parse(messageData) : null
    })

    const messages = (await Promise.all(messagePromises)).filter(Boolean)

    // If some messages are not in Redis, fetch from MongoDB
    if (messages.length < messageIds.length) {
      const missingIds = messageIds.filter((id) => !messages.some((msg) => msg.messageId === id))

      if (missingIds.length > 0) {
        const dbMessages = await ChannelMessage.find({
          messageId: { $in: missingIds },
        }).lean()

        // Add to Redis for future requests
        for (const msg of dbMessages) {
          const messageData = {
            messageId: msg.messageId,
            channelId: msg.channelId,
            senderId: msg.senderId.toString(),
            content: msg.content,
            contentHash: msg.contentHash,
            type: msg.type,
            mediaId: msg.mediaId,
            replyToId: msg.replyToId,
            sentAt: msg.sentAt.toISOString(),
          }

          await redisClient.setex(
            `channelmessage:${msg.messageId}`,
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
      const seenByUser = await ChannelMessage.findOne({
        messageId: msg.messageId,
        "seenBy.userId": userId,
      })

      if (!seenByUser && msg.senderId !== userId) {
        await ChannelMessage.updateOne(
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

// Pin a channel message
export const pinChannelMessage = async (req, res, next) => {
  try {
    const { messageId } = req.body
    const userId = req.body.userId

    // Find the message
    const message = await ChannelMessage.findOne({ messageId })
    if (!message) {
      return res.status(404).json({
        success: false,
        message: "Message not found",
      })
    }

    // Check if channel exists
    const channel = await Channel.findOne({ channelId: message.channelId })
    if (!channel) {
      return res.status(404).json({
        success: false,
        message: "Channel not found",
      })
    }

    // Check if user is a moderator
    const isModerator = channel.moderators.includes(userId)
    if (!isModerator) {
      return res.status(403).json({
        success: false,
        message: "Only moderators can pin messages",
      })
    }

    // Update message
    message.isPinned = true
    await message.save()

    // Update in Redis
    const messageData = await redisClient.get(`channelmessage:${messageId}`)
    if (messageData) {
      const parsedData = JSON.parse(messageData)
      parsedData.isPinned = true

      await redisClient.setex(
        `channelmessage:${messageId}`,
        2592000, // 30 days
        JSON.stringify(parsedData),
      )
    }

    // Add to pinned messages list
    await redisClient.zadd(`channel:${message.channelId}:pinned`, Date.now(), messageId)

    // Notify channel members
    const community = await Community.findOne({ communityId: channel.communityId })
    if (community) {
      let memberIds = []
      if (channel.isPrivate) {
        memberIds = [...channel.allowedMembers, ...channel.moderators]
      } else {
        memberIds = community.members.map((m) => m.userId.toString())
      }

      for (const memberId of memberIds) {
        io.to(memberId).emit("channel_message_pinned", {
          messageId,
          channelId: message.channelId,
          communityId: channel.communityId,
          pinnedBy: userId,
          pinnedAt: new Date(),
        })
      }
    }

    return res.status(200).json({
      success: true,
      data: {
        messageId,
        channelId: message.channelId,
        isPinned: true,
      },
    })
  } catch (error) {
    next(error)
  }
}

// Get pinned messages in a channel
export const getPinnedChannelMessages = async (req, res, next) => {
  try {
    const { channelId } = req.params
    const { userId } = req.query

    // Check if channel exists
    const channel = await Channel.findOne({ channelId })
    if (!channel) {
      return res.status(404).json({
        success: false,
        message: "Channel not found",
      })
    }

    // Check if user has access to the channel
    const community = await Community.findOne({ communityId: channel.communityId })
    if (!community) {
      return res.status(404).json({
        success: false,
        message: "Community not found",
      })
    }

    const isMember = community.members.some((m) => m.userId.toString() === userId)
    if (!isMember) {
      return res.status(403).json({
        success: false,
        message: "You are not a member of this community",
      })
    }

    if (channel.isPrivate) {
      const hasAccess = channel.allowedMembers.includes(userId) || channel.moderators.includes(userId)
      if (!hasAccess) {
        return res.status(403).json({
          success: false,
          message: "You do not have access to this channel",
        })
      }
    }

    // Get pinned message IDs from Redis
    const pinnedIds = await redisClient.zrevrange(`channel:${channelId}:pinned`, 0, -1)

    if (pinnedIds.length > 0) {
      // Get message data from Redis
      const messagePromises = pinnedIds.map(async (messageId) => {
        const messageData = await redisClient.get(`channelmessage:${messageId}`)
        return messageData ? JSON.parse(messageData) : null
      })

      const messages = (await Promise.all(messagePromises)).filter(Boolean)

      // If some messages are not in Redis, fetch from MongoDB
      if (messages.length < pinnedIds.length) {
        const missingIds = pinnedIds.filter((id) => !messages.some((msg) => msg.messageId === id))

        if (missingIds.length > 0) {
          const dbMessages = await ChannelMessage.find({
            messageId: { $in: missingIds },
            isPinned: true,
          }).lean()

          // Add to Redis for future requests
          for (const msg of dbMessages) {
            const messageData = {
              messageId: msg.messageId,
              channelId: msg.channelId,
              senderId: msg.senderId.toString(),
              content: msg.content,
              contentHash: msg.contentHash,
              type: msg.type,
              mediaId: msg.mediaId,
              replyToId: msg.replyToId,
              isPinned: true,
              sentAt: msg.sentAt.toISOString(),
            }

            await redisClient.setex(
              `channelmessage:${msg.messageId}`,
              2592000, // 30 days
              JSON.stringify(messageData),
            )

            messages.push(messageData)
          }
        }
      }

      return res.status(200).json({
        success: true,
        data: messages,
      })
    }

    // If not in Redis, get from MongoDB
    const pinnedMessages = await ChannelMessage.find({
      channelId,
      isPinned: true,
    }).sort({ sentAt: -1 })

    // Cache in Redis for future requests
    const pipeline = redisClient.pipeline()
    for (const msg of pinnedMessages) {
      pipeline.zadd(`channel:${channelId}:pinned`, new Date(msg.sentAt).getTime(), msg.messageId)

      const messageData = {
        messageId: msg.messageId,
        channelId: msg.channelId,
        senderId: msg.senderId.toString(),
        content: msg.content,
        contentHash: msg.contentHash,
        type: msg.type,
        mediaId: msg.mediaId,
        replyToId: msg.replyToId,
        isPinned: true,
        sentAt: msg.sentAt.toISOString(),
      }

      pipeline.setex(
        `channelmessage:${msg.messageId}`,
        2592000, // 30 days
        JSON.stringify(messageData),
      )
    }
    await pipeline.exec()

    return res.status(200).json({
      success: true,
      data: pinnedMessages.map((msg) => ({
        messageId: msg.messageId,
        channelId: msg.channelId,
        senderId: msg.senderId.toString(),
        content: msg.content,
        type: msg.type,
        mediaId: msg.mediaId,
        replyToId: msg.replyToId,
        isPinned: true,
        sentAt: msg.sentAt,
      })),
    })
  } catch (error) {
    next(error)
  }
}

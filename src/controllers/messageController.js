import { Message } from "../models/Message.js"
import { User } from "../models/User.js"
import { redisClient } from "../server.js"
import { encryptMessage, generateMessageHash, generateMessageId } from "../utils/encryption.js"
import { io } from "../server.js"

export const sendMessage = async (req, res, next) => {
  try {
    const {
      senderId,
      recipientId,
      encryptedContent, // Must come pre-encrypted from client
      type = "text",
      mediaId = null,
      replyToId = null,
    } = req.body;

    // Check if recipient has blocked the sender
    const isBlocked = await redisClient.sismember(`user:${recipientId}:blocked`, senderId);
    if (isBlocked) {
      return res.status(403).json({
        success: false,
        message: "Cannot send message to this user",
      });
    }

    // Validate structure of the encrypted message (optional but safe)
    let parsedEncrypted;
    try {
      parsedEncrypted = JSON.parse(encryptedContent);
      if (!parsedEncrypted.message || !parsedEncrypted.key || !parsedEncrypted.iv) {
        throw new Error("Invalid encrypted structure");
      }
    } catch (err) {
      return res.status(400).json({
        success: false,
        message: "Encrypted message structure is invalid",
      });
    }

    // Generate unique message ID
    const messageId = generateMessageId();

    // Generate hash for integrity check
    const messageHash = generateMessageHash(encryptedContent);

    // Store message
    const message = new Message({
      messageId,
      senderId,
      recipientId,
      content: encryptedContent,
      contentHash: messageHash,
      type,
      mediaId,
      replyToId,
      status: "sent",
      sentAt: new Date(),
      deliveredAt: null,
      seenAt: null,
    });

    await message.save();

    // Store in Redis for fast access
    const messageData = {
      messageId,
      senderId: message.senderId.toString(),
      recipientId: message.recipientId.toString(),
      content: message.content,
      contentHash: message.contentHash,
      type: message.type,
      mediaId: message.mediaId,
      replyToId: message.replyToId,
      status: message.status,
      sentAt: message.sentAt.toISOString(),
      deliveredAt: null,
      seenAt: null,
    };

    await redisClient.setex(
      `message:${messageId}`,
      2592000, // 30 days
      JSON.stringify(messageData)
    );

    // Add to chat lists
    await redisClient.zadd(`chat:${senderId}:${recipientId}`, Date.now(), messageId);
    await redisClient.zadd(`chat:${recipientId}:${senderId}`, Date.now(), messageId);

    // Emit via socket (only metadata — NOT encrypted content)
    io.to(recipientId).emit("new_message", {
      messageId,
      senderId,
      type,
      mediaId,
      replyToId,
      sentAt: message.sentAt,
    });

    return res.status(201).json({
      success: true,
      data: {
        messageId: message.messageId,
        status: message.status,
        sentAt: message.sentAt,
      },
    });
  } catch (error) {
    next(error);
  }
};


export const getMessages = async (req, res, next) => {
  try {
    const { userId, recipientId } = req.params
    const { limit = 50, before } = req.query

    // Get message IDs from Redis sorted set
    let messageIds
    if (before) {
      messageIds = await redisClient.zrevrangebyscore(
        `chat:${userId}:${recipientId}`,
        before,
        "-inf",
        "LIMIT",
        0,
        Number.parseInt(limit),
      )
    } else {
      messageIds = await redisClient.zrevrange(`chat:${userId}:${recipientId}`, 0, Number.parseInt(limit) - 1)
    }

    // Get message data from Redis
    const messagePromises = messageIds.map(async (messageId) => {
      const messageData = await redisClient.get(`message:${messageId}`)
      return messageData ? JSON.parse(messageData) : null
    })

    const messages = (await Promise.all(messagePromises)).filter(Boolean)

    // If some messages are not in Redis, fetch from MongoDB
    if (messages.length < messageIds.length) {
      const missingIds = messageIds.filter((id) => !messages.some((msg) => msg.messageId === id))

      if (missingIds.length > 0) {
        const dbMessages = await Message.find({
          messageId: { $in: missingIds },
        }).lean()

        // Add to Redis for future requests
        for (const msg of dbMessages) {
          const messageData = {
            messageId: msg.messageId,
            senderId: msg.senderId.toString(),
            recipientId: msg.recipientId.toString(),
            content: msg.content,
            contentHash: msg.contentHash,
            type: msg.type,
            mediaId: msg.mediaId,
            replyToId: msg.replyToId,
            status: msg.status,
            sentAt: msg.sentAt.toISOString(),
            deliveredAt: msg.deliveredAt ? msg.deliveredAt.toISOString() : null,
            seenAt: msg.seenAt ? msg.seenAt.toISOString() : null,
          }

          await redisClient.setex(
            `message:${msg.messageId}`,
            2592000, // 30 days
            JSON.stringify(messageData),
          )

          messages.push(messageData)
        }
      }
    }

    // Sort messages by sentAt timestamp
    messages.sort((a, b) => new Date(b.sentAt) - new Date(a.sentAt))

    return res.status(200).json({
      success: true,
      data: messages,
    })
  } catch (error) {
    next(error)
  }
}

export const sendTypingIndicator = async (req, res, next) => {
  try {
    const { senderId, recipientId, isTyping } = req.body;

    if (!senderId || !recipientId) {
      return res.status(400).json({
        success: false,
        message: "Missing senderId or recipientId",
      });
    }

    const timestamp = new Date();

    // Emit real-time typing event via Socket.io
    io.to(recipientId).emit("typing_indicator", {
      senderId,
      isTyping,
      timestamp,
    });

    const redisKey = `typing:${senderId}:${recipientId}`;

    if (isTyping) {
      // Extend TTL to 7 seconds (heartbeat-like behavior)
      await redisClient.setex(redisKey, 7, "1");
    } else {
      // Manually clear if user stops typing or sends message
      await redisClient.del(redisKey);
    }

    return res.status(200).json({
      success: true,
      message: "Typing indicator updated",
      data: {
        senderId,
        recipientId,
        isTyping,
        timestamp,
      },
    });
  } catch (error) {
    next(error);
  }
};


export const replyToMessage = async (req, res, next) => {
  try {
    const { senderId, recipientId, content, replyToId, type = "text", mediaId = null } = req.body

    // Check if original message exists
    const originalMessage = await Message.findOne({ messageId: replyToId })
    if (!originalMessage) {
      return res.status(404).json({
        success: false,
        message: "Original message not found",
      })
    }

    // Use the sendMessage logic with replyToId
    req.body.replyToId = replyToId
    return sendMessage(req, res, next)
  } catch (error) {
    next(error)
  }
}

export const addReaction = async (req, res, next) => {
  try {
    const { userId, messageId, reaction } = req.body

    // Update message in MongoDB
    const message = await Message.findOneAndUpdate(
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

    // Update in Redis
    const messageData = await redisClient.get(`message:${messageId}`)
    if (messageData) {
      const parsedData = JSON.parse(messageData)
      if (!parsedData.reactions) {
        parsedData.reactions = {}
      }
      parsedData.reactions[userId] = reaction

      await redisClient.setex(
        `message:${messageId}`,
        2592000, // 30 days
        JSON.stringify(parsedData),
      )
    }

    // Emit reaction event
    io.to(message.recipientId.toString()).emit("message_reaction", {
      messageId,
      userId,
      reaction,
    })

    return res.status(200).json({
      success: true,
      data: {
        messageId,
        reaction,
      },
    })
  } catch (error) {
    next(error)
  }
}

export const deleteMessage = async (req, res, next) => {
  try {
    const { userId, messageId, deleteForEveryone = false } = req.body

    // Find the message
    const message = await Message.findOne({ messageId })

    if (!message) {
      return res.status(404).json({
        success: false,
        message: "Message not found",
      })
    }

    // Check if user is the sender (only sender can delete for everyone)
    if (deleteForEveryone && message.senderId.toString() !== userId) {
      return res.status(403).json({
        success: false,
        message: "Only the sender can delete for everyone",
      })
    }

    if (deleteForEveryone) {
      // Mark as deleted for everyone
      await Message.updateOne({ messageId }, { $set: { deletedForEveryone: true, deletedAt: new Date() } })

      // Update in Redis
      const messageData = await redisClient.get(`message:${messageId}`)
      if (messageData) {
        const parsedData = JSON.parse(messageData)
        parsedData.deletedForEveryone = true
        parsedData.deletedAt = new Date().toISOString()

        await redisClient.setex(
          `message:${messageId}`,
          2592000, // 30 days
          JSON.stringify(parsedData),
        )
      }

      // Notify recipient
      io.to(message.recipientId.toString()).emit("message_deleted", {
        messageId,
        deleteForEveryone: true,
      })
    } else {
      // Delete only for this user
      if (message.senderId.toString() === userId) {
        await Message.updateOne({ messageId }, { $set: { deletedForSender: true } })
      } else {
        await Message.updateOne({ messageId }, { $set: { deletedForRecipient: true } })
      }

      // Update in Redis for this user's view
      const userSpecificKey = `message:${messageId}:deleted:${userId}`
      await redisClient.set(userSpecificKey, "1")
    }

    return res.status(200).json({
      success: true,
      message: "Message deleted successfully",
      deleteForEveryone,
    })
  } catch (error) {
    next(error)
  }
}

export const scheduleMessage = async (req, res, next) => {
  try {
    const { senderId, recipientId, encryptedContent, type = "text", mediaId = null, scheduledFor } = req.body

    // Validate scheduled time
    const scheduledTime = new Date(scheduledFor)
    if (scheduledTime <= new Date()) {
      return res.status(400).json({
        success: false,
        message: "Scheduled time must be in the future",
      })
    }

    // Generate message ID
    const messageId = generateMessageId()

    // Store scheduled message in Redis
    const scheduledMessage = {
      messageId,
      senderId,
      recipientId,
      encryptedContent,
      type,
      mediaId,
      scheduledFor: scheduledTime.toISOString(),
    }

    // Calculate delay in seconds
    const delayInSeconds = Math.floor((scheduledTime.getTime() - Date.now()) / 1000)

    // Store in Redis with key that expires
    await redisClient.setex(`scheduled:${messageId}`, delayInSeconds, JSON.stringify(scheduledMessage))

    // Add to user's scheduled messages list
    await redisClient.zadd(`user:${senderId}:scheduled`, scheduledTime.getTime(), messageId)

    return res.status(201).json({
      success: true,
      data: {
        messageId,
        scheduledFor: scheduledTime,
      },
    })
  } catch (error) {
    next(error)
  }
}


export const getUserPublicKey = async (req, res, next) => {
  try {
    const { userId } = req.params

    // Validate userId
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "Missing userId",
      })
    }

    const user = await User.findOne({ userId }).select("publicKey")

    console.log(user)
    if (!user || !user.publicKey) {
      return res.status(404).json({
        success: false,
        message: "User or public key not found",
      })
    }

    

    return res.status(200).json({
      success: true,
      data: {
        userId,
        publicKey: user.publicKey,
      },
    })
  } catch (err) {
    next(err)
  }
}

import { Community } from "../models/Community.js"
import { Channel } from "../models/Channel.js"
import { User } from "../models/User.js"
import { redisClient } from "../server.js"
import { v4 as uuidv4 } from "uuid"

// Create a new community
export const createCommunity = async (req, res, next) => {
  try {
    const { name, description, isPrivate, avatar, coverImage } = req.body
    const createdBy = req.body.userId

    // Generate unique community ID
    const communityId = `comm_${uuidv4().replace(/-/g, "")}`

    // Validate creator exists
    const creator = await User.findById(createdBy)
    if (!creator) {
      return res.status(404).json({
        success: false,
        message: "Creator not found",
      })
    }

    // Create the community
    const community = new Community({
      communityId,
      name,
      description: description || "",
      avatar: avatar || null,
      coverImage: coverImage || null,
      createdBy,
      admins: [createdBy],
      members: [
        {
          userId: createdBy,
          role: "admin",
          joinedAt: new Date(),
        },
      ],
      channels: [],
      isPrivate: isPrivate || false,
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    await community.save()

    // Create default general channel
    const generalChannelId = `chan_${uuidv4().replace(/-/g, "")}`
    const generalChannel = new Channel({
      channelId: generalChannelId,
      communityId,
      name: "general",
      description: "General discussion channel",
      type: "text",
      createdBy,
      moderators: [createdBy],
      isPrivate: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    await generalChannel.save()

    // Add channel to community
    community.channels.push(generalChannelId)
    await community.save()

    // Cache community data in Redis
    await redisClient.hset(
      `community:${communityId}`,
      "name",
      name,
      "description",
      description || "",
      "createdBy",
      createdBy.toString(),
      "isPrivate",
      isPrivate ? "1" : "0",
      "createdAt",
      new Date().toISOString(),
    )

    // Add community to user's communities list
    await redisClient.sadd(`user:${createdBy}:communities`, communityId)

    return res.status(201).json({
      success: true,
      data: {
        communityId: community.communityId,
        name: community.name,
        description: community.description,
        createdBy: community.createdBy,
        defaultChannel: generalChannelId,
        isPrivate: community.isPrivate,
        createdAt: community.createdAt,
      },
    })
  } catch (error) {
    next(error)
  }
}

// Get community details
export const getCommunityDetails = async (req, res, next) => {
  try {
    const { communityId } = req.params
    const { userId } = req.query

    // Try to get from Redis first
    const cachedCommunity = await redisClient.hgetall(`community:${communityId}`)

    if (cachedCommunity && Object.keys(cachedCommunity).length > 0) {
      // Check if private and user is a member
      if (cachedCommunity.isPrivate === "1") {
        const isMember = await redisClient.sismember(`community:${communityId}:members`, userId)
        if (!isMember && cachedCommunity.createdBy !== userId) {
          return res.status(403).json({
            success: false,
            message: "This community is private",
          })
        }
      }

      // Get channels from Redis
      const channelIds = await redisClient.smembers(`community:${communityId}:channels`)

      return res.status(200).json({
        success: true,
        data: {
          communityId,
          name: cachedCommunity.name,
          description: cachedCommunity.description,
          createdBy: cachedCommunity.createdBy,
          isPrivate: cachedCommunity.isPrivate === "1",
          channelIds,
          createdAt: cachedCommunity.createdAt,
        },
      })
    }

    // If not in Redis, get from MongoDB
    const community = await Community.findOne({ communityId })
      .populate("members.userId", "username")
      .populate("admins", "username")

    if (!community) {
      return res.status(404).json({
        success: false,
        message: "Community not found",
      })
    }

    // Check if private and user is a member
    if (community.isPrivate) {
      const isMember = community.members.some((m) => m.userId._id.toString() === userId)
      const isCreator = community.createdBy.toString() === userId
      if (!isMember && !isCreator) {
        return res.status(403).json({
          success: false,
          message: "This community is private",
        })
      }
    }

    // Cache in Redis for future requests
    await redisClient.hset(
      `community:${communityId}`,
      "name",
      community.name,
      "description",
      community.description || "",
      "createdBy",
      community.createdBy.toString(),
      "isPrivate",
      community.isPrivate ? "1" : "0",
      "createdAt",
      community.createdAt.toISOString(),
    )

    // Cache members and channels in Redis
    const pipeline = redisClient.pipeline()
    for (const member of community.members) {
      pipeline.sadd(`community:${communityId}:members`, member.userId._id.toString())
      pipeline.sadd(`user:${member.userId._id}:communities`, communityId)
    }
    for (const channelId of community.channels) {
      pipeline.sadd(`community:${communityId}:channels`, channelId)
    }
    await pipeline.exec()

    return res.status(200).json({
      success: true,
      data: {
        communityId: community.communityId,
        name: community.name,
        description: community.description,
        avatar: community.avatar,
        coverImage: community.coverImage,
        createdBy: community.createdBy,
        admins: community.admins.map((a) => ({
          userId: a._id,
          username: a.username,
        })),
        members: community.members.map((m) => ({
          userId: m.userId._id,
          username: m.userId.username,
          role: m.role,
          joinedAt: m.joinedAt,
        })),
        channels: community.channels,
        isPrivate: community.isPrivate,
        createdAt: community.createdAt,
        updatedAt: community.updatedAt,
      },
    })
  } catch (error) {
    next(error)
  }
}

// Join a community
export const joinCommunity = async (req, res, next) => {
  try {
    const { communityId } = req.body
    const userId = req.body.userId

    // Validate community exists
    const community = await Community.findOne({ communityId })
    if (!community) {
      return res.status(404).json({
        success: false,
        message: "Community not found",
      })
    }

    // Check if already a member
    const isMember = community.members.some((m) => m.userId.toString() === userId)
    if (isMember) {
      return res.status(400).json({
        success: false,
        message: "Already a member of this community",
      })
    }

    // Check if private
    if (community.isPrivate) {
      return res.status(403).json({
        success: false,
        message: "This community is private. You need an invitation to join.",
      })
    }

    // Add user to community
    community.members.push({
      userId,
      role: "member",
      joinedAt: new Date(),
    })

    community.updatedAt = new Date()
    await community.save()

    // Update Redis
    await redisClient.sadd(`community:${communityId}:members`, userId)
    await redisClient.sadd(`user:${userId}:communities`, communityId)

    return res.status(200).json({
      success: true,
      message: "Successfully joined the community",
      data: {
        communityId,
        userId,
        role: "member",
        joinedAt: new Date(),
      },
    })
  } catch (error) {
    next(error)
  }
}

// Leave a community
export const leaveCommunity = async (req, res, next) => {
  try {
    const { communityId } = req.body
    const userId = req.body.userId

    // Validate community exists
    const community = await Community.findOne({ communityId })
    if (!community) {
      return res.status(404).json({
        success: false,
        message: "Community not found",
      })
    }

    // Check if a member
    const memberIndex = community.members.findIndex((m) => m.userId.toString() === userId)
    if (memberIndex === -1) {
      return res.status(400).json({
        success: false,
        message: "Not a member of this community",
      })
    }

    // Check if the last admin
    const isAdmin = community.members[memberIndex].role === "admin"
    const adminCount = community.members.filter((m) => m.role === "admin").length

    if (isAdmin && adminCount === 1) {
      return res.status(400).json({
        success: false,
        message: "Cannot leave community as the last admin. Transfer ownership first.",
      })
    }

    // Remove from admins if admin
    if (isAdmin) {
      community.admins = community.admins.filter((a) => a.toString() !== userId)
    }

    // Remove from members
    community.members.splice(memberIndex, 1)
    community.updatedAt = new Date()
    await community.save()

    // Update Redis
    await redisClient.srem(`community:${communityId}:members`, userId)
    await redisClient.srem(`user:${userId}:communities`, communityId)

    return res.status(200).json({
      success: true,
      message: "Successfully left the community",
      data: {
        communityId,
        userId,
      },
    })
  } catch (error) {
    next(error)
  }
}

// Create a channel in a community
export const createChannel = async (req, res, next) => {
  try {
    const { communityId, name, description, type, isPrivate, allowedMembers } = req.body
    const userId = req.body.userId

    // Validate community exists
    const community = await Community.findOne({ communityId })
    if (!community) {
      return res.status(404).json({
        success: false,
        message: "Community not found",
      })
    }

    // Check if user is an admin
    const isAdmin = community.admins.some((a) => a.toString() === userId)
    if (!isAdmin) {
      return res.status(403).json({
        success: false,
        message: "Only admins can create channels",
      })
    }

    // Generate unique channel ID
    const channelId = `chan_${uuidv4().replace(/-/g, "")}`

    // Create the channel
    const channel = new Channel({
      channelId,
      communityId,
      name,
      description: description || "",
      type: type || "text",
      createdBy: userId,
      moderators: [userId],
      isPrivate: isPrivate || false,
      allowedMembers: isPrivate ? allowedMembers || [] : [],
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    await channel.save()

    // Add channel to community
    community.channels.push(channelId)
    community.updatedAt = new Date()
    await community.save()

    // Update Redis
    await redisClient.sadd(`community:${communityId}:channels`, channelId)
    await redisClient.hset(
      `channel:${channelId}`,
      "name",
      name,
      "description",
      description || "",
      "type",
      type || "text",
      "communityId",
      communityId,
      "isPrivate",
      isPrivate ? "1" : "0",
      "createdAt",
      new Date().toISOString(),
    )

    return res.status(201).json({
      success: true,
      data: {
        channelId: channel.channelId,
        communityId: channel.communityId,
        name: channel.name,
        description: channel.description,
        type: channel.type,
        isPrivate: channel.isPrivate,
        createdAt: channel.createdAt,
      },
    })
  } catch (error) {
    next(error)
  }
}

// Get channels in a community
export const getCommunityChannels = async (req, res, next) => {
  try {
    const { communityId } = req.params
    const { userId } = req.query

    // Validate community exists
    const community = await Community.findOne({ communityId })
    if (!community) {
      return res.status(404).json({
        success: false,
        message: "Community not found",
      })
    }

    // Check if user is a member
    const isMember = community.members.some((m) => m.userId.toString() === userId)
    if (!isMember && community.isPrivate) {
      return res.status(403).json({
        success: false,
        message: "Not a member of this community",
      })
    }

    // Get channels from Redis first
    const channelIds = await redisClient.smembers(`community:${communityId}:channels`)

    if (channelIds.length > 0) {
      const channelsData = []

      for (const channelId of channelIds) {
        const channelData = await redisClient.hgetall(`channel:${channelId}`)
        if (Object.keys(channelData).length > 0) {
          // Check if private channel and user has access
          if (channelData.isPrivate === "1") {
            const hasAccess = await redisClient.sismember(`channel:${channelId}:allowed`, userId)
            const isModerator = await redisClient.sismember(`channel:${channelId}:moderators`, userId)
            if (!hasAccess && !isModerator) {
              continue
            }
          }

          channelsData.push({
            channelId,
            communityId,
            name: channelData.name,
            description: channelData.description,
            type: channelData.type,
            isPrivate: channelData.isPrivate === "1",
            createdAt: channelData.createdAt,
          })
        }
      }

      if (channelsData.length > 0) {
        return res.status(200).json({
          success: true,
          data: channelsData,
        })
      }
    }

    // If not in Redis, get from MongoDB
    const channels = await Channel.find({ communityId })

    // Filter private channels user doesn't have access to
    const accessibleChannels = channels.filter((channel) => {
      if (!channel.isPrivate) return true
      if (channel.moderators.includes(userId)) return true
      if (channel.allowedMembers.includes(userId)) return true
      return false
    })

    // Cache in Redis for future requests
    const pipeline = redisClient.pipeline()
    for (const channel of accessibleChannels) {
      pipeline.sadd(`community:${communityId}:channels`, channel.channelId)
      pipeline.hset(
        `channel:${channel.channelId}`,
        "name",
        channel.name,
        "description",
        channel.description || "",
        "type",
        channel.type,
        "communityId",
        communityId,
        "isPrivate",
        channel.isPrivate ? "1" : "0",
        "createdAt",
        channel.createdAt.toISOString(),
      )

      // Cache moderators and allowed members
      for (const moderatorId of channel.moderators) {
        pipeline.sadd(`channel:${channel.channelId}:moderators`, moderatorId.toString())
      }
      if (channel.isPrivate) {
        for (const memberId of channel.allowedMembers) {
          pipeline.sadd(`channel:${channel.channelId}:allowed`, memberId.toString())
        }
      }
    }
    await pipeline.exec()

    return res.status(200).json({
      success: true,
      data: accessibleChannels.map((c) => ({
        channelId: c.channelId,
        communityId: c.communityId,
        name: c.name,
        description: c.description,
        type: c.type,
        isPrivate: c.isPrivate,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
      })),
    })
  } catch (error) {
    next(error)
  }
}

// List user's communities
export const getUserCommunities = async (req, res, next) => {
  try {
    const { userId } = req.params

    // Try to get from Redis first
    const commun  => 
  try {
    const { userId } = req.params

    // Try to get from Redis first
    const communityIds = await redisClient.smembers(`user:${userId}:communities`)

    if (communityIds.length > 0) {
      const communitiesData = []

      for (const communityId of communityIds) {
        const communityData = await redisClient.hgetall(`community:${communityId}`)
        if (Object.keys(communityData).length > 0) {
          communitiesData.push({
            communityId,
            name: communityData.name,
            description: communityData.description,
            isPrivate: communityData.isPrivate === "1",
            createdAt: communityData.createdAt,
          })
        }
      }

      if (communitiesData.length === communityIds.length) {
        return res.status(200).json({
          success: true,
          data: communitiesData,
        })
      }
    }

    // If not in Redis or incomplete, get from MongoDB
    const communities = await Community.find({
      "members.userId": userId,
    }).select("communityId name description avatar coverImage isPrivate createdAt updatedAt")

    // Cache in Redis for future requests
    const pipeline = redisClient.pipeline()
    for (const community of communities) {
      pipeline.sadd(`user:${userId}:communities`, community.communityId)
      pipeline.hset(
        `community:${community.communityId}`,
        "name",
        community.name,
        "description",
        community.description || "",
        "isPrivate",
        community.isPrivate ? "1" : "0",
        "createdAt",
        community.createdAt.toISOString(),
      )
    }
    await pipeline.exec()

    return res.status(200).json({
      success: true,
      data: communities.map((c) => ({
        communityId: c.communityId,
        name: c.name,
        description: c.description,
        avatar: c.avatar,
        coverImage: c.coverImage,
        isPrivate: c.isPrivate,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
      })),
    })
  } catch (error) {
    next(error)
  }

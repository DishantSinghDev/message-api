import { Group } from "../models/Group.js"
import { User } from "../models/User.js"
import { redisClient } from "../server.js"
import { v4 as uuidv4 } from "uuid"

// Create a new group
export const createGroup = async (req, res, next) => {
  try {
    const { name, description, members, avatar } = req.body
    const createdBy = req.body.userId

    // Generate unique group ID
    const groupId = `group_${uuidv4().replace(/-/g, "")}`

    // Validate creator exists
    const creator = await User.findById(createdBy)
    if (!creator) {
      return res.status(404).json({
        success: false,
        message: "Creator not found",
      })
    }

    // Prepare members array with creator as admin
    const membersArray = [
      {
        userId: createdBy,
        role: "admin",
        addedAt: new Date(),
      },
    ]

    // Add other members if provided
    if (members && Array.isArray(members)) {
      // Validate members exist
      const validMembers = await User.find({
        _id: { $in: members },
      }).select("_id")

      const validMemberIds = validMembers.map((m) => m._id.toString())

      // Add valid members to the array
      for (const memberId of members) {
        if (validMemberIds.includes(memberId) && memberId !== createdBy.toString()) {
          membersArray.push({
            userId: memberId,
            role: "member",
            addedAt: new Date(),
          })
        }
      }
    }

    // Create the group
    const group = new Group({
      groupId,
      name,
      description: description || "",
      avatar: avatar || null,
      createdBy,
      members: membersArray,
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    await group.save()

    // Cache group data in Redis
    await redisClient.hset(
      `group:${groupId}`,
      "name",
      name,
      "description",
      description || "",
      "createdBy",
      createdBy.toString(),
      "createdAt",
      new Date().toISOString(),
    )

    // Add group to members' groups list in Redis
    const pipeline = redisClient.pipeline()
    for (const member of membersArray) {
      pipeline.sadd(`user:${member.userId}:groups`, groupId)
    }
    await pipeline.exec()

    return res.status(201).json({
      success: true,
      data: {
        groupId: group.groupId,
        name: group.name,
        description: group.description,
        createdBy: group.createdBy,
        membersCount: group.members.length,
        createdAt: group.createdAt,
      },
    })
  } catch (error) {
    next(error)
  }
}

// Get group details
export const getGroupDetails = async (req, res, next) => {
  try {
    const { groupId } = req.params

    // Try to get from Redis first
    const cachedGroup = await redisClient.hgetall(`group:${groupId}`)

    if (cachedGroup && Object.keys(cachedGroup).length > 0) {
      // Get members from Redis
      const memberIds = await redisClient.smembers(`group:${groupId}:members`)

      return res.status(200).json({
        success: true,
        data: {
          groupId,
          name: cachedGroup.name,
          description: cachedGroup.description,
          createdBy: cachedGroup.createdBy,
          membersCount: memberIds.length,
          createdAt: cachedGroup.createdAt,
        },
      })
    }

    // If not in Redis, get from MongoDB
    const group = await Group.findOne({ groupId }).populate("members.userId", "username")

    if (!group) {
      return res.status(404).json({
        success: false,
        message: "Group not found",
      })
    }

    // Cache in Redis for future requests
    await redisClient.hset(
      `group:${groupId}`,
      "name",
      group.name,
      "description",
      group.description || "",
      "createdBy",
      group.createdBy.toString(),
      "createdAt",
      group.createdAt.toISOString(),
    )

    // Cache members in Redis
    const pipeline = redisClient.pipeline()
    for (const member of group.members) {
      pipeline.sadd(`group:${groupId}:members`, member.userId._id.toString())
      pipeline.sadd(`user:${member.userId._id}:groups`, groupId)
    }
    await pipeline.exec()

    return res.status(200).json({
      success: true,
      data: {
        groupId: group.groupId,
        name: group.name,
        description: group.description,
        avatar: group.avatar,
        createdBy: group.createdBy,
        members: group.members.map((m) => ({
          userId: m.userId._id,
          username: m.userId.username,
          role: m.role,
          addedAt: m.addedAt,
        })),
        settings: group.settings,
        createdAt: group.createdAt,
        updatedAt: group.updatedAt,
      },
    })
  } catch (error) {
    next(error)
  }
}

// Add members to a group
export const addGroupMembers = async (req, res, next) => {
  try {
    const { groupId, members } = req.body
    const userId = req.body.userId

    // Validate group exists
    const group = await Group.findOne({ groupId })
    if (!group) {
      return res.status(404).json({
        success: false,
        message: "Group not found",
      })
    }

    // Check if user is an admin
    const isAdmin = group.members.some((m) => m.userId.toString() === userId && m.role === "admin")
    if (!isAdmin && group.settings.onlyAdminsCanAddMembers) {
      return res.status(403).json({
        success: false,
        message: "Only admins can add members to this group",
      })
    }

    // Validate members exist
    const validMembers = await User.find({
      _id: { $in: members },
    }).select("_id")

    const validMemberIds = validMembers.map((m) => m._id.toString())
    const existingMemberIds = group.members.map((m) => m.userId.toString())

    // Add new members
    const newMembers = []
    for (const memberId of members) {
      if (validMemberIds.includes(memberId) && !existingMemberIds.includes(memberId)) {
        group.members.push({
          userId: memberId,
          role: "member",
          addedAt: new Date(),
        })
        newMembers.push(memberId)
      }
    }

    if (newMembers.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No valid new members to add",
      })
    }

    group.updatedAt = new Date()
    await group.save()

    // Update Redis
    const pipeline = redisClient.pipeline()
    for (const memberId of newMembers) {
      pipeline.sadd(`group:${groupId}:members`, memberId)
      pipeline.sadd(`user:${memberId}:groups`, groupId)
    }
    await pipeline.exec()

    return res.status(200).json({
      success: true,
      message: `Added ${newMembers.length} new members to the group`,
      data: {
        groupId,
        newMembers,
      },
    })
  } catch (error) {
    next(error)
  }
}

// Remove member from a group
export const removeGroupMember = async (req, res, next) => {
  try {
    const { groupId, memberId } = req.body
    const userId = req.body.userId

    // Validate group exists
    const group = await Group.findOne({ groupId })
    if (!group) {
      return res.status(404).json({
        success: false,
        message: "Group not found",
      })
    }

    // Check if user is an admin or the member being removed
    const isAdmin = group.members.some((m) => m.userId.toString() === userId && m.role === "admin")
    const isSelfRemoval = userId === memberId

    if (!isAdmin && !isSelfRemoval) {
      return res.status(403).json({
        success: false,
        message: "Only admins can remove other members",
      })
    }

    // Check if member exists in the group
    const memberIndex = group.members.findIndex((m) => m.userId.toString() === memberId)
    if (memberIndex === -1) {
      return res.status(404).json({
        success: false,
        message: "Member not found in the group",
      })
    }

    // Check if removing the last admin
    const isRemovingAdmin = group.members[memberIndex].role === "admin"
    const adminCount = group.members.filter((m) => m.role === "admin").length

    if (isRemovingAdmin && adminCount === 1) {
      return res.status(400).json({
        success: false,
        message: "Cannot remove the last admin from the group",
      })
    }

    // Remove member
    group.members.splice(memberIndex, 1)
    group.updatedAt = new Date()
    await group.save()

    // Update Redis
    await redisClient.srem(`group:${groupId}:members`, memberId)
    await redisClient.srem(`user:${memberId}:groups`, groupId)

    return res.status(200).json({
      success: true,
      message: "Member removed from the group",
      data: {
        groupId,
        memberId,
      },
    })
  } catch (error) {
    next(error)
  }
}

// Update group settings
export const updateGroupSettings = async (req, res, next) => {
  try {
    const { groupId, settings } = req.body
    const userId = req.body.userId

    // Validate group exists
    const group = await Group.findOne({ groupId })
    if (!group) {
      return res.status(404).json({
        success: false,
        message: "Group not found",
      })
    }

    // Check if user is an admin
    const isAdmin = group.members.some((m) => m.userId.toString() === userId && m.role === "admin")
    if (!isAdmin) {
      return res.status(403).json({
        success: false,
        message: "Only admins can update group settings",
      })
    }

    // Update settings
    if (settings.onlyAdminsCanSend !== undefined) {
      group.settings.onlyAdminsCanSend = settings.onlyAdminsCanSend
    }

    if (settings.onlyAdminsCanAddMembers !== undefined) {
      group.settings.onlyAdminsCanAddMembers = settings.onlyAdminsCanAddMembers
    }

    group.updatedAt = new Date()
    await group.save()

    // Update Redis
    await redisClient.hset(
      `group:${groupId}:settings`,
      "onlyAdminsCanSend",
      group.settings.onlyAdminsCanSend.toString(),
      "onlyAdminsCanAddMembers",
      group.settings.onlyAdminsCanAddMembers.toString(),
    )

    return res.status(200).json({
      success: true,
      message: "Group settings updated",
      data: {
        groupId,
        settings: group.settings,
      },
    })
  } catch (error) {
    next(error)
  }
}

// Change member role
export const changeGroupMemberRole = async (req, res, next) => {
  try {
    const { groupId, memberId, newRole } = req.body
    const userId = req.body.userId

    // Validate role
    if (!["admin", "member"].includes(newRole)) {
      return res.status(400).json({
        success: false,
        message: "Invalid role",
      })
    }

    // Validate group exists
    const group = await Group.findOne({ groupId })
    if (!group) {
      return res.status(404).json({
        success: false,
        message: "Group not found",
      })
    }

    // Check if user is an admin
    const isAdmin = group.members.some((m) => m.userId.toString() === userId && m.role === "admin")
    if (!isAdmin) {
      return res.status(403).json({
        success: false,
        message: "Only admins can change member roles",
      })
    }

    // Find member in the group
    const memberIndex = group.members.findIndex((m) => m.userId.toString() === memberId)
    if (memberIndex === -1) {
      return res.status(404).json({
        success: false,
        message: "Member not found in the group",
      })
    }

    // Check if changing the last admin to a member
    const isChangingAdmin = group.members[memberIndex].role === "admin" && newRole === "member"
    const adminCount = group.members.filter((m) => m.role === "admin").length

    if (isChangingAdmin && adminCount === 1) {
      return res.status(400).json({
        success: false,
        message: "Cannot demote the last admin",
      })
    }

    // Update member role
    group.members[memberIndex].role = newRole
    group.updatedAt = new Date()
    await group.save()

    // Update Redis
    await redisClient.hset(`group:${groupId}:member:${memberId}`, "role", newRole)

    return res.status(200).json({
      success: true,
      message: "Member role updated",
      data: {
        groupId,
        memberId,
        newRole,
      },
    })
  } catch (error) {
    next(error)
  }
}

// List user's groups
export const getUserGroups = async (req, res, next) => {
  try {
    const { userId } = req.params

    // Try to get from Redis first
    const groupIds = await redisClient.smembers(`user:${userId}:groups`)

    if (groupIds.length > 0) {
      const groupsData = []

      for (const groupId of groupIds) {
        const groupData = await redisClient.hgetall(`group:${groupId}`)
        if (Object.keys(groupData).length > 0) {
          groupsData.push({
            groupId,
            name: groupData.name,
            description: groupData.description,
            createdAt: groupData.createdAt,
          })
        }
      }

      if (groupsData.length === groupIds.length) {
        return res.status(200).json({
          success: true,
          data: groupsData,
        })
      }
    }

    // If not in Redis or incomplete, get from MongoDB
    const groups = await Group.find({
      "members.userId": userId,
    }).select("groupId name description avatar createdAt updatedAt")

    // Cache in Redis for future requests
    const pipeline = redisClient.pipeline()
    for (const group of groups) {
      pipeline.sadd(`user:${userId}:groups`, group.groupId)
      pipeline.hset(
        `group:${group.groupId}`,
        "name",
        group.name,
        "description",
        group.description || "",
        "createdAt",
        group.createdAt.toISOString(),
      )
    }
    await pipeline.exec()

    return res.status(200).json({
      success: true,
      data: groups.map((g) => ({
        groupId: g.groupId,
        name: g.name,
        description: g.description,
        avatar: g.avatar,
        createdAt: g.createdAt,
        updatedAt: g.updatedAt,
      })),
    })
  } catch (error) {
    next(error)
  }
}

// Delete a group
export const deleteGroup = async (req, res, next) => {
  try {
    const { groupId } = req.body
    const userId = req.body.userId

    // Validate group exists
    const group = await Group.findOne({ groupId })
    if (!group) {
      return res.status(404).json({
        success: false,
        message: "Group not found",
      })
    }

    // Check if user is an admin
    const isAdmin = group.members.some((m) => m.userId.toString() === userId && m.role === "admin")
    if (!isAdmin) {
      return res.status(403).json({
        success: false,
        message: "Only admins can delete the group",
      })
    }

    // Get all member IDs for Redis cleanup
    const memberIds = group.members.map((m) => m.userId.toString())

    // Delete group
    await Group.deleteOne({ groupId })

    // Clean up Redis
    const pipeline = redisClient.pipeline()
    pipeline.del(`group:${groupId}`)
    pipeline.del(`group:${groupId}:members`)
    pipeline.del(`group:${groupId}:settings`)

    for (const memberId of memberIds) {
      pipeline.srem(`user:${memberId}:groups`, groupId)
    }

    await pipeline.exec()

    return res.status(200).json({
      success: true,
      message: "Group deleted successfully",
      data: {
        groupId,
      },
    })
  } catch (error) {
    next(error)
  }
}

import Joi from "joi"

// Validation schema for user registration
const registrationSchema = Joi.object({
  username: Joi.string().min(3).max(30).required(),
  deviceId: Joi.string().required(),
})

// Validation schema for sending messages
const messageSchema = Joi.object({
  senderId: Joi.string().required(),
  recipientId: Joi.string().required(),
  content: Joi.string().required(),
  type: Joi.string().valid("text", "image", "video", "audio", "document", "link"),
  mediaId: Joi.string().allow(null, ""),
  replyToId: Joi.string().allow(null, ""),
  scheduledFor: Joi.date().allow(null, ""),
})

// Middleware for validating registration
export const validateRegistration = (req, res, next) => {
  const { error } = registrationSchema.validate(req.body)

  if (error) {
    return res.status(400).json({
      success: false,
      message: error.details[0].message,
    })
  }

  next()
}

// Middleware for validating messages
export const validateMessage = (req, res, next) => {
  const { error } = messageSchema.validate(req.body)

  if (error) {
    return res.status(400).json({
      success: false,
      message: error.details[0].message,
    })
  }

  next()
}
// Validation schema for group messages
const groupMessageSchema = Joi.object({
  senderId: Joi.string().required(),
  groupId: Joi.string().required(),
  content: Joi.string().required(),
  type: Joi.string().valid("text", "image", "video", "audio", "document", "link"),
  mediaId: Joi.string().allow(null, ""),
  replyToId: Joi.string().allow(null, ""),
})

// Middleware for validating group messages
export const validateGroupMessage = (req, res, next) => {
  const { error } = groupMessageSchema.validate(req.body)

  if (error) {
    return res.status(400).json({
      success: false,
      message: error.details[0].message,
    })
  }

  next()
}

// Validation schema for channel messages
const channelMessageSchema = Joi.object({
  senderId: Joi.string().required(),
  channelId: Joi.string().required(),
  content: Joi.string().required(),
  type: Joi.string().valid("text", "image", "video", "audio", "document", "link"),
  mediaId: Joi.string().allow(null, ""),
  replyToId: Joi.string().allow(null, ""),
})
// Middleware for validating channel messages
export const validateChannelMessage = (req, res, next) => {
  const { error } = channelMessageSchema.validate(req.body)

  if (error) {
    return res.status(400).json({
      success: false,
      message: error.details[0].message,
    })
  }

  next()
}
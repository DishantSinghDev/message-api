import express from "express"
import {
  sendMessage,
  getMessages,
  sendTypingIndicator,
  replyToMessage,
  addReaction,
  deleteMessage,
  scheduleMessage,
  getUserPublicKey,
  getAMessage
} from "../controllers/messageController.js"
import { validateMessage } from "../middleware/validation.js"
import { rateLimiter } from "../middleware/rateLimiter.js"

const router = express.Router()

router.post("/send", validateMessage, rateLimiter("sendMessage", 20, 60), sendMessage)
router.get("/public-key/:userId", rateLimiter("getPublicKey", 30, 60), getUserPublicKey)
router.get("/:userId/:recipientId", rateLimiter("getMessages", 30, 60), getMessages)
router.post("/typing", rateLimiter("typing", 30, 10), sendTypingIndicator)
router.post("/reply", validateMessage, rateLimiter("messageAction", 20, 60), sendMessage)
router.post("/react", rateLimiter("messageAction", 20, 60), addReaction)
router.post("/delete", rateLimiter("messageAction", 10, 60), deleteMessage)
router.post("/schedule", validateMessage, rateLimiter("messageAction", 10, 60), scheduleMessage)
router.get("/:messageId", rateLimiter("getMessage", 30, 60), getAMessage)

export default router

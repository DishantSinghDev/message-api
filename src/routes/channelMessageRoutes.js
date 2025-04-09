import express from "express"
import {
  sendChannelMessage,
  getChannelMessages,
  pinChannelMessage,
  getPinnedChannelMessages,
} from "../controllers/channelMessageController.js"
import { validateChannelMessage } from "../middleware/validation.js"
import { rateLimiter } from "../middleware/rateLimiter.js"

const router = express.Router()

router.post("/send", validateChannelMessage, rateLimiter("sendChannelMessage", 20, 60), sendChannelMessage)
router.get("/:channelId", rateLimiter("getChannelMessages", 30, 60), getChannelMessages)
router.post("/pin", rateLimiter("messageAction", 10, 60), pinChannelMessage)
router.get("/:channelId/pinned", rateLimiter("getPinnedMessages", 20, 60), getPinnedChannelMessages)

export default router

import express from "express"
import {
  sendGroupMessage,
  getGroupMessages,
  addGroupMessageReaction,
  deleteGroupMessage,
  updateGroupMessageStatus,
  getGroupPublicKeys,
} from "../controllers/groupMessageController.js"
import { validateGroupMessage } from "../middleware/validation.js"
import { rateLimiter } from "../middleware/rateLimiter.js"

const router = express.Router()

router.post("/send", validateGroupMessage, rateLimiter("sendGroupMessage", 20, 60), sendGroupMessage)
router.post("/public-keys/:groupId", rateLimiter("getPublicKeys", 30, 60), getGroupPublicKeys)
router.get("/:groupId", rateLimiter("getGroupMessages", 30, 60), getGroupMessages)
router.post("/react", rateLimiter("messageAction", 20, 60), addGroupMessageReaction)
router.post("/delete", rateLimiter("messageAction", 10, 60), deleteGroupMessage)
router.post("/status", rateLimiter("updateStatus", 50, 60), updateGroupMessageStatus)

export default router

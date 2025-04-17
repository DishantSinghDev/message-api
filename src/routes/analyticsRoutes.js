import express from "express"
import { getUserStats, getActiveChats, getMessageCount } from "../controllers/analyticsController.js"
import { rateLimiter } from "../middleware/rateLimiter.js"

const router = express.Router()

router.get("/user/:userId", rateLimiter("analytics", 1000, 60), getUserStats)
router.get("/active-chats/:userId", rateLimiter("analytics", 1000, 60), getActiveChats)
router.get("/message-count/:userId", rateLimiter("analytics", 1000, 60), getMessageCount)

export default router

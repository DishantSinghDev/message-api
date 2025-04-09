import express from "express"
import {
  updateMessageStatus,
  getMessageStatus
} from "../controllers/statusController.js"
import { rateLimiter } from "../middleware/rateLimiter.js"

const router = express.Router()

router.post("/", rateLimiter("updateMessageStatus", 10, 60), updateMessageStatus)
router.get("/:messageId", rateLimiter("getMessageStatus", 30, 60), getMessageStatus)

export default router

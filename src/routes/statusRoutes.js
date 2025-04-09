import express from "express"
import {
  createStatus,
  getUserStatuses,
  getStatusDetails,
  deleteStatus,
  getStatusViewers,
} from "../controllers/statusController.js"
import { rateLimiter } from "../middleware/rateLimiter.js"

const router = express.Router()

router.post("/create", rateLimiter("createStatus", 10, 60), createStatus)
router.get("/user/:userId", rateLimiter("getUserStatuses", 30, 60), getUserStatuses)
router.get("/:statusId", rateLimiter("getStatus", 30, 60), getStatusDetails)
router.post("/delete", rateLimiter("deleteStatus", 10, 60), deleteStatus)
router.get("/:statusId/viewers", rateLimiter("getStatusViewers", 20, 60), getStatusViewers)

export default router

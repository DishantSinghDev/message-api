import express from "express"
import { registerUser, blockUser, unblockUser, muteUser, getUserDetails } from "../controllers/userController.js"
import { validateRegistration } from "../middleware/validation.js"
import { rateLimiter } from "../middleware/rateLimiter.js"

const router = express.Router()

router.post("/register", validateRegistration, rateLimiter("register", 5, 60), registerUser)
router.post("/block", rateLimiter("userAction", 10, 60), blockUser)
router.post("/unblock", rateLimiter("userAction", 10, 60), unblockUser)
router.post("/mute", rateLimiter("userAction", 10, 60), muteUser)
router.get("/:username", rateLimiter("userAction", 10, 60), getUserDetails)

export default router

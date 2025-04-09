import express from "express"
import { uploadMedia, getMedia } from "../controllers/mediaController.js"
import { uploadMiddleware, validateFileType } from "../middleware/fileMiddleware.js"
import { rateLimiter } from "../middleware/rateLimiter.js"

const router = express.Router()

router.post("/upload", rateLimiter("uploadMedia", 10, 60), uploadMiddleware, validateFileType, uploadMedia)
router.get("/:fileId", getMedia)

export default router

import express from "express"
import userRoutes from "./userRoutes.js"
import messageRoutes from "./messageRoutes.js"
import mediaRoutes from "./mediaRoutes.js"
import statusRoutes from "./statusRoutes.js"
import analyticsRoutes from "./analyticsRoutes.js"
import groupRoutes from "./groupRoutes.js"
import groupMessageRoutes from "./groupMessageRoutes.js"
import communityRoutes from "./communityRoutes.js"
import channelMessageRoutes from "./channelMessageRoutes.js"
import statusUpdateRoutes from "./statusUpdateRoutes.js"

const router = express.Router()

router.use("/users", userRoutes)
router.use("/messages", messageRoutes)
router.use("/media", mediaRoutes)
router.use("/status", statusRoutes)
router.use("/analytics", analyticsRoutes)
router.use("/groups", groupRoutes)
router.use("/group-messages", groupMessageRoutes)
router.use("/communities", communityRoutes)
router.use("/channel-messages", channelMessageRoutes)
router.use("/statuses", statusUpdateRoutes)

// Router for API health check
router.get("/health", (req, res) => {
  res.status(200).json({
    success: true,
    message: "API is healthy",
  })
})


export default router

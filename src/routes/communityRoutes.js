import express from "express"
import {
  createCommunity,
  getCommunityDetails,
  joinCommunity,
  leaveCommunity,
  createChannel,
  getCommunityChannels,
  getUserCommunities,
  approveJoinRequest,
  getPendingJoinRequests,
  rejectJoinRequest,
  getCommunityUsers
} from "../controllers/communityController.js"
import { rateLimiter } from "../middleware/rateLimiter.js"

const router = express.Router()

router.post("/create", rateLimiter("createCommunity", 5, 60), createCommunity)
router.get("/:communityId", rateLimiter("getCommunity", 20, 60), getCommunityDetails)
router.post("/join", rateLimiter("communityAction", 10, 60), joinCommunity)
router.get("/approvalRequests/:communityId", rateLimiter("getPendingJoinRequests", 20, 60), getPendingJoinRequests)
router.post("/approve", rateLimiter("approveJoinRequest", 10, 60), approveJoinRequest)
router.post("/reject", rateLimiter("rejectJoinRequest", 10, 60), rejectJoinRequest)
router.post("/leave", rateLimiter("communityAction", 10, 60), leaveCommunity)
router.post("/channel/create", rateLimiter("createChannel", 10, 60), createChannel)
router.get("/:communityId/channels", rateLimiter("getChannels", 20, 60), getCommunityChannels)
router.get("/user/:userId", rateLimiter("getUserCommunities", 20, 60), getUserCommunities)
router.get("/users/:communityId", rateLimiter("getCommunityUsers", 20, 60), getCommunityUsers)

export default router

import express from "express"
import {
  createGroup,
  getGroupDetails,
  addGroupMembers,
  removeGroupMember,
  updateGroupSettings,
  changeGroupMemberRole,
  getUserGroups,
  deleteGroup,
} from "../controllers/groupController.js"
import { rateLimiter } from "../middleware/rateLimiter.js"

const router = express.Router()

router.post("/create", rateLimiter("createGroup", 5, 60), createGroup)
router.get("/:groupId", rateLimiter("getGroup", 20, 60), getGroupDetails)
router.post("/members/add", rateLimiter("groupAction", 10, 60), addGroupMembers)
router.post("/members/remove", rateLimiter("groupAction", 10, 60), removeGroupMember)
router.post("/settings", rateLimiter("groupAction", 10, 60), updateGroupSettings)
router.post("/members/role", rateLimiter("groupAction", 10, 60), changeGroupMemberRole)
router.get("/user/:userId", rateLimiter("getUserGroups", 20, 60), getUserGroups)
router.post("/delete", rateLimiter("deleteGroup", 5, 60), deleteGroup)

export default router

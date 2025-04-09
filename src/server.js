import express from "express"
import helmet from "helmet"
import rateLimit from "express-rate-limit"
import cors from "cors"
import { createServer } from "http"
import { Server } from "socket.io"
import mongoose from "mongoose"
import Redis from "ioredis"
import dotenv from "dotenv"
import routes from "./routes/index.js"
import { errorHandler } from "./middleware/errorHandler.js"
import { setupSocketHandlers } from "./socket/socketHandlers.js"

dotenv.config()

// Initialize Express app
const app = express()
const httpServer = createServer(app)
export const io = new Server(httpServer, {
  cors: {
    origin: process.env.CORS_ORIGIN || "*",
    methods: ["GET", "POST"],
  },
})

// Initialize Redis client
export const redisClient = new Redis(process.env.REDIS_URL)

// Security middleware
app.use(helmet())
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || "*",
    methods: ["GET", "POST", "PUT", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
)

// Rate limiting
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
})
app.use("/api/", apiLimiter)

// Body parsing
app.use(express.json({ limit: "10mb" }))
app.use(express.urlencoded({ extended: true, limit: "10mb" }))

// API routes
app.use("/api", routes)

// Error handling
app.use(errorHandler)

// Socket.io setup
setupSocketHandlers(io, redisClient)

// Connect to MongoDB
mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => console.log("Connected to MongoDB"))
  .catch((err) => console.error("MongoDB connection error:", err))

// Start server
const PORT = process.env.PORT || 3000
httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`)
})

// Graceful shutdown
process.on("SIGTERM", async () => {
  console.log("SIGTERM received, shutting down gracefully")
  await redisClient.quit()
  await mongoose.connection.close()
  httpServer.close(() => {
    console.log("Server closed")
    process.exit(0)
  })
})

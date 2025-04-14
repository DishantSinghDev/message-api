import multer from "multer"
import path from "path"
import fs from "fs"
import { v4 as uuidv4 } from "uuid"

// Ensure upload directory exists
const uploadDir = path.join(process.cwd(), "uploads")
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true })
}

// Configure storage
const storage = multer.diskStorage({
  destination: (_, __, cb) => {
    cb(null, uploadDir)
  },
  filename: (_, file, cb) => {
    const uniqueFilename = `${uuidv4()}${path.extname(file.originalname)}`
    cb(null, uniqueFilename)
  },
})

// File size limits
const limits = {
  fileSize: 50 * 1024 * 1024, // 50MB max file size
}

// File filter
const fileFilter = (_, file, cb) => {
  // Allow only encrypted files
  const allowedMimeTypes = [
    "application/octet-stream", // Common for encrypted files
    "application/pgp-encrypted", // PGP encrypted files
  ]

  if (allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true)
  } else {
    cb(new Error("Invalid file type. Only encrypted files are allowed."), false)
  }
}

// Create multer upload middleware
export const uploadMiddleware = multer({
  storage,
  limits,
  fileFilter,
}).fields([
  { name: "file", maxCount: 1 },
  { name: "thumbnail", maxCount: 1 },
])

// Middleware to check for required fields
export const validateFileType = (req, res, next) => {
  // Check if both file and thumbnail are present
  if (!req.files || !req.files.file || !req.files.thumbnail) {
    return res.status(400).json({
      success: false,
      message: "File and thumbnail are required.",
    })
  }
  next()
}

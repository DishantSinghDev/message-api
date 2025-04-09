export const errorHandler = (err, req, res, next) => {
  console.error("Error:", err)

  // Default error status and message
  let statusCode = 500
  let message = "Internal Server Error"

  // Handle specific error types
  if (err.name === "ValidationError") {
    statusCode = 400
    message = err.message
  } else if (err.name === "CastError") {
    statusCode = 400
    message = "Invalid ID format"
  } else if (err.code === 11000) {
    statusCode = 409
    message = "Duplicate key error"
  }

  // Send error response
  res.status(statusCode).json({
    success: false,
    message,
    error: process.env.NODE_ENV === "development" ? err.stack : undefined,
  })
}

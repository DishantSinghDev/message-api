import crypto from "crypto"
import { v4 as uuidv4 } from "uuid"

// Generate RSA key pair for E2EE
export const generateKeyPair = async () => {
  return new Promise((resolve, reject) => {
    crypto.generateKeyPair(
      "rsa",
      {
        modulusLength: 2048,
        publicKeyEncoding: {
          type: "spki",
          format: "pem",
        },
        privateKeyEncoding: {
          type: "pkcs8",
          format: "pem",
        },
      },
      (err, publicKey, privateKey) => {
        if (err) {
          reject(err)
        } else {
          resolve({ publicKey, privateKey })
        }
      },
    )
  })
}

// Encrypt message with recipient's public key
export const encryptMessage = async (message, publicKey) => {
  // Generate a random AES key
  const aesKey = crypto.randomBytes(32)

  // Encrypt the message with AES
  const iv = crypto.randomBytes(16)
  const cipher = crypto.createCipheriv("aes-256-cbc", aesKey, iv)
  let encryptedMessage = cipher.update(message, "utf8", "base64")
  encryptedMessage += cipher.final("base64")

  // Encrypt the AES key with the recipient's public key
  const encryptedKey = crypto.publicEncrypt(
    {
      key: publicKey,
      padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
    },
    aesKey,
  )

  // Return the encrypted message, encrypted key, and IV
  return JSON.stringify({
    message: encryptedMessage,
    key: encryptedKey.toString("base64"),
    iv: iv.toString("base64"),
  })
}

// Encrypt message for a group (encrypt once for each member)
export const encryptGroupMessage = async (message, members) => {
  // In a real implementation, you would:
  // 1. Get each member's public key
  // 2. Encrypt the message with a symmetric key
  // 3. Encrypt the symmetric key with each member's public key
  // 4. Store all encrypted keys with the message

  // For simplicity in this demo, we'll just encrypt with a shared key
  const sharedKey = crypto.randomBytes(32)
  const iv = crypto.randomBytes(16)
  const cipher = crypto.createCipheriv("aes-256-cbc", sharedKey, iv)
  let encryptedMessage = cipher.update(message, "utf8", "base64")
  encryptedMessage += cipher.final("base64")

  return JSON.stringify({
    message: encryptedMessage,
    iv: iv.toString("base64"),
    // In a real implementation, you would include encrypted keys for each member
    // encryptedKeys: { memberId1: encryptedKey1, memberId2: encryptedKey2, ... }
  })
}

// Decrypt message with recipient's private key
export const decryptMessage = async (encryptedData, privateKey) => {
  const { message, key, iv } = JSON.parse(encryptedData)

  // Decrypt the AES key with the recipient's private key
  const decryptedKey = crypto.privateDecrypt(
    {
      key: privateKey,
      padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
    },
    Buffer.from(key, "base64"),
  )

  // Decrypt the message with the AES key
  const decipher = crypto.createDecipheriv("aes-256-cbc", decryptedKey, Buffer.from(iv, "base64"))
  let decryptedMessage = decipher.update(message, "base64", "utf8")
  decryptedMessage += decipher.final("utf8")

  return decryptedMessage
}

// Generate message hash for integrity verification
export const generateMessageHash = (message) => {
  return crypto.createHash("sha256").update(message).digest("hex")
}

// Verify message hash
export const verifyMessageHash = (message, hash) => {
  const calculatedHash = crypto.createHash("sha256").update(message).digest("hex")
  return calculatedHash === hash
}

// Generate unique message ID
export const generateMessageId = () => {
  return `msg_${uuidv4().replace(/-/g, "")}`
}

// Generate unique file ID
export const generateFileId = () => {
  return `file_${uuidv4().replace(/-/g, "")}`
}

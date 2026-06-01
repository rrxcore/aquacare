const functions = require("firebase-functions");
const admin = require("firebase-admin");

// Initialize Firebase Admin SDK
admin.initializeApp();

/**
 * verifyRecaptcha - HTTPS Callable Cloud Function to verify reCAPTCHA v3 token.
 * 
 * @param {Object} data - Contains request arguments sent from client
 * @param {string} data.token - The reCAPTCHA v3 token generated on client
 * @param {Object} context - Caller's context (contains auth, UID, etc.)
 * @returns {Promise<Object>} Verification results containing score and success metrics
 */
exports.verifyRecaptcha = functions.https.onCall(async (data, context) => {
  const token = data?.token;

  // Basic validation of inputs
  if (!token) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "The function must be called with a reCAPTCHA 'token' argument."
    );
  }

  const secretKey = "6LeYVwctAAAAAJsIPKUQcYxa5RxxCONg5V1C6qB7";
  const verificationUrl = "https://www.google.com/recaptcha/api/siteverify";

  try {
    // Perform secure server-to-server POST request to Google verification endpoint
    const response = await fetch(verificationUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: `secret=${secretKey}&response=${encodeURIComponent(token)}`
    });

    if (!response.ok) {
      console.error(`Google API request failed with status: ${response.status}`);
      throw new functions.https.HttpsError(
        "internal",
        `Google siteverify request failed with status code ${response.status}`
      );
    }

    const verificationResult = await response.json();

    console.log("reCAPTCHA siteverify response payload:", verificationResult);

    // Return verification metrics directly to the client
    return {
      success: !!verificationResult.success,
      score: typeof verificationResult.score === "number" ? verificationResult.score : 0,
      action: verificationResult.action || "",
      challenge_ts: verificationResult.challenge_ts || "",
      hostname: verificationResult.hostname || "",
      errorCodes: verificationResult["error-codes"] || []
    };
  } catch (error) {
    console.error("reCAPTCHA v3 server verification failed:", error);
    
    // Propagate native firebase functions callable HttpsErrors
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    
    throw new functions.https.HttpsError(
      "internal",
      error?.message || "An unexpected error occurred during security validation."
    );
  }
});

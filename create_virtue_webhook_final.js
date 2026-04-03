require("dotenv").config();
const axios = require("axios");

const BASE_URL = process.env.VIIRTUE_BASE_URL;

// Credentials
const clientId = "broadbandtelatom";
const clientSecret = "15627b8db9bf39e5310b7d0be1f94952";
const username = process.env.VIIRTUE_USERNAME;
const password = process.env.VIIRTUE_PASSWORD;

const WEBHOOK_URL = "https://ghl-telecom-middleware.onrender.com/webhooks/vodia/new-call";

// ==========================
// 1. GET TOKEN (CORRECT)
// ==========================
async function getAccessToken() {
  try {
    const response = await axios.post(
      `${BASE_URL}/tokens`,
      {
        grant_type: "password",
        client_id: clientId,
        client_secret: clientSecret,
        username: username,
        password: password,
      },
      {
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    console.log("✅ Token:", response.data.access_token);
    return response.data.access_token;
  } catch (err) {
    console.error("❌ Token error:", err.response?.data || err.message);
    process.exit(1);
  }
}

// ==========================
// 2. CREATE WEBHOOK
// ==========================
async function createWebhook(token) {
  try {
    const response = await axios.post(
      `${BASE_URL}/subscriptions`,
      {
        event_type: "call.created",
        post_url: WEBHOOK_URL,
        active: true,
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      }
    );

    console.log("✅ Webhook created:", response.data);
  } catch (err) {
    console.error("❌ Webhook error:", err.response?.data || err.message);
  }
}

// ==========================
// RUN
// ==========================
(async () => {
  const token = await getAccessToken();
  await createWebhook(token);
})();
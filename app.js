require("dotenv").config();
const express = require("express");
const { Sequelize, DataTypes } = require("sequelize");
const axios = require("axios");
const https = require("https");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 8080;

// =====================
// DATABASE SETUP
// =====================
let sequelize;

if (process.env.NODE_ENV === "production" && process.env.RENDER_DB_HOST) {
  // Use Render internal DB in production
  sequelize = new Sequelize(
    process.env.RENDER_DB_NAME,
    process.env.RENDER_DB_USER,
    process.env.RENDER_DB_PASS,
    {
      host: process.env.RENDER_DB_HOST,
      port: process.env.RENDER_DB_PORT || 5432,
      dialect: "postgres",
      logging: false,
      dialectOptions: {
        ssl:
          process.env.DB_SSL === "true"
            ? { require: true, rejectUnauthorized: false }
            : false,
      },
    }
  );
} else if (process.env.DATABASE_URL) {
  // Local dev: use external DATABASE_URL
  sequelize = new Sequelize(process.env.DATABASE_URL, {
    dialect: "postgres",
    logging: false,
    dialectOptions: {
      ssl:
        process.env.DB_SSL === "true"
          ? { require: true, rejectUnauthorized: false }
          : false,
    },
  });
} else {
  // Fallback to SQLite
  sequelize = new Sequelize({
    dialect: "sqlite",
    storage: "./database.sqlite",
    logging: false,
  });
}

/* =====================================================
   MODELS
===================================================== */
const Subaccount = sequelize.define("Subaccount", {
  name: { type: DataTypes.STRING },
  locationId: { type: DataTypes.STRING, unique: true },
  ghlInboundUrl: { type: DataTypes.STRING },
  didNumber: { type: DataTypes.STRING, unique: true },
});

const User = sequelize.define("User", {
  name: { type: DataTypes.STRING },
  phone: { type: DataTypes.STRING },
  contactId: { type: DataTypes.STRING },
  locationId: { type: DataTypes.STRING },
});

const CallLog = sequelize.define("CallLog", {
  type: { type: DataTypes.STRING },
  phone: { type: DataTypes.STRING },
  contactId: { type: DataTypes.STRING },
  locationId: { type: DataTypes.STRING },
  status: { type: DataTypes.STRING },
  payload: { type: DataTypes.JSON },
});

/* =====================================================
   SYNC DB
===================================================== */
(async () => {
  try {
    await sequelize.authenticate();
    console.log("✅ Database connected");

    await sequelize.sync({ force: false });
    console.log("✅ Database synced");
  } catch (err) {
    console.error("❌ Database error:", err);
  }
})();

/* =====================================================
   HELPERS
===================================================== */
function normalizePhone(phone) {
  if (!phone) return null;
  return phone.replace(/\D/g, "");
}

async function logCall(type, data, status = "processed") {
  try {
    await CallLog.create({
      type,
      phone: normalizePhone(data.phone || data.from_number),
      contactId: data.contact_id || data.contactId,
      locationId: data.locationId || null,
      status,
      payload: data,
    });
  } catch (err) {
    console.error("❌ Error logging call:", err.message);
  }
}

async function transcribeCall(audioPath) {
  console.log("⚡ Simulated transcription for", audioPath);
  return "This is a simulated transcription.";
}

/* =====================================================
   OUTBOUND CALL
===================================================== */
async function handleOutboundCall(data, res) {
  const normalizedPhone = normalizePhone(data.phone || data.from_number);

  const subaccount = await Subaccount.findOne({
    where: { locationId: data.locationId },
  });

  if (!subaccount) {
    return res.status(400).json({
      success: false,
      message: "No subaccount found. Ensure locationId is correct.",
    });
  }

  await User.upsert({
    name: data.name,
    phone: normalizedPhone,
    contactId: data.contactId,
    locationId: subaccount.locationId,
  });

  await logCall("outbound_call", { ...data, locationId: subaccount.locationId });

  const vodiaPayload = {
    from_number: subaccount.didNumber,
    to_number: normalizedPhone,
    contact_name: data.name,
    contact_id: data.contactId,
    locationId: subaccount.locationId,
  };

  console.log("📤 Payload to send to Vodia:", vodiaPayload);

  return res.json({
    success: true,
    message: "Outbound call processed",
    locationId: subaccount.locationId,
    payload: vodiaPayload,
  });
}

/* =====================================================
   INBOUND CALL
===================================================== */
async function handleInboundCall(req, res) {
  const data = req.body;
  const didNumber = normalizePhone(data.to_number);

  if (!didNumber) {
    return res.status(400).json({
      success: false,
      message: "Destination number missing",
    });
  }

  const subaccount = await Subaccount.findOne({ where: { didNumber } });

  if (!subaccount) {
    return res.status(400).json({
      success: false,
      message: "No routing configured for this DID",
    });
  }

  const phone = normalizePhone(data.from_number);
  const first_name = data.from_name || "Inbound";
  const last_name = "Caller";
  const email = phone ? `${phone}@placeholder.com` : "inbound@placeholder.com";

  await User.upsert({
    name: `${first_name} ${last_name}`,
    phone,
    contactId: data.contact_id || null,
    locationId: subaccount.locationId,
  });

  await logCall("inbound_call", { ...data, locationId: subaccount.locationId }, "received");

  const ghlPayload = {
    phone,
    first_name,
    last_name,
    email,
    call_id: data.call_id || null,
    direction: "inbound",
    locationId: subaccount.locationId,
  };

  try {
    // Development SSL bypass for local testing
    const isDev = process.env.NODE_ENV !== "production";
    const axiosInstance = axios.create({
      httpsAgent: isDev
        ? new https.Agent({ rejectUnauthorized: false })
        : undefined, // Production uses normal SSL
    });

    await axiosInstance.post(subaccount.ghlInboundUrl, ghlPayload);
    console.log("✅ Inbound sent to GHL:", ghlPayload);
  } catch (err) {
    console.error("❌ Failed to send to GHL:", err.response?.data || err.message);
  }

  return res.json({ success: true, routedTo: subaccount.locationId });
}

/* =====================================================
   ADMIN ROUTES
===================================================== */
function adminAuth(req, res, next) {
  const token = req.headers["x-admin-key"];
  if (token !== process.env.ADMIN_SECRET)
    return res.status(403).json({ success: false, message: "Unauthorized" });
  next();
}

app.post("/admin/subaccount", adminAuth, async (req, res) => {
  const { name, locationId, ghlInboundUrl, didNumber } = req.body;

  if (!locationId || !ghlInboundUrl || !didNumber)
    return res.status(400).json({ success: false, message: "Missing fields" });

  try {
    await Subaccount.upsert({
      name,
      locationId,
      ghlInboundUrl,
      didNumber: normalizePhone(didNumber),
    });

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get("/admin/subaccounts", adminAuth, async (req, res) => {
  const subs = await Subaccount.findAll();
  res.json(subs);
});

/* =====================================================
   ROUTES
===================================================== */
app.post("/ghl/webhook", async (req, res) => {
  const customData = req.body.customData || {};
  const { type, phone, contactId, name, locationId } = customData;

  if (!type) return res.status(400).json({ success: false, error: "No type provided" });

  if (type === "outbound_call") {
    if (!locationId) return res.status(400).json({ success: false, error: "locationId missing" });
    return handleOutboundCall({ phone, contactId, name, locationId }, res);
  }

  return res.status(400).json({ success: false, error: "Unknown type" });
});

app.post("/webhooks/vodia/new-call", handleInboundCall);

/* =====================================================
   HEALTH CHECK
===================================================== */
app.get("/", (req, res) => {
  res.status(200).send("Middleware running");
});

/* =====================================================
   START SERVER
===================================================== */
app.listen(PORT, () => console.log(`🚀 Middleware running on port ${PORT}`));
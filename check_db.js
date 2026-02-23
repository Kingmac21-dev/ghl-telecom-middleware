require("dotenv").config();
const { Sequelize, DataTypes } = require("sequelize");

// Create Sequelize using DATABASE_URL
const sequelize = new Sequelize(process.env.DATABASE_URL, {
  dialect: "postgres",
  logging: false,
  dialectOptions: {
    ssl:
      process.env.DB_SSL === "true"
        ? { require: true, rejectUnauthorized: false }
        : false,
  },
});

// Define Models
const User = sequelize.define("User", {
  name: DataTypes.STRING,
  phone: DataTypes.STRING,
  contactId: DataTypes.STRING,
});

const CallLog = sequelize.define("CallLog", {
  type: DataTypes.STRING,
  phone: DataTypes.STRING,
  contactId: DataTypes.STRING,
  status: DataTypes.STRING,
  payload: DataTypes.JSON,
});

async function testDB() {
  try {
    console.log("🔄 Connecting to Render PostgreSQL...\n");

    await sequelize.authenticate();
    console.log("✅ Connected successfully!\n");

    // Sync tables (creates them if they don't exist)
    await sequelize.sync();
    console.log("📦 Tables synced.\n");

    const users = await User.findAll();
    console.log("📋 Users:");
    console.log(users.map(u => u.toJSON()));

    const calls = await CallLog.findAll();
    console.log("\n📞 CallLogs:");
    console.log(calls.map(c => c.toJSON()));

    console.log("\n🎉 Database check complete!");
  } catch (err) {
    console.error("❌ Database error:");
    console.error(err);
  } finally {
    await sequelize.close();
    process.exit();
  }
}

testDB();
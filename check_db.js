const { Sequelize, DataTypes } = require("sequelize");
require("dotenv").config();

// Connect
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

// Models
const Subaccount = sequelize.define("Subaccount", {
  name: DataTypes.STRING,
  locationId: DataTypes.STRING,
  ghlInboundUrl: DataTypes.STRING,
  didNumber: DataTypes.STRING,
});

const User = sequelize.define("User", {
  name: DataTypes.STRING,
  phone: DataTypes.STRING,
  contactId: DataTypes.STRING,
  locationId: DataTypes.STRING,
});

const CallLog = sequelize.define("CallLog", {
  type: DataTypes.STRING,
  phone: DataTypes.STRING,
  contactId: DataTypes.STRING,
  locationId: DataTypes.STRING,
  status: DataTypes.STRING,
  payload: DataTypes.JSON,
});

async function showTables() {
  try {
    await sequelize.authenticate();
    console.log("✅ Connected to Postgres\n");

    await sequelize.sync();

    const subs = await Subaccount.findAll();
    console.log("📋 Subaccounts:");
    console.table(subs.map(s => s.toJSON()));

    const users = await User.findAll();
    console.log("\n📋 Users:");
    console.table(users.map(u => u.toJSON()));

    const calls = await CallLog.findAll();
    console.log("\n📋 CallLogs:");
    console.table(calls.map(c => c.toJSON()));

  } catch (err) {
    console.error(err);
  } finally {
    await sequelize.close();
    process.exit();
  }
}

showTables();
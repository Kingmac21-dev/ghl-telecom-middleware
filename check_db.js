require("dotenv").config();
const { Sequelize, DataTypes } = require("sequelize");

let sequelize;

if (process.env.DB_HOST) {
  sequelize = new Sequelize(
    process.env.DB_NAME,
    process.env.DB_USER,
    process.env.DB_PASS,
    {
      host: process.env.DB_HOST,
      port: process.env.DB_PORT || 5432,
      dialect: "postgres",
      logging: false,
      dialectOptions: {
        ssl: process.env.DB_SSL === "true" ? { require: true, rejectUnauthorized: false } : false,
      },
    }
  );
} else {
  sequelize = new Sequelize({
    dialect: "sqlite",
    storage: "./database.sqlite",
    logging: false,
  });
}

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

(async () => {
  try {
    await sequelize.authenticate();
    console.log("✅ Connected to DB");

    const users = await User.findAll();
    console.log("📋 Users:");
    users.forEach((u) => console.table(u.toJSON()));

    const calls = await CallLog.findAll();
    console.log("📞 CallLogs:");
    calls.forEach((c) => console.table(c.toJSON()));
  } catch (err) {
    console.error("❌ Error reading DB:", err);
  } finally {
    await sequelize.close();
  }
})();
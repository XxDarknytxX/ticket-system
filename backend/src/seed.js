import "dotenv/config";
import bcrypt from "bcryptjs";
import poolManager from "./config/db.js";

async function seed() {
  const pool = await poolManager.getSharedPool();
  // Get the production instance pool (users now live per-instance)
  const instancePool = await poolManager.getInstancePool("production");

  const superAdmins = [
    { email: "kritish.vodafone@gmail.com", plainPassword: "abcd1234", first_name: "Kritish", last_name: "Singh" },
  ];

  const users = [
    {
      email: "kritish.vodafone@gmail.com",
      plainPassword: "abcd1234",
      role: "super_admin",
    },
    {
      email: "kunaal.vodafone@gmail.com",
      plainPassword: "abcd1234",
      role: "agent",
    },
  ];

  // Seed super_admins in shared DB
  for (const sa of superAdmins) {
    const passwordHash = await bcrypt.hash(sa.plainPassword, 10);
    try {
      await pool.query(
        "INSERT INTO super_admins (email, password_hash, first_name, last_name) VALUES (?, ?, ?, ?)",
        [sa.email, passwordHash, sa.first_name, sa.last_name]
      );
      console.log(`✅ Seeded super_admin (shared): ${sa.email}`);
    } catch (err) {
      if (err.code === "ER_DUP_ENTRY") console.log(`⚠️ Super admin already exists: ${sa.email}`);
      else console.error(`❌ Error seeding super_admin: ${err.message}`);
    }
  }

  // Seed users in production instance DB
  for (const u of users) {
    const passwordHash = await bcrypt.hash(u.plainPassword, 10);

    try {
      await instancePool.query(
        "INSERT INTO users (email, password_hash, role) VALUES (?, ?, ?)",
        [u.email, passwordHash, u.role]
      );
      console.log(`✅ Seeded ${u.role}: ${u.email} / ${u.plainPassword}`);
    } catch (err) {
      if (err.code === "ER_DUP_ENTRY") {
        console.log(`⚠️ User already exists: ${u.email}`);
      } else {
        console.error(`❌ Error seeding ${u.email}:`, err.message);
      }
    }
  }

  // Seed service types
  try {
    await instancePool.query(
      "INSERT IGNORE INTO service_types (name, description, vat_rate) VALUES (?, ?, ?)",
      ["Franchise", "Franchise service routes with 12.5% VAT", 12.5]
    );
    console.log("✅ Seeded service type: Franchise");
  } catch (err) {
    console.error("❌ Error seeding service type:", err.message);
  }

  // Get the service type ID
  const [serviceTypeRows] = await instancePool.query(
    "SELECT id FROM service_types WHERE name = ?",
    ["Franchise"]
  );
  const franchiseId = serviceTypeRows[0]?.id;

  if (franchiseId) {
    // Seed routes based on the pricing table
    const routes = [
      {
        source: "Suva",
        destination: "Yasayasa Moala",
        adult_price: 96.00,
        student_price: 48.00,
        child_price: 24.00,
        infant_price: 0.00
      },
      {
        source: "Suva",
        destination: "Rotuma",
        adult_price: 170.00,
        student_price: 85.00,
        child_price: 43.00,
        infant_price: 0.00
      },
      {
        source: "Suva",
        destination: "Upper Southern Lau Group",
        adult_price: 113.00,
        student_price: 57.00,
        child_price: 28.00,
        infant_price: 0.00
      },
      {
        source: "Suva",
        destination: "Lower Southern Lau Group",
        adult_price: 113.00,
        student_price: 57.00,
        child_price: 28.00,
        infant_price: 0.00
      },
      {
        source: "Suva",
        destination: "Northern Lau",
        adult_price: 117.00,
        student_price: 59.00,
        child_price: 29.00,
        infant_price: 0.00
      }
    ];

    for (const route of routes) {
      try {
        await instancePool.query(
          "INSERT IGNORE INTO routes (service_type_id, source, destination, adult_price, student_price, child_price, infant_price) VALUES (?, ?, ?, ?, ?, ?, ?)",
          [franchiseId, route.source, route.destination, route.adult_price, route.student_price, route.child_price, route.infant_price]
        );
        console.log(`✅ Seeded route: ${route.source} to ${route.destination}`);
      } catch (err) {
        console.error(`❌ Error seeding route ${route.source} to ${route.destination}:`, err.message);
      }
    }
  }

  process.exit(0);
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});

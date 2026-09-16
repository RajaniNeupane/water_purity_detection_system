const express = require("express");
const axios = require("axios");
const cors = require("cors");
const mysql = require("mysql2/promise");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
require("dotenv").config();

const app = express();

app.use(cors());
app.use(express.json());

const db = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

// Handle invalid JSON errors safely
app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && "body" in err) {
    return res.status(400).json({ error: "Invalid JSON payload structure" });
  }
  next();
});
// ===============================
// REGISTER USER
// ===============================
app.post("/register", async (req, res) => {
  try {
    const { name, username, email, password } = req.body;

    if (!name || !username || !email || !password) {
      return res.status(400).json({
        error: "All fields are required",
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        error: "Password must contain at least 8 characters",
      });
    }

    // Check whether username or email already exists
    const [existingUsers] = await db.execute(
      "SELECT id FROM users WHERE username = ? OR email = ?",
      [username, email]
    );

    if (existingUsers.length > 0) {
      return res.status(409).json({
        error: "Username or email already exists",
      });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Insert user
    await db.execute(
      `INSERT INTO users
       (name, username, email, password)
       VALUES (?, ?, ?, ?)`,
      [name, username, email, hashedPassword]
    );

    res.status(201).json({
      message: "Registration successful",
    });
  } catch (error) {
    console.error("Registration error:", error);

    res.status(500).json({
      error: "Registration failed",
    });
  }
});
// ===============================
// LOGIN USER
// ===============================
app.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        error: "Username and password are required",
      });
    }

    const [users] = await db.execute(
      "SELECT * FROM users WHERE username = ?",
      [username]
    );

    if (users.length === 0) {
      return res.status(401).json({
        error: "Invalid username or password",
      });
    }

    const user = users[0];

    // Compare entered password with hashed password
    const passwordMatch = await bcrypt.compare(
      password,
      user.password
    );

    if (!passwordMatch) {
      return res.status(401).json({
        error: "Invalid username or password",
      });
    }

    // Create JWT token
    const token = jwt.sign(
      {
        id: user.id,
        username: user.username,
        email: user.email,
      },
      process.env.JWT_SECRET,
      {
        expiresIn: "7d",
      }
    );

    res.json({
      message: "Login successful",
      token: token,
      user: {
        id: user.id,
        name: user.name,
        username: user.username,
        email: user.email,
      },
    });
  } catch (error) {
    console.error("Login error:", error);

    res.status(500).json({
      error: "Login failed",
    });
  }
});
// ===============================
// AUTHENTICATION MIDDLEWARE
// ===============================
function authenticateToken(req, res, next) {
  const authHeader = req.headers["authorization"];

  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({
      error: "Access token required",
    });
  }

  jwt.verify(
    token,
    process.env.JWT_SECRET,
    (err, user) => {
      if (err) {
        return res.status(403).json({
          error: "Invalid or expired token",
        });
      }

      req.user = user;
      next();
    }
  );
}
// ===============================
// GET CURRENT USER
// ===============================
app.get("/me", authenticateToken, async (req, res) => {
  try {
    const [users] = await db.execute(
      `SELECT id, name, username, email, created_at
       FROM users
       WHERE id = ?`,
      [req.user.id]
    );

    if (users.length === 0) {
      return res.status(404).json({
        error: "User not found",
      });
    }

    res.json({
      user: users[0],
    });
  } catch (error) {
    console.error("Get user error:", error);

    res.status(500).json({
      error: "Failed to get user",
    });
  }
});
// ===============================
// CHANGE PASSWORD
// ===============================
app.post(
  "/change-password",
  authenticateToken,
  async (req, res) => {
    try {
      const { currentPassword, newPassword } = req.body;

      if (!currentPassword || !newPassword) {
        return res.status(400).json({
          error: "Current and new password are required",
        });
      }

      if (newPassword.length < 8) {
        return res.status(400).json({
          error: "New password must contain at least 8 characters",
        });
      }

      const [users] = await db.execute(
        "SELECT password FROM users WHERE id = ?",
        [req.user.id]
      );

      if (users.length === 0) {
        return res.status(404).json({
          error: "User not found",
        });
      }

      const passwordMatch = await bcrypt.compare(
        currentPassword,
        users[0].password
      );

      if (!passwordMatch) {
        return res.status(401).json({
          error: "Current password is incorrect",
        });
      }

      const newHashedPassword = await bcrypt.hash(
        newPassword,
        10
      );

      await db.execute(
        "UPDATE users SET password = ? WHERE id = ?",
        [newHashedPassword, req.user.id]
      );

      res.json({
        message: "Password changed successfully",
      });
    } catch (error) {
      console.error("Change password error:", error);

      res.status(500).json({
        error: "Failed to change password",
      });
    }
  }
);
app.post("/predict", async (req, res) => {
  try {
    console.log("Received payload:", req.body);

    // Normalize input (VERY IMPORTANT)
    const features = req.body.features || req.body;

    // Validate empty request
    if (!features || Object.keys(features).length === 0) {
      return res.status(400).json({ error: "No features provided" });
    }

    // Forward to Flask API in consistent format
    const response = await axios.post(
      "http://YOUR_SERVER_IP:5000/predict",
      { features },
      {
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    return res.json(response.data);

  } catch (error) {
    // Flask returned an error response
    if (error.response) {
      console.error(
        `Flask Error (${error.response.status}):`,
        error.response.data
      );

      return res
        .status(error.response.status)
        .json(error.response.data);
    }

    // Network / server error
    console.error("Node Proxy Error:", error.message);

    return res.status(500).json({
      error: error.message || "Internal server error",
    });
  }
});


// ===============================
// SAVE MANUAL ANALYSIS HISTORY
// ===============================
app.post("/history/manual", authenticateToken, async (req, res) => {
try {
const {
ph,
hardness,
solids,
chloramines,
organic_carbon,
turbidity,
prediction,
probability,
} = req.body;

if (
  ph === undefined ||
  hardness === undefined ||
  solids === undefined ||
  chloramines === undefined ||
  organic_carbon === undefined ||
  turbidity === undefined ||
  prediction === undefined
) {
  return res.status(400).json({
    error: "All manual analysis values are required",
  });
}

await db.execute(
  `INSERT INTO water_history
  (
    user_id,
    analysis_type,
    ph,
    hardness,
    solids,
    chloramines,
    organic_carbon,
    turbidity,
    prediction,
    probability
  )
  VALUES (?, 'MANUAL', ?, ?, ?, ?, ?, ?, ?, ?)`,
  [
    req.user.id,
    ph,
    hardness,
    solids,
    chloramines,
    organic_carbon,
    turbidity,
    prediction,
    probability ?? null,
  ]
);

res.status(201).json({
  message: "Manual analysis saved successfully",
});


} catch (error) {
console.error("Save manual history error:", error);

res.status(500).json({
  error: "Failed to save manual history",
});


}
});

// ===============================
// SAVE SENSOR ANALYSIS HISTORY
// ===============================
app.post("/history/sensor", authenticateToken, async (req, res) => {
  try {
    const {
      tds,
      prediction,
      probability,
    } = req.body;

    if (tds === undefined || prediction === undefined) {
      return res.status(400).json({
        error: "TDS and prediction are required",
      });
    }

    await db.execute(
      `INSERT INTO water_history
      (
        user_id,
        analysis_type,
        tds,
        prediction,
        probability
      )
      VALUES (?, 'SENSOR', ?, ?, ?)`,
      [
        req.user.id,
        tds,
        prediction,
        probability ?? null,
      ]
    );

    res.status(201).json({
      message: "Sensor analysis saved successfully",
    });
  } catch (error) {
    console.error("Save sensor history error:", error);

    res.status(500).json({
      error: "Failed to save sensor history",
    });
  }
});
// ===============================
// GET USER HISTORY
// ===============================
app.get("/history", authenticateToken, async (req, res) => {
  try {
    const [history] = await db.execute(
  `SELECT
        id,
        analysis_type,
        ph,
        hardness,
        solids,
        chloramines,
        organic_carbon,
        turbidity,
        tds,
        prediction,
        probability,
        created_at
      FROM water_history
      WHERE user_id = ?
      ORDER BY created_at DESC`,
  [req.user.id]
);


    res.json({
      history: history,
    });
  } catch (error) {
    console.error("Get history error:", error);

    res.status(500).json({
      error: "Failed to get history",
    });
  }
});
// ===============================
// DELETE HISTORY
// ===============================
app.delete("/history/:id", authenticateToken, async (req, res) => {
  try {
    const historyId = req.params.id;

    const [result] = await db.execute(
      `DELETE FROM water_history
       WHERE id = ? AND user_id = ?`,
      [historyId, req.user.id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        error: "History record not found",
      });
    }

    res.json({
      message: "History deleted successfully",
    });
  } catch (error) {
    console.error("Delete history error:", error);

    res.status(500).json({
      error: "Failed to delete history",
    });
  }
});
app.listen(3000, () => {
  console.log("Node server running on port 3000");
});
const express = require("express");
const pool = require("./db");

const app = express();

app.get("/", (req, res) => {
    res.send("Backend is working!");
});

app.get("/api/lekarze", async (req, res) => {
    try {
        const [rows] = await pool.query("SELECT * FROM lekarz");
        res.json(rows);
    } catch (error) {
        console.error("DB ERROR:", error);
        res.status(500).json({ error: "DB ERROR" });
    }
});

app.listen(3000, () => {
    console.log("Backend working on port 3000");
});

const express = require("express");
const fs = require("fs/promises");
const path = require("path");
const os = require("os");
const crypto = require("crypto");

const PORT = 8080;
const HOST = "0.0.0.0";
const PLAN_START = "2026-07-01";
const PLAN_END = "2026-12-31";
const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const sseClients = new Set();

function createJsonStore() {
  const dataFile =
    process.env.STORAGE_FILE ||
    path.join(os.tmpdir(), "sg-vacation-data", "vacation-data.json");
  let operationQueue = Promise.resolve();

  async function ensureFile() {
    await fs.mkdir(path.dirname(dataFile), { recursive: true });
    try {
      await fs.access(dataFile);
    } catch {
      await fs.writeFile(dataFile, JSON.stringify({ vacations: [] }, null, 2), "utf8");
    }
  }

  async function readAll() {
    await ensureFile();
    const raw = await fs.readFile(dataFile, "utf8");
    const data = JSON.parse(raw);
    return Array.isArray(data.vacations) ? data.vacations : [];
  }

  async function writeAll(vacations) {
    await ensureFile();
    await fs.writeFile(dataFile, JSON.stringify({ vacations }, null, 2), "utf8");
  }

  async function runExclusive(task) {
    const run = operationQueue.then(task, task);
    operationQueue = run.catch(() => {});
    return run;
  }

  return {
    async initialize() {
      await ensureFile();
    },
    async listVacations() {
      await operationQueue;
      return readAll();
    },
    async createVacation(record) {
      return runExclusive(async () => {
        const vacations = await readAll();
        vacations.push(record);
        await writeAll(vacations);
        return record;
      });
    },
    async updateVacation(id, changes) {
      return runExclusive(async () => {
        const vacations = await readAll();
        const index = vacations.findIndex((item) => item.id === id);
        if (index === -1) {
          return null;
        }

        vacations[index] = { ...vacations[index], ...changes };
        await writeAll(vacations);
        return vacations[index];
      });
    },
    async deleteVacation(id) {
      return runExclusive(async () => {
        const vacations = await readAll();
        const nextVacations = vacations.filter((item) => item.id !== id);
        if (nextVacations.length === vacations.length) {
          return false;
        }

        await writeAll(nextVacations);
        return true;
      });
    },
  };
}

async function createDbStore() {
  const dbPort = String(process.env.DB_PORT || "");
  const dbClient = (process.env.DB_CLIENT || "").toLowerCase();
  const isPostgres = dbClient === "postgres" || dbPort === "5432";

  if (isPostgres) {
    const { Client } = require("pg");
    const client = new Client({
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT || "5432"),
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: false } : undefined,
    });

    await client.connect();
    await client.query(`
      CREATE TABLE IF NOT EXISTS vacations (
        id VARCHAR(64) PRIMARY KEY,
        employee_name VARCHAR(120) NOT NULL,
        start_date DATE NOT NULL,
        end_date DATE NOT NULL,
        created_at TIMESTAMP NOT NULL,
        updated_at TIMESTAMP NOT NULL
      )
    `);

    return {
      async initialize() {},
      async listVacations() {
        const result = await client.query(`
          SELECT id, employee_name, start_date, end_date, created_at, updated_at
          FROM vacations
          ORDER BY start_date, employee_name
        `);
        return result.rows.map(normalizeDbRow);
      },
      async createVacation(record) {
        await client.query(
          `
            INSERT INTO vacations (id, employee_name, start_date, end_date, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6)
          `,
          [
            record.id,
            record.employeeName,
            record.startDate,
            record.endDate,
            record.createdAt,
            record.updatedAt,
          ],
        );
        return record;
      },
      async updateVacation(id, changes) {
        const existing = await this.listVacations();
        const target = existing.find((item) => item.id === id);
        if (!target) {
          return null;
        }

        const merged = { ...target, ...changes };
        await client.query(
          `
            UPDATE vacations
            SET employee_name = $2,
                start_date = $3,
                end_date = $4,
                updated_at = $5
            WHERE id = $1
          `,
          [id, merged.employeeName, merged.startDate, merged.endDate, merged.updatedAt],
        );
        return merged;
      },
      async deleteVacation(id) {
        const result = await client.query("DELETE FROM vacations WHERE id = $1", [id]);
        return result.rowCount > 0;
      },
    };
  }

  const mysql = require("mysql2/promise");
  const pool = mysql.createPool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || "3306"),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
  });

  await pool.query(`
    CREATE TABLE IF NOT EXISTS vacations (
      id VARCHAR(64) PRIMARY KEY,
      employee_name VARCHAR(120) NOT NULL,
      start_date DATE NOT NULL,
      end_date DATE NOT NULL,
      created_at DATETIME NOT NULL,
      updated_at DATETIME NOT NULL
    )
  `);

  return {
    async initialize() {},
    async listVacations() {
      const [rows] = await pool.query(`
        SELECT id, employee_name, start_date, end_date, created_at, updated_at
        FROM vacations
        ORDER BY start_date, employee_name
      `);
      return rows.map(normalizeDbRow);
    },
    async createVacation(record) {
      await pool.query(
        `
          INSERT INTO vacations (id, employee_name, start_date, end_date, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?)
        `,
        [
          record.id,
          record.employeeName,
          record.startDate,
          record.endDate,
          record.createdAt,
          record.updatedAt,
        ],
      );
      return record;
    },
    async updateVacation(id, changes) {
      const existing = await this.listVacations();
      const target = existing.find((item) => item.id === id);
      if (!target) {
        return null;
      }

      const merged = { ...target, ...changes };
      await pool.query(
        `
          UPDATE vacations
          SET employee_name = ?,
              start_date = ?,
              end_date = ?,
              updated_at = ?
          WHERE id = ?
        `,
        [merged.employeeName, merged.startDate, merged.endDate, merged.updatedAt, id],
      );
      return merged;
    },
    async deleteVacation(id) {
      const [result] = await pool.query("DELETE FROM vacations WHERE id = ?", [id]);
      return result.affectedRows > 0;
    },
  };
}

function normalizeDbRow(row) {
  return {
    id: row.id,
    employeeName: row.employee_name,
    startDate: toIsoDate(row.start_date),
    endDate: toIsoDate(row.end_date),
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  };
}

function toIsoDate(value) {
  if (!value) {
    return "";
  }
  if (typeof value === "string") {
    return value.slice(0, 10);
  }
  return new Date(value).toISOString().slice(0, 10);
}

function toIsoString(value) {
  if (!value) {
    return "";
  }
  if (typeof value === "string" && value.includes("T")) {
    return value;
  }
  return new Date(value).toISOString();
}

async function buildStore() {
  if (process.env.DB_HOST && process.env.DB_USER && process.env.DB_NAME) {
    return createDbStore();
  }
  return createJsonStore();
}

function normalizeName(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function validateVacationInput(payload) {
  const employeeName = normalizeName(payload.employeeName);
  const startDate = String(payload.startDate || "");
  const endDate = String(payload.endDate || "");

  if (!employeeName) {
    return { error: "직원명을 입력해 주세요." };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
    return { error: "시작일과 종료일을 정확히 선택해 주세요." };
  }
  if (startDate > endDate) {
    return { error: "종료일은 시작일보다 빠를 수 없습니다." };
  }
  if (startDate < PLAN_START || endDate > PLAN_END) {
    return { error: "휴가 기간은 2026년 7월 1일부터 12월 31일까지로 제한됩니다." };
  }

  return { employeeName, startDate, endDate };
}

function findOverlaps(vacations, candidate, ignoreId) {
  return vacations
    .filter((item) => item.id !== ignoreId)
    .filter(
      (item) =>
        candidate.startDate <= item.endDate && item.startDate <= candidate.endDate,
    )
    .map((item) => ({
      id: item.id,
      employeeName: item.employeeName,
      startDate: item.startDate,
      endDate: item.endDate,
    }));
}

function summarizeVacations(vacations) {
  const sortedVacations = [...vacations].sort((a, b) => {
    const dateCompare = a.startDate.localeCompare(b.startDate);
    return dateCompare !== 0
      ? dateCompare
      : a.employeeName.localeCompare(b.employeeName, "ko");
  });

  const employees = [...new Set(sortedVacations.map((item) => item.employeeName))].sort((a, b) =>
    a.localeCompare(b, "ko"),
  );

  const byEmployee = employees.map((employeeName) => ({
    employeeName,
    vacations: sortedVacations.filter((item) => item.employeeName === employeeName),
  }));

  const monthNames = ["07", "08", "09", "10", "11", "12"];
  const byMonth = monthNames.map((month) => {
    const monthStart = `2026-${month}-01`;
    const monthEnd = new Date(2026, Number(month), 0).toISOString().slice(0, 10);
    const monthVacations = sortedVacations.filter(
      (item) => item.startDate <= monthEnd && monthStart <= item.endDate,
    );
    return {
      month: `2026-${month}`,
      vacations: monthVacations,
    };
  });

  return {
    vacations: sortedVacations,
    stats: {
      totalPlans: sortedVacations.length,
      totalEmployees: employees.length,
    },
    byEmployee,
    byMonth,
  };
}

function broadcast(type, payload) {
  const message = `data: ${JSON.stringify({ type, payload })}\n\n`;
  for (const client of sseClients) {
    client.write(message);
  }
}

async function sendSnapshot(res) {
  const vacations = await store.listVacations();
  res.json(summarizeVacations(vacations));
}

let store;

app.get("/health", (_req, res) => {
  res.status(200).send("ok");
});

app.get("/api/vacations", async (_req, res) => {
  await sendSnapshot(res);
});

app.get("/api/stream", async (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();
  sseClients.add(res);

  const vacations = await store.listVacations();
  res.write(`data: ${JSON.stringify({ type: "snapshot", payload: summarizeVacations(vacations) })}\n\n`);

  req.on("close", () => {
    sseClients.delete(res);
  });
});

app.post("/api/vacations", async (req, res) => {
  const validation = validateVacationInput(req.body || {});
  if (validation.error) {
    res.status(400).json({ error: validation.error });
    return;
  }

  const existing = await store.listVacations();
  const now = new Date().toISOString();
  const record = {
    id: crypto.randomUUID(),
    employeeName: validation.employeeName,
    startDate: validation.startDate,
    endDate: validation.endDate,
    createdAt: now,
    updatedAt: now,
  };
  const overlaps = findOverlaps(existing, record);

  await store.createVacation(record);
  const payload = summarizeVacations(await store.listVacations());
  broadcast("snapshot", payload);
  res.status(201).json({ record, overlaps, data: payload });
});

app.put("/api/vacations/:id", async (req, res) => {
  const validation = validateVacationInput(req.body || {});
  if (validation.error) {
    res.status(400).json({ error: validation.error });
    return;
  }

  const existing = await store.listVacations();
  const target = existing.find((item) => item.id === req.params.id);
  if (!target) {
    res.status(404).json({ error: "수정할 휴가 계획을 찾을 수 없습니다." });
    return;
  }

  const changes = {
    employeeName: validation.employeeName,
    startDate: validation.startDate,
    endDate: validation.endDate,
    updatedAt: new Date().toISOString(),
  };
  const overlaps = findOverlaps(existing, { ...target, ...changes }, req.params.id);
  const updated = await store.updateVacation(req.params.id, changes);
  const payload = summarizeVacations(await store.listVacations());
  broadcast("snapshot", payload);
  res.json({ record: updated, overlaps, data: payload });
});

app.delete("/api/vacations/:id", async (req, res) => {
  const deleted = await store.deleteVacation(req.params.id);
  if (!deleted) {
    res.status(404).json({ error: "삭제할 휴가 계획을 찾을 수 없습니다." });
    return;
  }

  const payload = summarizeVacations(await store.listVacations());
  broadcast("snapshot", payload);
  res.json({ ok: true, data: payload });
});

app.get("*", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

async function start() {
  store = await buildStore();
  await store.initialize();
  app.listen(PORT, HOST, () => {
    console.log(`sg-vacation listening on http://${HOST}:${PORT}`);
  });
}

start().catch((error) => {
  console.error("Failed to start sg-vacation:", error);
  process.exit(1);
});

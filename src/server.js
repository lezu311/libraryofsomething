const express = require("express");
const path = require("path");
const multer = require("multer");
const crypto = require("crypto");
const { Pool } = require("pg");
const { trace } = require("console");

const app = express();

app.set("trust proxy", true);

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
    console.error("Thiếu biến môi trường DATABASE_URL (xem hướng dẫn nối database).");
    process.exit(1);
}

const useSsl = DATABASE_URL.includes("render.com") || process.env.PGSSL === "true";
const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: useSsl ? { rejectUnauthorized: false } : false
});

let tracked = {
    shared : 0,
    given : 0
}

async function initDb() {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS users (
            username   TEXT PRIMARY KEY,
            fullname   TEXT NOT NULL,
            salt       TEXT NOT NULL,
            hash       TEXT NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    `);
    await pool.query(`
        CREATE TABLE IF NOT EXISTS books (
            id          SERIAL PRIMARY KEY,
            title       TEXT NOT NULL,
            author      TEXT,
            category    TEXT,
            description TEXT,
            owner       TEXT,
            cover_type  TEXT,
            cover_data  BYTEA,
            created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    `);
    await pool.query(`
        CREATE TABLE IF NOT EXISTS requests (
            id             SERIAL PRIMARY KEY,
            book_id        INTEGER NOT NULL,
            book_title     TEXT NOT NULL,
            owner          TEXT NOT NULL,
            owner_name     TEXT NOT NULL,
            requester      TEXT NOT NULL,
            requester_name TEXT NOT NULL,
            message        TEXT NOT NULL DEFAULT '',
            status         TEXT NOT NULL DEFAULT 'pending',
            created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    `);
    await pool.query("ALTER TABLE requests ADD COLUMN IF NOT EXISTS pickup TEXT");
    await pool.query("ALTER TABLE requests ADD COLUMN IF NOT EXISTS owner_deleted BOOLEAN NOT NULL DEFAULT false");
    await pool.query("ALTER TABLE requests ADD COLUMN IF NOT EXISTS requester_deleted BOOLEAN NOT NULL DEFAULT false");
    await pool.query("ALTER TABLE requests ADD COLUMN IF NOT EXISTS requester_seen BOOLEAN NOT NULL DEFAULT false");
    await pool.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS one_pending_request
        ON requests (book_id, requester) WHERE status = 'pending'
    `);
    await pool.query(`
        CREATE TABLE IF NOT EXISTS sessions (
            token_hash TEXT PRIMARY KEY,
            username   TEXT NOT NULL,
            fullname   TEXT NOT NULL,
            expires    BIGINT NOT NULL
        )
    `);
    await pool.query(`
        CREATE TABLE IF NOT EXISTS statistics (
            day TIMESTAMPTZ PRIMARY KEY,
            shared INTEGER NOT NULL DEFAULT 0,
            given INTEGER NOT NULL DEFAULT 0
        )
    `);
    await pool.query("DELETE FROM sessions WHERE expires <= $1", [Date.now()]);
    const saved = await pool.query("SELECT token_hash, username, fullname, expires FROM sessions");
    for (const row of saved.rows) {
        sessions.set(row.token_hash, {
            username: row.username,
            fullname: row.fullname,
            expires: Number(row.expires)
        });
    }
}

const ADMIN_USERS = (process.env.ADMIN_USERS || "")
    .split(",")
    .map(s => s.trim().toLowerCase())
    .filter(Boolean);

function hashPassword(password, salt) {
    return crypto.scryptSync(password, salt, 64).toString("hex");
}

function checkPassword(password, user) {
    const a = Buffer.from(hashPassword(password, user.salt), "hex");
    const b = Buffer.from(user.hash, "hex");
    return a.length === b.length && crypto.timingSafeEqual(a, b);
}

const SESSION_MS = 7 * 24 * 60 * 60 * 1000;
const sessions = new Map();

function hashToken(token) {
    return crypto.createHash("sha256").update(token).digest("hex");
}

function parseCookies(req) {
    const out = {};
    for (const part of (req.headers.cookie || "").split(";")) {
        const i = part.indexOf("=");
        if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
    }
    return out;
}

function getSession(req) {
    const token = parseCookies(req).sid;
    if (!token) return null;
    const key = hashToken(token);
    const s = sessions.get(key);
    if (!s) return null;
    if (s.expires < Date.now()) {
        sessions.delete(key);
        pool.query("DELETE FROM sessions WHERE token_hash = $1", [key]).catch(console.error);
        return null;
    }
    return s;
}

function startSession(req, res, user) {
    const token = crypto.randomBytes(32).toString("hex");
    const key = hashToken(token);
    const expires = Date.now() + SESSION_MS;
    sessions.set(key, {
        username: user.username,
        fullname: user.fullname,
        expires
    });
    pool.query(
        "INSERT INTO sessions (token_hash, username, fullname, expires) VALUES ($1, $2, $3, $4)",
        [key, user.username, user.fullname, expires]
    ).catch(console.error);
    const secure = req.secure ? "; Secure" : "";
    res.setHeader(
        "Set-Cookie",
        `sid=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_MS / 1000}${secure}`
    );
}

function requireLogin(req, res, next) {
    if (!getSession(req)) {
        return res.status(401).json({ error: "Bạn cần đăng nhập" });
    }
    next();
}

function canDelete(req, book) {
    const s = getSession(req);
    if (!s) return false;
    if (ADMIN_USERS.includes(s.username)) return true;
    return Boolean(book.owner) && book.owner === s.username;
}

function coverName(row) {
    if (!row.cover_type) return null;
    return row.id + (row.cover_type === "image/png" ? ".png" : ".jpg");
}

function publicBook(row) {
    return {
        id: row.id,
        title: row.title,
        author: row.author,
        category: row.category,
        description: row.description,
        cover: coverName(row)
    };
}

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const ok = ["image/png", "image/jpeg"].includes(file.mimetype);
        cb(null, ok);
    }
});

app.use(express.json());

app.use("/dangnhap_dangki/users.json", (req, res) => {
    res.status(404).end();
});

app.get("/covers/:file", async (req, res) => {
    const id = parseInt(req.params.file, 10);
    if (!Number.isInteger(id)) return res.status(404).end();

    const { rows } = await pool.query(
        "SELECT cover_type, cover_data FROM books WHERE id = $1",
        [id]
    );
    if (!rows.length || !rows[0].cover_data) return res.status(404).end();

    res.set("Cache-Control", "public, max-age=86400");
    res.type(rows[0].cover_type).send(rows[0].cover_data);
});

app.get("/index.html", (req, res) => res.redirect(301, "/"));

app.use(express.static(path.join(__dirname, "..", "public")));

app.get("/dangki", (req, res) => res.redirect("/dangnhap_dangki/dangki.html"));
app.get("/dangnhap", (req, res) => res.redirect("/dangnhap_dangki/dangnhap.html"));

app.get("/sitemap.xml", async (req, res) => {
    const { rows } = await pool.query("SELECT id FROM books ORDER BY id");
    const base = req.protocol + "://" + req.get("host");
    const urls = [base + "/"].concat(
        rows.map(b => base + "/bookview/view.html?id=" + b.id)
    );
    const xml = '<?xml version="1.0" encoding="UTF-8"?>\n' +
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
        urls.map(u => "  <url><loc>" + u + "</loc></url>").join("\n") +
        "\n</urlset>";
    res.type("application/xml").send(xml);
});

app.post("/api/register", async (req, res) => {
    const fullname = String(req.body.fullname || "").trim();
    const username = String(req.body.username || "").trim().toLowerCase();
    const password = String(req.body.password || "");

    if (!fullname || !username || !password) {
        return res.status(400).json({ message: "Vui lòng điền đầy đủ các ô." });
    }
    if (username.length < 4) {
        return res.status(400).json({ message: "Tên đăng nhập phải có ít nhất 4 ký tự." });
    }
    if (!/^[a-z0-9_]+$/.test(username)) {
        return res.status(400).json({ message: "Tên đăng nhập chỉ gồm chữ không dấu, số và dấu gạch dưới." });
    }
    if (password.length < 6) {
        return res.status(400).json({ message: "Mật khẩu phải có ít nhất 6 ký tự." });
    }

    const salt = crypto.randomBytes(16).toString("hex");
    try {
        await pool.query(
            "INSERT INTO users (username, fullname, salt, hash) VALUES ($1, $2, $3, $4)",
            [username, fullname, salt, hashPassword(password, salt)]
        );
    } catch (err) {
        if (err.code === "23505") {
            return res.status(409).json({ message: "Tên đăng nhập đã tồn tại." });
        }
        throw err;
    }

    res.status(201).json({ ok: true });
});

app.post("/api/login", async (req, res) => {
    const username = String(req.body.username || "").trim().toLowerCase();
    const password = String(req.body.password || "");

    const { rows } = await pool.query("SELECT * FROM users WHERE username = $1", [username]);
    const user = rows[0];

    if (!user || !checkPassword(password, user)) {
        return res.status(401).json({ message: "Sai tên đăng nhập hoặc mật khẩu." });
    }

    startSession(req, res, user);
    res.json({ ok: true, fullname: user.fullname });
});

app.post("/api/logout", (req, res) => {
    const token = parseCookies(req).sid;
    if (token) {
        const key = hashToken(token);
        sessions.delete(key);
        pool.query("DELETE FROM sessions WHERE token_hash = $1", [key]).catch(console.error);
    }
    res.setHeader("Set-Cookie", "sid=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0");
    res.json({ ok: true });
});

app.get("/api/me", async (req, res) => {
    const s = getSession(req);
    if (!s) return res.status(401).json({ error: "Chưa đăng nhập" });

    const { rows } = await pool.query(
        "SELECT count(*)::int AS n FROM requests WHERE owner = $1 AND status = 'pending'",
        [s.username]
    );

    res.json({ username: s.username, fullname: s.fullname, pendingRequests: rows[0].n });
});

app.delete("/api/account", requireLogin, async (req, res) => {
    const s = getSession(req);
    const password = String(req.body.password || "");
    const deleteBooks = Boolean(req.body.deleteBooks);

    const { rows } = await pool.query("SELECT * FROM users WHERE username = $1", [s.username]);
    if (!rows.length || !checkPassword(password, rows[0])) {
        return res.status(401).json({ message: "Mật khẩu không đúng." });
    }

    const client = await pool.connect();
    try {
        await client.query("BEGIN");

        await client.query(
            "UPDATE requests SET status = 'closed' WHERE owner = $1 AND status = 'pending'",
            [s.username]
        );
        await client.query("DELETE FROM requests WHERE requester = $1", [s.username]);

        if (deleteBooks) {
            await client.query("DELETE FROM books WHERE owner = $1", [s.username]);
        } else {
            await client.query("UPDATE books SET owner = NULL WHERE owner = $1", [s.username]);
        }
        await client.query("DELETE FROM users WHERE username = $1", [s.username]);
        await client.query("COMMIT");
    } catch (err) {
        await client.query("ROLLBACK");
        throw err;
    } finally {
        client.release();
    }

    for (const [key, sess] of sessions) {
        if (sess.username === s.username) sessions.delete(key);
    }
    await pool.query("DELETE FROM sessions WHERE username = $1", [s.username]);

    res.setHeader("Set-Cookie", "sid=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0");
    res.json({ ok: true });
});

app.get("/api/book", async (req, res) => {
    const id = Number(req.query.id);
    if (!Number.isInteger(id)) {
        return res.status(404).json({ error: "Book not found" });
    }

    const { rows } = await pool.query(
        "SELECT id, title, author, category, description, owner, cover_type FROM books WHERE id = $1",
        [id]
    );
    if (!rows.length) {
        return res.status(404).json({ error: "Book not found" });
    }

    const book = rows[0];
    const s = getSession(req);

    let myRequest = null;
    if (s) {
        const r = await pool.query(
            "SELECT 1 FROM requests WHERE book_id = $1 AND requester = $2 AND status = 'pending'",
            [id, s.username]
        );
        if (r.rows.length) myRequest = "pending";
    }

    res.json({
        ...publicBook(book),
        canDelete: canDelete(req, book),
        loggedIn: Boolean(s),
        hasOwner: Boolean(book.owner),
        isOwner: Boolean(s) && book.owner === s.username,
        myRequest
    });
});

app.get("/api/books", async (req, res) => {
    const q = String(req.query.q || "").toLowerCase();
    const category = String(req.query.category || "").toLowerCase();

    const { rows } = await pool.query(
        `SELECT id, title, author, category, description, cover_type
         FROM books
         WHERE position($1 in lower(coalesce(title, ''))) > 0
           AND ($2 = '' OR lower(coalesce(category, '')) = $2)
         ORDER BY id`,
        [q, category]
    );

    res.json(rows.map(publicBook));
});

app.post("/api/books", requireLogin, upload.single("cover"), async (req, res) => {
    const { title, author, category, description } = req.body;

    if (!title || !title.trim()) {
        return res.status(400).json({ error: "Title is required" });
    }

    const file = req.file;
    const { rows } = await pool.query(
        `INSERT INTO books (title, author, category, description, owner, cover_type, cover_data)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id, title, author, category, description, cover_type`,
        [
            title.trim(),
            author || null,
            category || null,
            description || null,
            getSession(req).username,
            file ? file.mimetype : null,
            file ? file.buffer : null
        ]
    );

    tracked.shared = tracked.shared + 1;
    res.status(201).json(publicBook(rows[0]));
});

app.delete("/api/books/:id", requireLogin, async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
        return res.status(404).json({ error: "Không tìm thấy sách" });
    }

    const { rows } = await pool.query("SELECT id, owner FROM books WHERE id = $1", [id]);
    if (!rows.length) {
        return res.status(404).json({ error: "Không tìm thấy sách" });
    }

    if (!canDelete(req, rows[0])) {
        return res.status(403).json({ error: "Bạn không có quyền xoá sách này" });
    }

    await pool.query(
        "UPDATE requests SET status = 'closed' WHERE book_id = $1 AND status = 'pending'",
        [id]
    );
    await pool.query("DELETE FROM books WHERE id = $1", [id]);

    tracked.shared = tracked.shared - 1;
    res.json({ ok: true });
});

app.post("/api/books/:id/request", requireLogin, async (req, res) => {
    const s = getSession(req);
    const id = Number(req.params.id);

    if (!Number.isInteger(id)) {
        return res.status(404).json({ error: "Không tìm thấy sách" });
    }

    const { rows } = await pool.query("SELECT id, title, owner FROM books WHERE id = $1", [id]);
    const book = rows[0];
    if (!book) {
        return res.status(404).json({ error: "Không tìm thấy sách" });
    }
    if (!book.owner) {
        return res.status(400).json({ error: "Sách này không có người đăng để nhận yêu cầu." });
    }
    if (book.owner === s.username) {
        return res.status(400).json({ error: "Đây là sách của bạn." });
    }

    const ownerRow = await pool.query("SELECT fullname FROM users WHERE username = $1", [book.owner]);
    if (!ownerRow.rows.length) {
        return res.status(400).json({ error: "Không tìm thấy người đăng sách này." });
    }

    try {
        await pool.query(
            `INSERT INTO requests
                (book_id, book_title, owner, owner_name, requester, requester_name, message)
             VALUES ($1, $2, $3, $4, $5, $6, '')`,
            [id, book.title, book.owner, ownerRow.rows[0].fullname, s.username, s.fullname]
        );
    } catch (err) {
        if (err.code === "23505") {
            return res.status(409).json({ error: "Bạn đã gửi yêu cầu cho cuốn này rồi." });
        }
        throw err;
    }

    res.status(201).json({ ok: true });
});

app.get("/api/requests/incoming", requireLogin, async (req, res) => {
    const s = getSession(req);
    const { rows } = await pool.query(
        `SELECT id, book_id, book_title, requester_name, status, pickup, created_at
         FROM requests
         WHERE owner = $1 AND owner_deleted = false
         ORDER BY (status = 'pending') DESC, created_at DESC
         LIMIT 200`,
        [s.username]
    );
    res.json(rows);
});

app.get("/api/requests/outgoing", requireLogin, async (req, res) => {
    const s = getSession(req);
    const { rows } = await pool.query(
        `SELECT id, book_id, book_title, owner_name, status, pickup, requester_seen, created_at
         FROM requests
         WHERE requester = $1 AND requester_deleted = false
         ORDER BY created_at DESC
         LIMIT 200`,
        [s.username]
    );
    res.json(rows);
});

app.post("/api/requests/:id/seen", requireLogin, async (req, res) => {
    const s = getSession(req);
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
        return res.status(404).json({ error: "Không tìm thấy thư" });
    }

    await pool.query(
        "UPDATE requests SET requester_seen = true WHERE id = $1 AND requester = $2",
        [id, s.username]
    );
    res.json({ ok: true });
});

app.delete("/api/requests/:id", requireLogin, async (req, res) => {
    const s = getSession(req);
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
        return res.status(404).json({ error: "Không tìm thấy thư" });
    }

    const { rows } = await pool.query(
        "SELECT id, owner, requester, status FROM requests WHERE id = $1",
        [id]
    );
    const r = rows[0];
    if (!r || (r.owner !== s.username && r.requester !== s.username)) {
        return res.status(404).json({ error: "Không tìm thấy thư" });
    }
    if (r.status === "pending") {
        return res.status(400).json({ error: "Thư đang chờ xử lý. Hãy trả lời hoặc huỷ yêu cầu trước khi xoá." });
    }

    const column = r.owner === s.username ? "owner_deleted" : "requester_deleted";
    await pool.query("UPDATE requests SET " + column + " = true WHERE id = $1", [id]);
    await pool.query(
        "DELETE FROM requests WHERE id = $1 AND owner_deleted AND requester_deleted",
        [id]
    );
    res.json({ ok: true });
});

app.delete("/api/requests", requireLogin, async (req, res) => {
    const s = getSession(req);
    const box = String(req.query.box || "");

    if (box === "in") {
        await pool.query(
            "UPDATE requests SET owner_deleted = true WHERE owner = $1 AND status <> 'pending'",
            [s.username]
        );
    } else if (box === "out") {
        await pool.query(
            "UPDATE requests SET requester_deleted = true WHERE requester = $1 AND status <> 'pending'",
            [s.username]
        );
    } else {
        return res.status(400).json({ error: "Thiếu thông tin hộp thư." });
    }

    await pool.query("DELETE FROM requests WHERE owner_deleted AND requester_deleted");
    res.json({ ok: true });
});

app.post("/api/requests/:id/accept", requireLogin, async (req, res) => {
    const s = getSession(req);
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
        return res.status(404).json({ error: "Không tìm thấy yêu cầu" });
    }

    const place = String(req.body.place || "");
    const className = String(req.body.className || "").trim();
    let pickup;
    if (place === "phong-doi") {
        pickup = "Phòng Thư viện";
    } else if (place === "lop") {
        if (!className) {
            return res.status(400).json({ error: "Hãy ghi lớp nhận sách." });
        }
        if (className.length > 20) {
            return res.status(400).json({ error: "Tên lớp tối đa 20 ký tự." });
        }
        pickup = "Lớp " + className;
    } else {
        return res.status(400).json({ error: "Hãy chọn nơi nhận sách." });
    }

    const client = await pool.connect();
    try {
        await client.query("BEGIN");

        const { rows } = await client.query("SELECT * FROM requests WHERE id = $1 FOR UPDATE", [id]);
        const r = rows[0];

        if (!r || r.owner !== s.username) {
            await client.query("ROLLBACK");
            return res.status(404).json({ error: "Không tìm thấy yêu cầu" });
        }
        if (r.status !== "pending") {
            await client.query("ROLLBACK");
            return res.status(409).json({ error: "Yêu cầu này đã được xử lý rồi." });
        }

        await client.query(
            "UPDATE requests SET status = 'accepted', pickup = $2 WHERE id = $1",
            [id, pickup]
        );
        await client.query(
            "UPDATE requests SET status = 'closed' WHERE book_id = $1 AND status = 'pending' AND id <> $2",
            [r.book_id, id]
        );
        await client.query("DELETE FROM books WHERE id = $1", [r.book_id]);

        await client.query("COMMIT");
        tracked.given = tracked.given + 1;
        res.json({ ok: true });
    } catch (err) {
        await client.query("ROLLBACK");
        throw err;
    } finally {
        client.release();
    }
});

app.post("/api/requests/:id/decline", requireLogin, async (req, res) => {
    const s = getSession(req);
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
        return res.status(404).json({ error: "Không tìm thấy yêu cầu" });
    }

    const result = await pool.query(
        "UPDATE requests SET status = 'declined' WHERE id = $1 AND owner = $2 AND status = 'pending'",
        [id, s.username]
    );
    if (!result.rowCount) {
        return res.status(404).json({ error: "Không tìm thấy yêu cầu đang chờ" });
    }
    res.json({ ok: true });
});

app.post("/api/requests/:id/cancel", requireLogin, async (req, res) => {
    const s = getSession(req);
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
        return res.status(404).json({ error: "Không tìm thấy yêu cầu" });
    }

    const result = await pool.query(
        "UPDATE requests SET status = 'cancelled' WHERE id = $1 AND requester = $2 AND status = 'pending'",
        [id, s.username]
    );
    if (!result.rowCount) {
        return res.status(404).json({ error: "Không tìm thấy yêu cầu đang chờ" });
    }
    res.json({ ok: true });
});

app.get("/api/stats", async(req, res) => {
    const t = await pool.query(
        `
        SELECT to_char(day, 'DD/MM') AS day, shared, given
        FROM statistics
        WHERE day >= date_trunc('month', CURRENT_DATE)
          AND day <  date_trunc('month', CURRENT_DATE) + interval '1 month'
        ORDER BY statistics.day;
        `
    );
    res.json(t.rows);
})

app.post("/api/stats", async(req, res) => {
    const { day, shared, given } = req.body
    await pool.query(
        `
        INSERT INTO statistics (day, shared, given) VALUES ($1, $2, $3);
        `,
        [day, shared, given]
    );

    res.json({ ok : true })
})

app.use((err, req, res, next) => {
    if (err instanceof multer.MulterError) {
        const message = err.code === "LIMIT_FILE_SIZE"
            ? "Cover is too big (max 5 MB)"
            : err.message;
        return res.status(400).json({ error: message });
    }
    console.error(err);
    res.status(500).json({ error: "Server error", message: "Lỗi máy chủ, hãy thử lại sau." });
});

const PORT = process.env.PORT || 3000;

initDb()
    .then(() => {
        app.listen(PORT, () => {
            console.log("Server running on port " + PORT);
        });
    })
    .catch(err => {
        console.error("Không kết nối được database:", err.message);
        process.exit(1);
    });

setInterval(() => {
    const { shared, given } = tracked

    if (shared === 0 && given === 0) return;

    pool.query(
        `
        INSERT INTO statistics (day, shared, given) VALUES (CURRENT_DATE, $1, $2)
        ON CONFLICT (day) DO UPDATE SET 
            shared = statistics.shared + EXCLUDED.shared,
            given = statistics.given + EXCLUDED.given;
        `,
        [shared, given]
    )

    tracked.shared = 0;
    tracked.given = 0;
}, 10 * 60 * 1000);
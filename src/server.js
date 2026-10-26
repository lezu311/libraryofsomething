const express = require("express");
const path = require("path");
const multer = require("multer");
const crypto = require("crypto");
const { Pool } = require("pg");

const app = express();

// Render đứng sau proxy: cần để req.protocol / req.secure đúng (https)
app.set("trust proxy", true);

// ---------- kết nối database ----------
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
    console.error("Thiếu biến môi trường DATABASE_URL (xem hướng dẫn nối database).");
    process.exit(1);
}

// Internal URL của Render không cần SSL, External URL (có render.com) thì cần
const useSsl = DATABASE_URL.includes("render.com") || process.env.PGSSL === "true";
const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: useSsl ? { rejectUnauthorized: false } : false
});

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
    // yêu cầu nhận sách. status: pending | accepted | declined | cancelled | closed
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
    // nơi lấy sách do người đăng chọn khi đồng ý (Phòng Đội / Lớp ...)
    await pool.query("ALTER TABLE requests ADD COLUMN IF NOT EXISTS pickup TEXT");
    // mỗi người chỉ có 1 yêu cầu đang chờ cho mỗi cuốn sách
    await pool.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS one_pending_request
        ON requests (book_id, requester) WHERE status = 'pending'
    `);
}

// quản trị viên: xoá được mọi sách. Ví dụ ADMIN_USERS=tin,admin
const ADMIN_USERS = (process.env.ADMIN_USERS || "")
    .split(",")
    .map(s => s.trim().toLowerCase())
    .filter(Boolean);

// ---------- mật khẩu ----------
function hashPassword(password, salt) {
    return crypto.scryptSync(password, salt, 64).toString("hex");
}

function checkPassword(password, user) {
    const a = Buffer.from(hashPassword(password, user.salt), "hex");
    const b = Buffer.from(user.hash, "hex");
    return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// ---------- sessions (lưu trong bộ nhớ: deploy lại thì phải đăng nhập lại) ----------
const SESSION_MS = 7 * 24 * 60 * 60 * 1000; // 7 ngày
const sessions = new Map(); // token -> { username, fullname, expires }

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
    const s = token && sessions.get(token);
    if (!s) return null;
    if (s.expires < Date.now()) {
        sessions.delete(token);
        return null;
    }
    return s;
}

function startSession(req, res, user) {
    const token = crypto.randomBytes(32).toString("hex");
    sessions.set(token, {
        username: user.username,
        fullname: user.fullname,
        expires: Date.now() + SESSION_MS
    });
    const secure = req.secure ? "; Secure" : "";
    res.setHeader(
        "Set-Cookie",
        `sid=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_MS / 1000}${secure}`
    );
}

// chặn người chưa đăng nhập
function requireLogin(req, res, next) {
    if (!getSession(req)) {
        return res.status(401).json({ error: "Bạn cần đăng nhập" });
    }
    next();
}

// ---------- sách ----------
// được xoá: quản trị viên, hoặc chính người đã đăng cuốn đó
function canDelete(req, book) {
    const s = getSession(req);
    if (!s) return false;
    if (ADMIN_USERS.includes(s.username)) return true;
    return Boolean(book.owner) && book.owner === s.username;
}

// tên file ảnh bìa gửi cho trình duyệt (vd "5.png"); ảnh thật nằm trong database
function coverName(row) {
    if (!row.cover_type) return null;
    return row.id + (row.cover_type === "image/png" ? ".png" : ".jpg");
}

// dữ liệu gửi ra ngoài (không lộ owner)
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

// ---------- upload (giữ ảnh trong bộ nhớ rồi ghi vào database) ----------
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 1024 * 1024 }, // 1 MB
    fileFilter: (req, file, cb) => {
        const ok = ["image/png", "image/jpeg"].includes(file.mimetype);
        cb(null, ok);
    }
});

// ---------- middleware ----------
app.use(express.json());

// file cũ, không còn dùng nhưng vẫn chặn cho chắc
app.use("/dangnhap_dangki/users.json", (req, res) => {
    res.status(404).end();
});

// ảnh bìa lấy từ database
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

app.use(express.static(path.join(__dirname, "..", "public")));

// ---------- đường dẫn ngắn ----------
app.get("/dangki", (req, res) => res.redirect("/dangnhap_dangki/dangki.html"));
app.get("/dangnhap", (req, res) => res.redirect("/dangnhap_dangki/dangnhap.html"));

// ---------- sitemap cho Google ----------
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

// ---------- auth routes ----------
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
        if (err.code === "23505") { // trùng khoá chính
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
    if (token) sessions.delete(token);
    res.setHeader("Set-Cookie", "sid=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0");
    res.json({ ok: true });
});

app.get("/api/me", async (req, res) => {
    const s = getSession(req);
    if (!s) return res.status(401).json({ error: "Chưa đăng nhập" });

    // số yêu cầu nhận sách đang chờ mình xử lý (hiện trên nút "Thông báo")
    const { rows } = await pool.query(
        "SELECT count(*)::int AS n FROM requests WHERE owner = $1 AND status = 'pending'",
        [s.username]
    );

    res.json({ username: s.username, fullname: s.fullname, pendingRequests: rows[0].n });
});

// xoá tài khoản (phải nhập lại mật khẩu)
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

        // yêu cầu đang chờ gửi tới mình thì đóng lại (mình không còn để trả lời)
        await client.query(
            "UPDATE requests SET status = 'closed' WHERE owner = $1 AND status = 'pending'",
            [s.username]
        );
        // yêu cầu mình đã gửi thì xoá luôn
        await client.query("DELETE FROM requests WHERE requester = $1", [s.username]);

        if (deleteBooks) {
            await client.query("DELETE FROM books WHERE owner = $1", [s.username]);
        } else {
            // giữ sách nhưng bỏ chủ, để người đăng ký trùng tên sau này không nhận nhầm
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

    // đăng xuất mọi phiên của tài khoản này
    for (const [token, sess] of sessions) {
        if (sess.username === s.username) sessions.delete(token);
    }

    res.setHeader("Set-Cookie", "sid=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0");
    res.json({ ok: true });
});

// ---------- book routes ----------
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

    // mình đã gửi yêu cầu nhận cuốn này và đang chờ chưa?
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

// add a book (chỉ người đã đăng nhập)
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

    res.status(201).json(publicBook(rows[0]));
});

// xoá sách (chủ sách hoặc quản trị viên)
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

    // các yêu cầu đang chờ cho cuốn này không còn ý nghĩa nữa
    await pool.query(
        "UPDATE requests SET status = 'closed' WHERE book_id = $1 AND status = 'pending'",
        [id]
    );
    await pool.query("DELETE FROM books WHERE id = $1", [id]);
    res.json({ ok: true });
});

// ---------- yêu cầu nhận sách ----------

// gửi yêu cầu nhận một cuốn sách (không cần ghi gì thêm)
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

// thông báo: yêu cầu người khác gửi tới mình
app.get("/api/requests/incoming", requireLogin, async (req, res) => {
    const s = getSession(req);
    const { rows } = await pool.query(
        `SELECT id, book_id, book_title, requester_name, status, pickup, created_at
         FROM requests
         WHERE owner = $1
         ORDER BY (status = 'pending') DESC, created_at DESC
         LIMIT 100`,
        [s.username]
    );
    res.json(rows);
});

// thông báo: yêu cầu mình đã gửi đi
app.get("/api/requests/outgoing", requireLogin, async (req, res) => {
    const s = getSession(req);
    const { rows } = await pool.query(
        `SELECT id, book_id, book_title, owner_name, status, pickup, created_at
         FROM requests
         WHERE requester = $1
         ORDER BY created_at DESC
         LIMIT 100`,
        [s.username]
    );
    res.json(rows);
});

// người đăng ĐỒNG Ý và chọn nơi lấy sách: sách bị xoá khỏi web
app.post("/api/requests/:id/accept", requireLogin, async (req, res) => {
    const s = getSession(req);
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
        return res.status(404).json({ error: "Không tìm thấy yêu cầu" });
    }

    // nơi lấy sách: Phòng Đội hoặc ở lớp
    const place = String(req.body.place || "");
    const className = String(req.body.className || "").trim();
    let pickup;
    if (place === "phong-doi") {
        pickup = "Phòng Đội";
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
        // những người khác xin cùng cuốn này: đóng lại
        await client.query(
            "UPDATE requests SET status = 'closed' WHERE book_id = $1 AND status = 'pending' AND id <> $2",
            [r.book_id, id]
        );
        // đã cho đi thì xoá sách
        await client.query("DELETE FROM books WHERE id = $1", [r.book_id]);

        await client.query("COMMIT");
        res.json({ ok: true });
    } catch (err) {
        await client.query("ROLLBACK");
        throw err;
    } finally {
        client.release();
    }
});

// người đăng TỪ CHỐI
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

// người xin tự HUỶ yêu cầu của mình
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

app.use((err, req, res, next) => {
    if (err instanceof multer.MulterError) {
        const message = err.code === "LIMIT_FILE_SIZE"
            ? "Cover is too big (max 1 MB)"
            : err.message;
        return res.status(400).json({ error: message });
    }
    console.error(err);
    res.status(500).json({ error: "Server error", message: "Lỗi máy chủ, hãy thử lại sau." });
});

// ---------- start ----------
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
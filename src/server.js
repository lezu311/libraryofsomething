const express = require("express");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const crypto = require("crypto");

const app = express();
app.set("trust proxy", true);
const DATA_DIR = process.env.DATA_DIR || null;

const booksPath = DATA_DIR
    ? path.join(DATA_DIR, "books.json")
    : path.join(__dirname, "..", "data", "books.json");

const usersPath = DATA_DIR
    ? path.join(DATA_DIR, "users.json")
    : path.join(__dirname, "..", "public", "dangnhap_dangki", "users.json");

const coversDir = DATA_DIR
    ? path.join(DATA_DIR, "covers")
    : path.join(__dirname, "..", "public", "covers");

fs.mkdirSync(path.dirname(booksPath), { recursive: true });
fs.mkdirSync(path.dirname(usersPath), { recursive: true });
fs.mkdirSync(coversDir, { recursive: true });

function readJsonArray(file) {
    try {
        const data = JSON.parse(fs.readFileSync(file, "utf8"));
        return Array.isArray(data) ? data : [];
    } catch (err) {
        return [];
    }
}

const books = readJsonArray(booksPath);

function nextId() {
    return books.length ? Math.max(...books.map(b => b.id)) + 1 : 1;
}

function saveBooks() {
    fs.writeFileSync(booksPath, JSON.stringify(books, null, 2));
}

const users = readJsonArray(usersPath);

function saveUsers() {
    fs.writeFileSync(usersPath, JSON.stringify(users, null, 2));
}

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

function requireLogin(req, res, next) {
    if (!getSession(req)) {
        return res.status(401).json({ error: "Bạn cần đăng nhập để đăng sách" });
    }
    next();
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, coversDir),
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        req.newId = nextId();
        cb(null, req.newId + ext);
    }
});

const upload = multer({
    storage,
    limits: { fileSize: 1024 * 1024 }, // 1 MB
    fileFilter: (req, file, cb) => {
        const ok = ["image/png", "image/jpeg"].includes(file.mimetype);
        cb(null, ok);
    }
});

app.use(express.json());

app.use("/dangnhap_dangki/users.json", (req, res) => {
    res.status(404).end();
});

app.use("/covers", express.static(coversDir));

app.use(express.static(path.join(__dirname, "..", "public")));

app.get("/dangki", (req, res) => res.redirect("/dangnhap_dangki/dangki.html"));
app.get("/dangnhap", (req, res) => res.redirect("/dangnhap_dangki/dangnhap.html"));

app.get("/sitemap.xml", (req, res) => {
    const base = req.protocol + "://" + req.get("host");
    const urls = [base + "/"].concat(
        books.map(b => base + "/bookview/view.html?id=" + b.id)
    );
    const xml = '<?xml version="1.0" encoding="UTF-8"?>\n' +
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
        urls.map(u => "  <url><loc>" + u + "</loc></url>").join("\n") +
        "\n</urlset>";
    res.type("application/xml").send(xml);
});

app.post("/api/register", (req, res) => {
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
    if (users.some(u => u.username === username)) {
        return res.status(409).json({ message: "Tên đăng nhập đã tồn tại." });
    }

    const salt = crypto.randomBytes(16).toString("hex");
    users.push({
        username,
        fullname,
        salt,
        hash: hashPassword(password, salt),
        createdAt: new Date().toISOString()
    });
    saveUsers();

    res.status(201).json({ ok: true });
});

app.post("/api/login", (req, res) => {
    const username = String(req.body.username || "").trim().toLowerCase();
    const password = String(req.body.password || "");

    const user = users.find(u => u.username === username);

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

app.get("/api/me", (req, res) => {
    const s = getSession(req);
    if (!s) return res.status(401).json({ error: "Chưa đăng nhập" });
    res.json({ username: s.username, fullname: s.fullname });
});

app.get("/api/book", (req, res) => {
    const book = books.find(b => b.id === Number(req.query.id));

    if (!book) {
        return res.status(404).json({ error: "Book not found" });
    }

    res.json(book);
});

app.get("/api/books", (req, res) => {
    const q = (req.query.q || "").toLowerCase();
    const category = (req.query.category || "").toLowerCase();

    const result = books.filter(b => {
        const titleOk = (b.title || "").toLowerCase().includes(q);
        const categoryOk = !category || (b.category || "").toLowerCase() === category;
        return titleOk && categoryOk;
    });

    res.json(result);
});

app.post("/api/books", requireLogin, upload.single("cover"), (req, res) => {
    const { title, author, category, description } = req.body;

    if (!title || !title.trim()) {
        return res.status(400).json({ error: "Title is required" });
    }

    const book = {
        id: req.newId ?? nextId(),
        title: title.trim(),
        author,
        category,
        description,
        cover: req.file ? req.file.filename : null
    };

    books.push(book);
    saveBooks();

    res.status(201).json(book);
});

app.use((err, req, res, next) => {
    if (err instanceof multer.MulterError) {
        const message = err.code === "LIMIT_FILE_SIZE"
            ? "Cover is too big (max 1 MB)"
            : err.message;
        return res.status(400).json({ error: message });
    }
    console.error(err);
    res.status(500).json({ error: "Server error" });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log("Server running on port " + PORT);
    console.log("Data folder: " + (DATA_DIR || "local project folders"));
});
const express = require("express");
const path = require("path");
const fs = require("fs");
const multer = require("multer");

const app = express();

// ---------- data ----------
const booksPath = path.join(__dirname, "..", "data", "books.json");
fs.mkdirSync(path.dirname(booksPath), { recursive: true });
if (!fs.existsSync(booksPath)) fs.writeFileSync(booksPath, "[]");

const books = JSON.parse(fs.readFileSync(booksPath, "utf8"));

function nextId() {
    return books.length ? Math.max(...books.map(b => b.id)) + 1 : 1;
}

function saveBooks() {
    fs.writeFileSync(booksPath, JSON.stringify(books, null, 2));
}

// ---------- uploads ----------
const coversDir = path.join(__dirname, "..", "public", "covers");
fs.mkdirSync(coversDir, { recursive: true });

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

// ---------- static files ----------
app.use(express.static(path.join(__dirname, "..", "public")));

// ---------- routes ----------

// one book:  /api/book?id=3
app.get("/api/book", (req, res) => {
    const book = books.find(b => b.id === Number(req.query.id));

    if (!book) {
        return res.status(404).json({ error: "Book not found" });
    }

    res.json(book);
});

// list / search:  /api/books  or  /api/books?q=harry  or  /api/books?category=Science
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

// add a book (NO LOGIN CHECK YET - keep this on your own computer)
app.post("/api/books", upload.single("cover"), (req, res) => {
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

// turns multer errors (like "file too large") into a readable answer
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

// ---------- start ----------
app.listen(3000, () => {
    console.log("Server running at http://localhost:3000");
});

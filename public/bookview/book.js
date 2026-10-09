const bookParams = new URLSearchParams(window.location.search);
const bookId = bookParams.get("id");

async function loadBook(reqId) {
    const preview = document.querySelector("#book-preview");

    if (!reqId) {
        preview.textContent = "No book selected";
        return;
    }

    const res = await fetch("/api/book?id=" + reqId);

    if (!res.ok) {
        preview.textContent = "Book not found";
        return;
    }

    const book = await res.json();

    document.title = book.title + " - BookShare";
    document.querySelector(".book-title").textContent = book.title;
    document.querySelector(".book-author").textContent = "Author: " + (book.author || "Unknown");
    document.querySelector(".book-category").textContent = "Category: " + (book.category || "None");
    document.querySelector(".book-description").textContent = book.description || "";

    const img = document.querySelector(".book-cover img");
    if (book.cover) {
        img.src = "/covers/" + book.cover;
        img.alt = "Cover of " + book.title;
    } else {
        // no cover uploaded: hide the broken image and show a gray box instead
        img.remove();
        document.querySelector(".book-cover").classList.add("cover-placeholder");
    }
}

loadBook(bookId);

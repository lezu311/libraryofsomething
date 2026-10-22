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

    // chỉ chủ sách / quản trị viên mới thấy nút xoá
    if (book.canDelete) {
        const deleteButton = document.querySelector("#delete-button");
        deleteButton.hidden = false;

        deleteButton.addEventListener("click", async () => {
            if (!confirm("Bạn chắc chắn muốn xoá sách \"" + book.title + "\"? Không thể khôi phục.")) {
                return;
            }

            deleteButton.disabled = true;

            try {
                const delRes = await fetch("/api/books/" + book.id, { method: "DELETE" });
                const data = await delRes.json().catch(() => ({}));

                if (!delRes.ok) {
                    alert(data.error || "Không xoá được sách.");
                    deleteButton.disabled = false;
                    return;
                }

                window.location.href = "/index.html";
            } catch (err) {
                alert("Không kết nối được tới máy chủ.");
                deleteButton.disabled = false;
            }
        });
    }
}

loadBook(bookId);
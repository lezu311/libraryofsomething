const bookParams = new URLSearchParams(window.location.search);
const bookId = bookParams.get("id");

// khu vực nhận sách: hiện nút / thông báo tuỳ người xem là ai
function setupRequestBox(book) {
    const button = document.querySelector("#request-button");
    const status = document.querySelector("#request-status");
    const link = document.querySelector("#request-link");

    function say(text, isError) {
        status.textContent = text;
        status.classList.toggle("error", Boolean(isError));
    }

    // chính người đăng
    if (book.isOwner) {
        say("Đây là sách bạn đăng. Người muốn nhận sẽ gửi yêu cầu, bạn chọn nơi trao sách trong mục Thông báo.");
        link.hidden = false;
        return;
    }

    // sách không có người đăng (sách cũ hoặc tài khoản đã xoá)
    if (!book.hasOwner) {
        say("Sách này không có người đăng nên chưa thể gửi yêu cầu nhận.");
        return;
    }

    // chưa đăng nhập
    if (!book.loggedIn) {
        say("Đăng nhập để gửi yêu cầu nhận sách này.");
        link.textContent = "Đăng nhập →";
        link.href = "/dangnhap_dangki/dangnhap.html";
        link.hidden = false;
        return;
    }

    // đã gửi rồi, đang chờ
    if (book.myRequest === "pending") {
        say("Bạn đã gửi yêu cầu, đang chờ người đăng đồng ý.");
        link.hidden = false;
        return;
    }

    // được phép xin: hiện nút Nhận sách
    button.hidden = false;

    button.addEventListener("click", async () => {
        if (!confirm("Gửi yêu cầu nhận sách \"" + book.title + "\" cho người đăng?")) return;

        button.disabled = true;
        say("Đang gửi...");

        try {
            const res = await fetch("/api/books/" + book.id + "/request", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: "{}"
            });
            const data = await res.json().catch(() => ({}));

            if (!res.ok) {
                say(data.error || "Không gửi được yêu cầu.", true);
                button.disabled = false;
                return;
            }

            button.hidden = true;
            say("Đã gửi yêu cầu! Khi người đăng đồng ý, nơi nhận sách sẽ hiện trong mục Thông báo.");
            link.hidden = false;
        } catch (err) {
            say("Không kết nối được tới máy chủ.", true);
            button.disabled = false;
        }
    });
}

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

    setupRequestBox(book);

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
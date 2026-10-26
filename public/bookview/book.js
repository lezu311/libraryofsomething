const bookParams = new URLSearchParams(window.location.search);
const bookId = bookParams.get("id");

// khu vực nhận sách: hiện nút / thông báo tuỳ người xem là ai
function setupRequestBox(book) {
    const button = document.querySelector("#request-button");
    const form = document.querySelector("#request-form");
    const closeButton = document.querySelector("#request-close");
    const messageInput = document.querySelector("#request-message");
    const status = document.querySelector("#request-status");
    const link = document.querySelector("#request-link");

    function say(text, isError) {
        status.textContent = text;
        status.classList.toggle("error", Boolean(isError));
    }

    // chính người đăng
    if (book.isOwner) {
        say("Đây là sách bạn đăng. Người muốn nhận sẽ gửi yêu cầu cho bạn.");
        link.textContent = "Xem yêu cầu nhận sách →";
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

    button.addEventListener("click", () => {
        button.hidden = true;
        form.hidden = false;
        messageInput.focus();
    });

    closeButton.addEventListener("click", () => {
        form.hidden = true;
        button.hidden = false;
        say("");
    });

    form.addEventListener("submit", async (event) => {
        event.preventDefault();

        const message = messageInput.value.trim();
        if (!message) {
            say("Hãy ghi cách để người đăng liên lạc với bạn.", true);
            return;
        }

        const submit = form.querySelector("button[type=submit]");
        submit.disabled = true;
        say("Đang gửi...");

        try {
            const res = await fetch("/api/books/" + book.id + "/request", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ message })
            });
            const data = await res.json().catch(() => ({}));

            if (!res.ok) {
                say(data.error || "Không gửi được yêu cầu.", true);
                submit.disabled = false;
                return;
            }

            form.hidden = true;
            say("Đã gửi yêu cầu! Hãy chờ người đăng đồng ý.");
            link.hidden = false;
        } catch (err) {
            say("Không kết nối được tới máy chủ.", true);
            submit.disabled = false;
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
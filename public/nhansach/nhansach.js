const incomingBox = document.querySelector("#incoming-list");
const outgoingBox = document.querySelector("#outgoing-list");

const STATUS_TEXT = {
    pending: "Đang chờ",
    accepted: "Đã đồng ý",
    declined: "Bị từ chối",
    cancelled: "Đã huỷ",
    closed: "Sách không còn"
};

function formatDate(value) {
    return new Date(value).toLocaleDateString("vi-VN");
}

function makeTag(status) {
    const tag = document.createElement("span");
    tag.className = "status-tag status-" + status;
    tag.textContent = STATUS_TEXT[status] || status;
    return tag;
}

function makeTitle(r) {
    const h3 = document.createElement("h3");
    if (r.status === "pending") {
        const a = document.createElement("a");
        a.href = "/bookview/view.html?id=" + r.book_id;
        a.textContent = r.book_title;
        h3.appendChild(a);
    } else {
        h3.textContent = r.book_title;
    }
    return h3;
}

async function act(url, button, confirmText) {
    if (confirmText && !confirm(confirmText)) return;

    button.disabled = true;
    try {
        const res = await fetch(url, { method: "POST" });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
            alert(data.error || "Không thực hiện được.");
        }
    } catch (err) {
        alert("Không kết nối được tới máy chủ.");
    }
    loadAll();
}

// yêu cầu gửi tới mình
function incomingCard(r) {
    const card = document.createElement("div");
    card.className = "request-card";

    const meta = document.createElement("p");
    meta.className = "request-meta";
    meta.textContent = r.requester_name + " muốn nhận sách này · " + formatDate(r.created_at) + " · ";
    meta.appendChild(makeTag(r.status));

    const message = document.createElement("p");
    message.className = "request-message";
    message.textContent = r.message;

    card.append(makeTitle(r), meta, message);

    if (r.status === "pending") {
        const buttons = document.createElement("div");
        buttons.className = "request-buttons";

        const accept = document.createElement("button");
        accept.className = "btn-accept";
        accept.textContent = "Đồng ý";
        accept.addEventListener("click", () =>
            act(
                "/api/requests/" + r.id + "/accept",
                accept,
                "Đồng ý tặng sách \"" + r.book_title + "\" cho " + r.requester_name +
                "? Sách sẽ bị xoá khỏi web."
            )
        );

        const decline = document.createElement("button");
        decline.className = "btn-decline";
        decline.textContent = "Từ chối";
        decline.addEventListener("click", () =>
            act("/api/requests/" + r.id + "/decline", decline, "Từ chối yêu cầu này?")
        );

        buttons.append(accept, decline);
        card.appendChild(buttons);
    }

    return card;
}

// yêu cầu mình đã gửi
function outgoingCard(r) {
    const card = document.createElement("div");
    card.className = "request-card";

    const meta = document.createElement("p");
    meta.className = "request-meta";
    meta.textContent = "Người đăng: " + r.owner_name + " · " + formatDate(r.created_at) + " · ";
    meta.appendChild(makeTag(r.status));

    card.append(makeTitle(r), meta);

    if (r.status === "accepted") {
        const note = document.createElement("p");
        note.className = "request-message";
        note.textContent = "Người đăng đã đồng ý! Họ sẽ liên lạc với bạn qua thông tin bạn đã để lại.";
        card.appendChild(note);
    }

    if (r.status === "pending") {
        const buttons = document.createElement("div");
        buttons.className = "request-buttons";

        const cancel = document.createElement("button");
        cancel.className = "btn-cancel";
        cancel.textContent = "Huỷ yêu cầu";
        cancel.addEventListener("click", () =>
            act("/api/requests/" + r.id + "/cancel", cancel, "Huỷ yêu cầu này?")
        );

        buttons.appendChild(cancel);
        card.appendChild(buttons);
    }

    return card;
}

function render(box, list, makeCard, emptyText) {
    box.replaceChildren();

    if (!list.length) {
        const p = document.createElement("p");
        p.className = "empty";
        p.textContent = emptyText;
        box.appendChild(p);
        return;
    }

    for (const r of list) box.appendChild(makeCard(r));
}

async function loadAll() {
    try {
        const [inRes, outRes] = await Promise.all([
            fetch("/api/requests/incoming"),
            fetch("/api/requests/outgoing")
        ]);

        // chưa đăng nhập thì đưa về trang đăng nhập
        if (inRes.status === 401 || outRes.status === 401) {
            window.location.href = "/dangnhap_dangki/dangnhap.html";
            return;
        }

        render(incomingBox, await inRes.json(), incomingCard, "Chưa có ai xin nhận sách của bạn.");
        render(outgoingBox, await outRes.json(), outgoingCard, "Bạn chưa gửi yêu cầu nào.");
    } catch (err) {
        incomingBox.textContent = "Không kết nối được tới máy chủ.";
        outgoingBox.textContent = "";
    }
}

loadAll();
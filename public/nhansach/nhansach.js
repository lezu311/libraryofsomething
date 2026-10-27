const listEl = document.querySelector("#mail-list");
const detailEl = document.querySelector("#mail-detail");
const toolbarEl = document.querySelector("#mail-toolbar");
const titleEl = document.querySelector("#mail-title");
const refreshBtn = document.querySelector("#mail-refresh");

const tabs = {
    in: document.querySelector("#tab-inbox"),
    out: document.querySelector("#tab-sent")
};
const counts = {
    in: document.querySelector("#count-inbox"),
    out: document.querySelector("#count-sent")
};

let incoming = []; // yêu cầu người khác gửi cho mình
let outgoing = []; // yêu cầu mình đã gửi đi
let loaded = false;
let currentKind = "in"; // hộp thư đang xem

// ---------- biểu tượng (SVG nét mảnh) ----------
const ICON_PATHS = {
    inbox: '<polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
    send: '<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>',
    back: '<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>',
    check: '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>',
    clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
    x: '<circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/>',
    ban: '<circle cx="12" cy="12" r="10"/><path d="m4.9 4.9 14.2 14.2"/>',
    book: '<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>',
    pin: '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
    mail: '<rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>',
    refresh: '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
    home: '<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>',
    trash: '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/>'
};

function svg(name) {
    return '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
        'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
        (ICON_PATHS[name] || "") + "</svg>";
}

function iconEl(name) {
    const span = document.createElement("span");
    span.className = "ico-wrap";
    span.innerHTML = svg(name); // chỉ chứa icon cố định ở trên, không có chữ của người dùng
    return span;
}

// điền icon cho các chỗ có sẵn trong HTML
document.querySelectorAll("[data-icon]").forEach(node => {
    node.className = "ico-wrap";
    node.innerHTML = svg(node.dataset.icon);
});

// ---------- tiện ích ----------
function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
}

function strong(text) {
    return el("strong", "", text);
}

function para(...parts) {
    const p = el("p", "mail-para");
    for (const part of parts) p.append(part);
    return p;
}

// "vừa xong", "5 phút trước", "2 giờ trước", "3 ngày trước"
function timeAgo(value) {
    const seconds = Math.floor((Date.now() - new Date(value).getTime()) / 1000);
    if (seconds < 60) return "vừa xong";
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return minutes + " phút trước";
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return hours + " giờ trước";
    const days = Math.floor(hours / 24);
    if (days < 30) return days + " ngày trước";
    return new Date(value).toLocaleDateString("vi-VN");
}

// giờ trong danh sách: hôm nay -> "16:22", năm nay -> "26 thg 10", cũ hơn -> ngày đầy đủ
function listTime(value) {
    const d = new Date(value);
    const now = new Date();
    if (d.toDateString() === now.toDateString()) {
        return d.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
    }
    if (d.getFullYear() === now.getFullYear()) {
        return d.getDate() + " thg " + (d.getMonth() + 1);
    }
    return d.toLocaleDateString("vi-VN");
}

function fullTime(value) {
    const d = new Date(value);
    return d.toLocaleString("vi-VN", {
        day: "numeric", month: "numeric", year: "numeric",
        hour: "2-digit", minute: "2-digit"
    }) + " (" + timeAgo(value) + ")";
}

// avatar tròn, màu theo tên
const COLORS = ["#d93025", "#188038", "#1a73e8", "#e37400", "#9334e6", "#d01884", "#007b83", "#5f6368"];

function colorFor(name) {
    let h = 0;
    for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return COLORS[h % COLORS.length];
}

function makeAvatar(name, big) {
    const lastWord = name.trim().split(/\s+/).pop() || "?";
    const a = el("span", "avatar" + (big ? " big" : ""), lastWord.charAt(0).toUpperCase());
    a.style.backgroundColor = colorFor(name);
    return a;
}

// ---------- thư chưa đọc ----------
// hộp thư đến: thư đang chờ mình trả lời
// đã gửi: có kết quả mới (đồng ý / từ chối / sách không còn) mà mình chưa mở xem
// (trạng thái "đã xem" lưu trong database nên đổi máy vẫn đúng)
function isUnread(kind, r) {
    if (kind === "in") return r.status === "pending";
    return ["accepted", "declined", "closed"].includes(r.status) && !r.requester_seen;
}

function markSeen(r) {
    if (r.requester_seen) return;
    r.requester_seen = true;
    fetch("/api/requests/" + r.id + "/seen", { method: "POST" }).catch(() => {});
}

// thư đã xử lý thì mới được xoá
function canDeleteMail(r) {
    return r.status !== "pending";
}

// ---------- trạng thái ----------
const STATUS = {
    pending: { icon: "clock", cls: "pending" },
    accepted: { icon: "check", cls: "ok" },
    declined: { icon: "x", cls: "bad" },
    cancelled: { icon: "ban", cls: "off" },
    closed: { icon: "book", cls: "off" }
};

function statusLabel(kind, status) {
    const labels = {
        pending: "Đang chờ",
        accepted: "Đã đồng ý",
        declined: kind === "in" ? "Đã từ chối" : "Bị từ chối",
        cancelled: kind === "in" ? "Người xin đã huỷ" : "Đã huỷ",
        closed: "Sách không còn"
    };
    return labels[status] || status;
}

function makeChip(kind, status, extraClass) {
    const s = STATUS[status] || STATUS.closed;
    const chip = el("span", "chip chip-" + s.cls + (extraClass ? " " + extraClass : ""));
    chip.append(iconEl(s.icon), statusLabel(kind, status));
    return chip;
}

// đoạn xem trước trong danh sách
function snippetText(kind, r) {
    if (kind === "in") {
        switch (r.status) {
            case "pending": return "Đang chờ bạn trả lời. Chọn nơi trao sách rồi bấm Đồng ý.";
            case "accepted": return "Bạn đã đồng ý · Nơi trao sách: " + (r.pickup || "");
            case "declined": return "Bạn đã từ chối yêu cầu này.";
            case "cancelled": return "Người xin đã huỷ yêu cầu.";
            default: return "Sách không còn trên web.";
        }
    }
    switch (r.status) {
        case "pending": return "Đang chờ " + r.owner_name + " trả lời.";
        case "accepted": return r.owner_name + " đã đồng ý · Đến lấy tại: " + (r.pickup || "");
        case "declined": return r.owner_name + " đã từ chối yêu cầu.";
        case "cancelled": return "Bạn đã huỷ yêu cầu.";
        default: return "Sách không còn trên web.";
    }
}

// ---------- nút trên thanh công cụ: xoá thư đã xử lý ----------
const clearBtn = el("button", "clear-btn");
clearBtn.type = "button";
clearBtn.hidden = true;
clearBtn.append(iconEl("trash"), el("span", "", "Xoá thư đã xử lý"));

const toolbarActions = el("div", "toolbar-actions");
refreshBtn.replaceWith(toolbarActions);
toolbarActions.append(clearBtn, refreshBtn);

// ---------- chuyển giữa danh sách và thư ----------
function showListFrame() {
    toolbarEl.hidden = false;
    listEl.hidden = false;
    detailEl.hidden = true;
}

function showDetailFrame() {
    toolbarEl.hidden = true;
    listEl.hidden = true;
    detailEl.hidden = false;
}

function setActiveTab(kind) {
    tabs.in.classList.toggle("active", kind === "in");
    tabs.out.classList.toggle("active", kind === "out");
}

function setCount(node, n) {
    node.hidden = n === 0;
    node.textContent = n;
}

function updateCounts() {
    setCount(counts.in, incoming.filter(r => isUnread("in", r)).length);
    setCount(counts.out, outgoing.filter(r => isUnread("out", r)).length);
}

// ---------- xoá thư ----------
function goToList(kind) {
    const hash = kind === "in" ? "inbox" : "sent";
    if (location.hash.replace("#", "") === hash) route();
    else location.hash = hash;
}

async function deleteOne(kind, r) {
    if (!confirm("Xoá thư này? Thư chỉ biến mất ở phía bạn.")) return;

    try {
        const res = await fetch("/api/requests/" + r.id, { method: "DELETE" });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
            alert(data.error || "Không xoá được thư.");
            return;
        }
    } catch (err) {
        alert("Không kết nối được tới máy chủ.");
        return;
    }

    const list = kind === "in" ? incoming : outgoing;
    const index = list.findIndex(x => x.id === r.id);
    if (index >= 0) list.splice(index, 1);

    updateCounts();
    goToList(kind);
}

async function deleteAllDone(kind) {
    const data = kind === "in" ? incoming : outgoing;
    const n = data.filter(canDeleteMail).length;
    if (!n) return;

    if (!confirm("Xoá " + n + " thư đã xử lý? Thư đang chờ sẽ được giữ lại.")) return;

    clearBtn.disabled = true;
    try {
        const res = await fetch("/api/requests?box=" + kind, { method: "DELETE" });
        const result = await res.json().catch(() => ({}));
        if (!res.ok) {
            alert(result.error || "Không xoá được thư.");
            clearBtn.disabled = false;
            return;
        }
    } catch (err) {
        alert("Không kết nối được tới máy chủ.");
        clearBtn.disabled = false;
        return;
    }
    clearBtn.disabled = false;

    // giữ lại các thư đang chờ
    const keep = data.filter(r => !canDeleteMail(r));
    if (kind === "in") incoming = keep;
    else outgoing = keep;

    updateCounts();
    route();
}

clearBtn.addEventListener("click", () => deleteAllDone(currentKind));

// ---------- danh sách thư ----------
function makeRow(kind, r) {
    const unread = isUnread(kind, r);
    const person = kind === "in" ? r.requester_name : r.owner_name;
    const deletable = canDeleteMail(r);

    const row = el("div", "mail-row" + (unread ? " unread" : "") + (deletable ? " deletable" : ""));
    row.tabIndex = 0;
    row.setAttribute("role", "button");

    const from = el("span", "mail-from", kind === "in" ? person : "Đến: " + person);

    const text = el("span", "mail-text");
    text.append(
        "Yêu cầu nhận sách “" + r.book_title + "”",
        el("span", "mail-snippet", " – " + snippetText(kind, r))
    );

    row.append(
        makeAvatar(person),
        from,
        text,
        makeChip(kind, r.status, "row-chip"),
        el("span", "mail-time", listTime(r.created_at))
    );

    // nút xoá hiện khi rê chuột vào (chỉ thư đã xử lý)
    if (deletable) {
        const del = el("button", "row-delete");
        del.type = "button";
        del.title = "Xoá thư";
        del.setAttribute("aria-label", "Xoá thư");
        del.appendChild(iconEl("trash"));
        del.addEventListener("click", (event) => {
            event.stopPropagation();
            deleteOne(kind, r);
        });
        row.appendChild(del);
    }

    const open = () => {
        location.hash = (kind === "in" ? "in-" : "out-") + r.id;
    };
    row.addEventListener("click", open);
    row.addEventListener("keydown", (event) => {
        if (event.target === row && (event.key === "Enter" || event.key === " ")) {
            event.preventDefault();
            open();
        }
    });

    return row;
}

function emptyState(kind) {
    const box = el("div", "mail-empty");
    box.appendChild(iconEl(kind === "in" ? "inbox" : "send"));
    if (kind === "in") {
        box.append(
            strong("Hộp thư trống"),
            el("p", "", "Khi có người xin nhận sách bạn đăng, thông báo sẽ hiện ở đây.")
        );
    } else {
        box.append(
            strong("Chưa có yêu cầu nào"),
            el("p", "", "Mở một cuốn sách và bấm Nhận sách để gửi yêu cầu.")
        );
    }
    return box;
}

function showList(kind) {
    currentKind = kind;
    showListFrame();
    setActiveTab(kind);
    titleEl.textContent = kind === "in" ? "Hộp thư đến" : "Đã gửi";

    const data = kind === "in" ? incoming : outgoing;
    clearBtn.hidden = !data.some(canDeleteMail);

    listEl.replaceChildren();

    if (!data.length) {
        listEl.appendChild(emptyState(kind));
        return;
    }

    for (const r of data) listEl.appendChild(makeRow(kind, r));
}

function showError(message) {
    showListFrame();
    clearBtn.hidden = true;
    listEl.replaceChildren();

    const box = el("div", "mail-empty");
    box.append(
        iconEl("mail"),
        strong("Không tải được thông báo"),
        el("p", "", message)
    );

    const retry = el("button", "retry-btn", "Thử lại");
    retry.type = "button";
    retry.addEventListener("click", () => loadAll(false));
    box.appendChild(retry);

    listEl.appendChild(box);
}

// ---------- một thư ----------
function bookRef(r) {
    const text = "“" + r.book_title + "”";
    if (r.status !== "pending") return strong(text);
    const a = el("a", "mail-link", text);
    a.href = "/bookview/view.html?id=" + r.book_id;
    return a;
}

function pickupCard(label, pickup) {
    const box = el("div", "pickup-card");
    const text = el("div");
    text.append(el("div", "pickup-label", label), el("div", "pickup-value", pickup));
    box.append(iconEl("pin"), text);
    return box;
}

// nội dung thư
function bodyNodes(kind, r) {
    const book = bookRef(r);
    const nodes = [];

    if (kind === "in") {
        const who = strong(r.requester_name);
        switch (r.status) {
            case "pending":
                nodes.push(
                    para(who, " muốn nhận cuốn sách ", book, " của bạn."),
                    para("Nếu đồng ý, hãy chọn nơi trao sách bên dưới. Sau khi bạn bấm Đồng ý, sách sẽ bị xoá khỏi web.")
                );
                break;
            case "accepted":
                nodes.push(para("Bạn đã đồng ý tặng cuốn sách ", book, " cho ", who, "."));
                if (r.pickup) nodes.push(pickupCard("Nơi trao sách", r.pickup));
                break;
            case "declined":
                nodes.push(para("Bạn đã từ chối yêu cầu nhận sách ", book, " của ", who, "."));
                break;
            case "cancelled":
                nodes.push(para(who, " đã huỷ yêu cầu nhận cuốn sách ", book, "."));
                break;
            default:
                nodes.push(para("Cuốn sách ", book, " không còn trên web nên yêu cầu của ", who, " đã được đóng."));
        }
        return nodes;
    }

    const owner = strong(r.owner_name);
    switch (r.status) {
        case "pending":
            nodes.push(para("Bạn đã gửi yêu cầu nhận cuốn sách ", book, " cho ", owner, ". Hãy chờ người đăng trả lời."));
            break;
        case "accepted":
            nodes.push(para(owner, " đã đồng ý tặng bạn cuốn sách ", book, ". Hãy đến lấy sách đúng nơi bên dưới."));
            if (r.pickup) nodes.push(pickupCard("Đến lấy sách tại", r.pickup));
            break;
        case "declined":
            nodes.push(para(owner, " đã từ chối yêu cầu nhận cuốn sách ", book, "."));
            break;
        case "cancelled":
            nodes.push(para("Bạn đã huỷ yêu cầu nhận cuốn sách ", book, "."));
            break;
        default:
            nodes.push(para("Cuốn sách ", book, " không còn trên web."));
    }
    return nodes;
}

// gọi server rồi tải lại thư (thư sẽ tự đổi sang trạng thái mới)
async function act(url, button, confirmText, payload) {
    if (confirmText && !confirm(confirmText)) return;

    button.disabled = true;
    try {
        const options = { method: "POST" };
        if (payload) {
            options.headers = { "Content-Type": "application/json" };
            options.body = JSON.stringify(payload);
        }
        const res = await fetch(url, options);
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
            alert(data.error || "Không thực hiện được.");
        }
    } catch (err) {
        alert("Không kết nối được tới máy chủ.");
    }
    loadAll(true);
}

// một lựa chọn nơi trao sách (nút tròn)
function makeRadio(name, value, labelText, checked) {
    const label = el("label", "pickup-option");
    const input = document.createElement("input");
    input.type = "radio";
    input.name = name;
    input.value = value;
    input.checked = checked;
    label.append(input, el("span", "", labelText));
    return label;
}

// khung chọn nơi trao sách (người đăng chọn khi đồng ý)
function makePickupForm(r) {
    const form = el("div", "pickup-form");
    form.appendChild(el("p", "pickup-title", "Chọn nơi trao sách"));

    const name = "place-" + r.id;
    const options = el("div", "pickup-options");
    options.append(
        makeRadio(name, "phong-doi", "Phòng Đội", true),
        makeRadio(name, "lop", "Ở lớp", false)
    );

    const classInput = document.createElement("input");
    classInput.type = "text";
    classInput.className = "pickup-class";
    classInput.placeholder = "Lớp nào? Ví dụ: 8A";
    classInput.maxLength = 20;
    classInput.hidden = true;

    options.addEventListener("change", () => {
        const place = form.querySelector("input[name=" + name + "]:checked").value;
        classInput.hidden = place !== "lop";
        if (place === "lop") classInput.focus();
    });

    form.append(options, classInput);

    form.getChoice = () => ({
        place: form.querySelector("input[name=" + name + "]:checked").value,
        className: classInput.value.trim()
    });

    return form;
}

function showDetail(kind, r) {
    currentKind = kind;
    showDetailFrame();
    setActiveTab(kind);

    // thư đã xem thì không còn in đậm
    if (kind === "out") {
        markSeen(r);
        updateCounts();
    }

    detailEl.replaceChildren();

    const back = el("button", "back-btn");
    back.type = "button";
    back.append(iconEl("back"), el("span", "", "Quay lại"));
    back.addEventListener("click", () => {
        location.hash = kind === "in" ? "inbox" : "sent";
    });

    // nút xoá thư (chỉ thư đã xử lý)
    const topBar = el("div", "detail-top");
    topBar.appendChild(back);
    if (canDeleteMail(r)) {
        const del = el("button", "detail-delete");
        del.type = "button";
        del.append(iconEl("trash"), el("span", "", "Xoá thư"));
        del.addEventListener("click", () => deleteOne(kind, r));
        topBar.appendChild(del);
    }

    const subject = el("h2", "detail-subject");
    subject.append("Yêu cầu nhận sách “" + r.book_title + "”", makeChip(kind, r.status));

    // người gửi + giờ
    const person = kind === "in" ? r.requester_name : r.owner_name;
    const meta = el("div", "detail-meta");
    meta.append(
        el("div", "detail-name", person),
        el("div", "detail-sub", kind === "in" ? "tới tôi" : "người đăng sách")
    );

    const head = el("div", "detail-head");
    head.append(makeAvatar(person, true), meta, el("div", "detail-time", fullTime(r.created_at)));

    // nội dung + nút
    const body = el("div", "detail-body");
    body.append(...bodyNodes(kind, r));

    if (r.status === "pending") {
        if (kind === "in") {
            const pickupForm = makePickupForm(r);
            body.appendChild(pickupForm);

            const actions = el("div", "detail-actions");

            const accept = el("button", "btn-accept", "Đồng ý");
            accept.type = "button";
            accept.addEventListener("click", () => {
                const choice = pickupForm.getChoice();
                if (choice.place === "lop" && !choice.className) {
                    alert("Hãy ghi lớp nhận sách.");
                    return;
                }
                const where = choice.place === "lop" ? "Lớp " + choice.className : "Phòng Đội";
                act(
                    "/api/requests/" + r.id + "/accept",
                    accept,
                    "Tặng sách \"" + r.book_title + "\" cho " + r.requester_name +
                    ", trao tại " + where + "? Sách sẽ bị xoá khỏi web.",
                    choice
                );
            });

            const decline = el("button", "btn-decline", "Từ chối");
            decline.type = "button";
            decline.addEventListener("click", () =>
                act("/api/requests/" + r.id + "/decline", decline, "Từ chối yêu cầu này?")
            );

            actions.append(accept, decline);
            body.appendChild(actions);
        } else {
            const actions = el("div", "detail-actions");
            const cancel = el("button", "btn-cancel", "Huỷ yêu cầu");
            cancel.type = "button";
            cancel.addEventListener("click", () =>
                act("/api/requests/" + r.id + "/cancel", cancel, "Huỷ yêu cầu này?")
            );
            actions.appendChild(cancel);
            body.appendChild(actions);
        }
    }

    detailEl.append(topBar, subject, head, body);
}

// ---------- chọn màn hình theo địa chỉ (#inbox, #sent, #in-5, #out-7) ----------
function route() {
    if (!loaded) return;

    const hash = location.hash.replace("#", "");
    const match = hash.match(/^(in|out)-(\d+)$/);

    if (match) {
        const list = match[1] === "in" ? incoming : outgoing;
        const r = list.find(item => item.id === Number(match[2]));
        if (r) {
            showDetail(match[1], r);
            return;
        }
    }

    showList(hash === "sent" ? "out" : "in");
}

window.addEventListener("hashchange", route);

tabs.in.addEventListener("click", () => { location.hash = "inbox"; });
tabs.out.addEventListener("click", () => { location.hash = "sent"; });

refreshBtn.addEventListener("click", async () => {
    refreshBtn.classList.add("spinning");
    await loadAll(false);
    refreshBtn.classList.remove("spinning");
});

// ---------- tải dữ liệu ----------
async function loadAll(silent) {
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

        if (!inRes.ok || !outRes.ok) {
            throw new Error("máy chủ trả lỗi " + (inRes.ok ? outRes.status : inRes.status));
        }

        incoming = await inRes.json();
        outgoing = await outRes.json();
        loaded = true;

        updateCounts();
        route();
    } catch (err) {
        console.error(err);
        // tải ngầm bị lỗi thì giữ nguyên màn hình hiện tại
        if (silent && loaded) return;
        showError("Hãy thử tải lại sau ít phút (" + err.message + ").");
    }
}

// thư mới tự hiện, chỉ khi đang xem danh sách (không làm mất chữ đang chọn trong thư)
setInterval(() => {
    const inDetail = /^(in|out)-\d+$/.test(location.hash.replace("#", ""));
    if (!document.hidden && !inDetail) loadAll(true);
}, 30000);

loadAll(false);
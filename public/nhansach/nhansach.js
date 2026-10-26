const incomingBox = document.querySelector("#incoming-list");
const outgoingBox = document.querySelector("#outgoing-list");

function timeAgo(value) {
    const seconds = Math.floor((Date.now() - new Date(value).getTime()) / 1000);
    if (seconds < 60) return "Vừa xong";
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return minutes + " phút trước";
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return hours + " giờ trước";
    const days = Math.floor(hours / 24);
    if (days < 30) return days + " ngày trước";
    return new Date(value).toLocaleDateString("vi-VN");
}

function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
}

function strong(text) {
    return el("strong", "", text);
}

// link tới sách (chỉ khi sách còn)
function bookLink(r) {
    const a = el("a", "", "“" + r.book_title + "”");
    a.href = "/bookview/view.html?id=" + r.book_id;
    return a;
}

// khung thông báo chung: biểu tượng + nội dung
function makeCard(status, icon) {
    const card = el("div", "notify-card is-" + status);
    const iconBox = el("div", "notify-icon", icon);
    const body = el("div", "notify-body");
    card.append(iconBox, body);
    return { card, body };
}

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
        alert("chưa có người muốn xin sách của bạn");
    }
    loadAll();
}

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

function makePickupForm(r) {
    const form = el("div", "pickup-form");
    form.appendChild(el("p", "pickup-title", "Chọn nơi trao sách:"));

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

function incomingCard(r) {
    const { card, body } = makeCard(r.status, r.status === "pending" ? "📩" : ICONS[r.status]);

    const text = el("p", "notify-text");
    if (r.status === "pending") {
        text.append(strong(r.requester_name), " muốn nhận sách ", bookLink(r));
    } else if (r.status === "accepted") {
        text.append("Bạn đã đồng ý tặng sách “" + r.book_title + "” cho ", strong(r.requester_name));
    } else if (r.status === "declined") {
        text.append("Bạn đã từ chối ", strong(r.requester_name), " nhận sách “" + r.book_title + "”");
    } else if (r.status === "cancelled") {
        text.append(strong(r.requester_name), " đã huỷ yêu cầu nhận sách “" + r.book_title + "”");
    } else {
        text.append("Sách “" + r.book_title + "” không còn trên web (yêu cầu của ", strong(r.requester_name), " đã đóng)");
    }

    body.append(text, el("p", "notify-time", timeAgo(r.created_at)));

    if (r.status === "accepted" && r.pickup) {
        body.appendChild(el("p", "notify-pickup", "📍 Nơi trao sách: " + r.pickup));
    }

    if (r.status === "pending") {
        const pickupForm = makePickupForm(r);
        body.appendChild(pickupForm);

        const buttons = el("div", "notify-buttons");

        const accept = el("button", "btn-accept", "Đồng ý");
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
        decline.addEventListener("click", () =>
            act("/api/requests/" + r.id + "/decline", decline, "Từ chối yêu cầu này?")
        );

        buttons.append(accept, decline);
        body.appendChild(buttons);
    }

    return card;
}

// thông báo: sách mình đã xin
function outgoingCard(r) {
    const { card, body } = makeCard(r.status, ICONS[r.status] || "📩");

    const text = el("p", "notify-text");
    if (r.status === "pending") {
        text.append("Bạn đã xin nhận sách ", bookLink(r), " của ", strong(r.owner_name), ", đang chờ đồng ý");
    } else if (r.status === "accepted") {
        text.append(strong(r.owner_name), " đã đồng ý tặng bạn sách “" + r.book_title + "”");
    } else if (r.status === "declined") {
        text.append(strong(r.owner_name), " đã từ chối yêu cầu nhận sách “" + r.book_title + "”");
    } else if (r.status === "cancelled") {
        text.append("Bạn đã huỷ yêu cầu nhận sách “" + r.book_title + "”");
    } else {
        text.append("Sách “" + r.book_title + "” không còn trên web");
    }

    body.append(text, el("p", "notify-time", timeAgo(r.created_at)));

    if (r.status === "accepted" && r.pickup) {
        body.appendChild(el("p", "notify-pickup", "📍 Đến lấy sách tại: " + r.pickup));
    }

    if (r.status === "pending") {
        const buttons = el("div", "notify-buttons");
        const cancel = el("button", "btn-cancel", "Huỷ yêu cầu");
        cancel.addEventListener("click", () =>
            act("/api/requests/" + r.id + "/cancel", cancel, "Huỷ yêu cầu này?")
        );
        buttons.appendChild(cancel);
        body.appendChild(buttons);
    }

    return card;
}

function render(box, list, makeOne, emptyText) {
    box.replaceChildren();

    if (!list.length) {
        box.appendChild(el("p", "empty", emptyText));
        return;
    }

    for (const r of list) box.appendChild(makeOne(r));
}

async function loadAll() {
    try {
        const [inRes, outRes] = await Promise.all([
            fetch("/api/requests/incoming"),
            fetch("/api/requests/outgoing")
        ]);

        if (inRes.status === 401 || outRes.status === 401) {
            window.location.href = "/dangnhap_dangki/dangnhap.html";
            return;
        }

        render(incomingBox, await inRes.json(), incomingCard, "Chưa có ai xin nhận sách của bạn.");
        render(outgoingBox, await outRes.json(), outgoingCard, "Bạn chưa xin nhận sách nào.");
    } catch (err) {
        incomingBox.textContent = "Không kết nối được tới máy chủ.";
        outgoingBox.textContent = "";
    }
}

loadAll();
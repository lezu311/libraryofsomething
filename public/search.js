const searchBar = document.querySelector(".search-bar");
const resultsBox = document.querySelector(".search-results");

let currentCategory = ""; // mục đang chọn trong cây danh mục
let requestCount = 0;     // để bỏ qua kết quả cũ về trễ

function makeCard(book) {
    const card = document.createElement("a");
    card.className = "search-result";
    card.href = "/bookview/view.html?id=" + book.id;

    let cover;
    if (book.cover) {
        cover = document.createElement("img");
        cover.src = "/covers/" + book.cover;
        cover.alt = "Cover of " + book.title;
    } else {
        cover = document.createElement("div");
        cover.className = "cover-placeholder";
    }

    const title = document.createElement("p");
    title.className = "title";
    title.textContent = book.title; // textContent keeps user text harmless

    card.append(cover, title);
    return card;
}

async function search(query) {
    const myRequest = ++requestCount;

    const url = "/api/books?q=" + encodeURIComponent(query) +
        "&category=" + encodeURIComponent(currentCategory);
    const res = await fetch(url);
    const books = await res.json();

    if (myRequest !== requestCount) return; // đã có lần tìm mới hơn

    resultsBox.replaceChildren();

    if (books.length === 0) {
        resultsBox.textContent = currentCategory
            ? "Chưa có sách nào trong mục này."
            : "No books match that title";
        return;
    }

    for (const book of books) {
        resultsBox.appendChild(makeCard(book));
    }
}

// wait until the user stops typing for 250 ms before asking the server
let timer;
searchBar.addEventListener("input", () => {
    clearTimeout(timer);
    timer = setTimeout(() => search(searchBar.value), 250);
});

search(""); // show everything on page load
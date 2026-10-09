const searchBar = document.querySelector(".search-bar");
const resultsBox = document.querySelector(".search-results");

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
    const res = await fetch("/api/books?q=" + encodeURIComponent(query));
    const books = await res.json();

    resultsBox.replaceChildren();

    if (books.length === 0) {
        resultsBox.textContent = "No books match that title";
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
